import { getSupabaseServiceRoleClient } from './supabase';
import { isStoreProductInStock } from './storeProducts';

/** Metadata de Stripe que identifica un pago de pedido de tienda. */
export const STRIPE_META_STORE_ORDER = 'store_order';

/** Máximo de unidades por línea (defensa frente a payloads abusivos). */
const MAX_QUANTITY_PER_ITEM = 50;
/** Máximo de líneas distintas por pedido. */
const MAX_ITEMS_PER_ORDER = 50;

export interface CartItemInput {
  product_id: string;
  quantity: number;
}

export interface PricedCartItem {
  product_id: string;
  product_name: string;
  product_brand: string | null;
  image_url: string | null;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

type ValidateOk = { ok: true; items: PricedCartItem[]; subtotalCents: number };
type ValidateFail = { ok: false; error: string };

type Supabase = ReturnType<typeof getSupabaseServiceRoleClient>;

function parseQuantity(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Normaliza el payload del carrito, sumando cantidades de líneas duplicadas. */
export function normalizeCartItems(raw: unknown): { ok: true; items: CartItemInput[] } | ValidateFail {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'El carrito está vacío' };
  }

  const merged = new Map<string, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'Ítem de carrito inválido' };
    }
    const productId = String((entry as Record<string, unknown>).product_id ?? '').trim();
    const quantity = parseQuantity((entry as Record<string, unknown>).quantity);
    if (!productId) return { ok: false, error: 'Falta product_id en un ítem del carrito' };
    if (quantity == null) return { ok: false, error: 'Cantidad inválida en el carrito' };
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }

  if (merged.size > MAX_ITEMS_PER_ORDER) {
    return { ok: false, error: 'Demasiados productos distintos en el carrito' };
  }

  const items: CartItemInput[] = [];
  for (const [product_id, quantity] of merged.entries()) {
    if (quantity > MAX_QUANTITY_PER_ITEM) {
      return { ok: false, error: `No puedes comprar más de ${MAX_QUANTITY_PER_ITEM} unidades del mismo producto` };
    }
    items.push({ product_id, quantity });
  }
  return { ok: true, items };
}

/**
 * Revalida el carrito contra la base de datos y calcula los importes en el
 * servidor (nunca se confía en el precio enviado por el cliente). Verifica que
 * el producto está activo y que hay stock suficiente.
 */
export async function validateAndPriceCart(
  supabase: Supabase,
  items: CartItemInput[],
): Promise<ValidateOk | ValidateFail> {
  const ids = items.map((i) => i.product_id);
  const { data: products, error } = await supabase
    .from('store_products')
    .select('id, name, brand, price_cents, stock_quantity, image_url, is_active')
    .in('id', ids);

  if (error) return { ok: false, error: error.message };

  const byId = new Map((products ?? []).map((p) => [String(p.id), p]));
  const priced: PricedCartItem[] = [];
  let subtotalCents = 0;

  for (const item of items) {
    const product = byId.get(item.product_id);
    if (!product || !product.is_active) {
      return { ok: false, error: 'Uno de los productos ya no está disponible' };
    }
    if (!isStoreProductInStock(product.stock_quantity) || product.stock_quantity < item.quantity) {
      return {
        ok: false,
        error: `Stock insuficiente para "${product.name}" (quedan ${Math.max(0, Number(product.stock_quantity))})`,
      };
    }
    const unitPrice = Number(product.price_cents);
    const lineTotal = unitPrice * item.quantity;
    subtotalCents += lineTotal;
    priced.push({
      product_id: item.product_id,
      product_name: String(product.name),
      product_brand: (product.brand as string | null) ?? null,
      image_url: (product.image_url as string | null) ?? null,
      unit_price_cents: unitPrice,
      quantity: item.quantity,
      line_total_cents: lineTotal,
    });
  }

  if (subtotalCents <= 0) {
    return { ok: false, error: 'El importe del pedido no es válido' };
  }

  return { ok: true, items: priced, subtotalCents };
}

/**
 * Finaliza un pedido tras el pago confirmado en Stripe. Idempotente: si el
 * pedido ya está pagado no vuelve a descontar stock.
 */
export async function finalizeStoreOrder(params: {
  paymentIntentId: string;
  playerId: string;
}): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: order, error: orderErr } = await supabase
    .from('store_orders')
    .select('id, player_id, status')
    .eq('stripe_payment_intent_id', params.paymentIntentId)
    .maybeSingle();

  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order) return { ok: false, error: 'Pedido no encontrado para este pago' };
  if (String(order.player_id) !== params.playerId) {
    return { ok: false, error: 'No eres el comprador de este pedido' };
  }

  // Idempotencia: ya procesado.
  if (order.status === 'paid') {
    return { ok: true, orderId: String(order.id) };
  }

  const { data: items, error: itemsErr } = await supabase
    .from('store_order_items')
    .select('product_id, quantity')
    .eq('order_id', order.id);

  if (itemsErr) return { ok: false, error: itemsErr.message };

  // Marcar pagado primero (evita doble descuento si hay reintentos concurrentes).
  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from('store_orders')
    .update({ status: 'paid', paid_at: nowIso, updated_at: nowIso })
    .eq('id', order.id)
    .eq('status', 'pending_payment')
    .select('id')
    .maybeSingle();

  if (updErr) return { ok: false, error: updErr.message };
  // Otro proceso lo marcó pagado mientras tanto: no descontar de nuevo.
  if (!updated) return { ok: true, orderId: String(order.id) };

  await decrementStockForItems(supabase, items ?? []);

  return { ok: true, orderId: String(order.id) };
}

/** Descuenta stock y registra el movimiento de auditoría (reason 'sale'). Best-effort. */
async function decrementStockForItems(
  supabase: Supabase,
  items: { product_id: string | null; quantity: number }[],
): Promise<void> {
  for (const item of items) {
    if (!item.product_id) continue;
    try {
      const { data: product } = await supabase
        .from('store_products')
        .select('stock_quantity')
        .eq('id', item.product_id)
        .maybeSingle();
      if (!product) continue;

      const current = Number(product.stock_quantity ?? 0);
      const nextStock = Math.max(0, current - item.quantity);
      const delta = nextStock - current;

      await supabase
        .from('store_products')
        .update({ stock_quantity: nextStock, updated_at: new Date().toISOString() })
        .eq('id', item.product_id);

      if (delta !== 0) {
        await supabase.from('store_stock_movements').insert({
          product_id: item.product_id,
          quantity_delta: delta,
          quantity_after: nextStock,
          reason: 'sale',
          note: 'Venta tienda (mobile-app)',
        });
      }
    } catch (err) {
      console.error('[storeCheckout] decrementStockForItems', item.product_id, err);
    }
  }
}
