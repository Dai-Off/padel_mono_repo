import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdminOrPortalStaff } from '../middleware/requireClubOwnerOrAdminOrPortalStaff';
import { canAccessClub } from '../lib/clubAccess';
import {
  checkWalletBalances,
  computeBookingStatus,
  resolveBookingChargeCents,
  upsertManualPayments,
  type BookingChargeScope,
} from '../lib/bookingManualPayment';

const router = Router();
router.use(attachAuthContext);

const ITEM_FIELDS =
  'id, club_id, category_id, name, sku, unit, status, unit_price_cents, currency, low_stock_threshold, image_url, quick_sale_enabled, created_at, updated_at, inventory_categories(id, name)';
const CATEGORY_FIELDS = 'id, club_id, name, created_at, updated_at';
const MOVEMENT_FIELDS = 'id, club_id, item_id, movement_type, quantity, reason, movement_at, created_at';

function isMissingRelationError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes('relation') && m.includes('does not exist')) ||
    m.includes('does not exist') ||
    m.includes('no such table') ||
    m.includes('schema cache') ||
    (m.includes('could not find') && m.includes('relationship'))
  );
}

type InventoryMovementType = 'in' | 'out';
type InventorySaleLineInput = { item_id?: string; quantity?: number; name?: string; unit_price_cents?: number };
type BookingChargeInput = { booking_id?: string; charge_scope?: string };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (JPEG, PNG, WebP, GIF)'));
  },
});

const BUCKET = 'inventory-images';

/**
 * @openapi
 * /inventario/categories:
 *   get:
 *     tags: [Inventory]
 *     summary: Listar categorías de inventario
 *     description: Devuelve las categorías creadas para un club, ordenadas por nombre.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del club
 *     responses:
 *       200:
 *         description: Categorías encontradas
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   categories:
 *                     - id: "11111111-1111-1111-1111-111111111111"
 *                       club_id: "22222222-2222-2222-2222-222222222222"
 *                       name: "Bebidas"
 *       400: { description: club_id obligatorio }
 *       403: { description: Sin acceso al club }
 *       500: { description: Error interno }
 */
router.get('/categories', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  if (!club_id?.trim()) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id, 'gestion')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('inventory_categories')
      .select(CATEGORY_FIELDS)
      .eq('club_id', club_id)
      .order('name', { ascending: true });
    if (error) {
      if (isMissingRelationError(error.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_categories no existe.' });
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.json({ ok: true, categories: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /inventario/categories:
 *   post:
 *     tags: [Inventory]
 *     summary: Crear categoría de inventario
 *     description: Crea una categoría para clasificar productos del carrito e inventario.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, name]
 *             properties:
 *               club_id: { type: string, format: uuid, description: ID del club }
 *               name: { type: string, example: "Grips", description: Nombre visible de la categoría }
 *           examples:
 *             create:
 *               value:
 *                 club_id: "22222222-2222-2222-2222-222222222222"
 *                 name: "Bebidas"
 *     responses:
 *       201:
 *         description: Categoría creada
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   category:
 *                     id: "11111111-1111-1111-1111-111111111111"
 *                     club_id: "22222222-2222-2222-2222-222222222222"
 *                     name: "Bebidas"
 *       400: { description: club_id y name obligatorios }
 *       403: { description: Sin acceso al club }
 *       500: { description: Error interno }
 */
router.post('/categories', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { club_id, name } = req.body ?? {};
  const clubIdStr = String(club_id ?? '').trim();
  const nameStr = String(name ?? '').trim();
  if (!clubIdStr || !nameStr) return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  if (!canAccessClub(req, clubIdStr, 'gestion')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('inventory_categories')
      .insert({ club_id: clubIdStr, name: nameStr })
      .select(CATEGORY_FIELDS)
      .single();
    if (error) {
      if (isMissingRelationError(error.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_categories no existe.' });
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(201).json({ ok: true, category: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /inventario/items
 * Lista productos y calcula stock actual a partir de inventory_movements.
 */
router.get('/items', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  if (!club_id?.trim()) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id, 'gestion')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: items, error: itemsErr } = await supabase
      .from('inventory_items')
      .select(ITEM_FIELDS)
      .eq('club_id', club_id)
      .order('created_at', { ascending: false });

    if (itemsErr) {
      if (isMissingRelationError(itemsErr.message)) {
        return res.status(503).json({
          ok: false,
          error: 'Tablas inventory_items/inventory_movements no existen. Aplica las migraciones en Supabase.',
        });
      }
      return res.status(500).json({ ok: false, error: itemsErr.message });
    }

    const { data: movements, error: movementsErr } = await supabase
      .from('inventory_movements')
      .select('item_id, movement_type, quantity')
      .eq('club_id', club_id);

    if (movementsErr) {
      if (isMissingRelationError(movementsErr.message)) {
        return res.status(503).json({
          ok: false,
          error: 'Tabla inventory_movements no existe. Aplica la migración en Supabase.',
        });
      }
      return res.status(500).json({ ok: false, error: movementsErr.message });
    }

    const stockByItem = new Map<string, number>();
    for (const m of movements ?? []) {
      const itemId = String((m as any).item_id ?? '');
      const movementType = (String((m as any).movement_type ?? '') as InventoryMovementType) || 'in';
      const qty = Number((m as any).quantity ?? 0);
      if (!itemId || !Number.isFinite(qty)) continue;
      const sign = movementType === 'out' ? -1 : 1;
      stockByItem.set(itemId, (stockByItem.get(itemId) ?? 0) + sign * Math.trunc(qty));
    }

    const enriched = (items ?? []).map((it: any) => ({
      ...it,
      current_quantity: stockByItem.get(String(it.id)) ?? 0,
    }));

    return res.json({ ok: true, items: enriched });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /inventario/items
 * Crea un producto (inventario_item).
 */
router.post('/items', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { club_id, category_id, name, sku, unit, status, unit_price_cents, currency, low_stock_threshold, image_url, initial_stock, quick_sale_enabled } =
    req.body ?? {};
  const clubIdStr = String(club_id ?? '').trim();
  const categoryIdStr = category_id == null || !String(category_id).trim() ? null : String(category_id).trim();
  const nameStr = String(name ?? '').trim();

  const priceCents = Number(unit_price_cents ?? 0);
  const lowThreshold = Number(low_stock_threshold ?? 0);
  const initialStock = Number(initial_stock ?? 0);
  const currencyStr = String(currency ?? 'EUR').trim() || 'EUR';

  if (!clubIdStr || !nameStr) return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  if (!canAccessClub(req, clubIdStr, 'gestion')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  if (!Number.isFinite(priceCents) || priceCents < 0) return res.status(400).json({ ok: false, error: 'unit_price_cents inválido' });
  if (!Number.isFinite(lowThreshold) || lowThreshold < 0) return res.status(400).json({ ok: false, error: 'low_stock_threshold inválido' });
  if (!Number.isFinite(initialStock) || initialStock < 0) return res.status(400).json({ ok: false, error: 'initial_stock inválido' });

  const row: Record<string, unknown> = {
    club_id: clubIdStr,
    category_id: categoryIdStr,
    name: nameStr,
    sku: sku != null && String(sku).trim() ? String(sku).trim() : null,
    unit: unit != null && String(unit).trim() ? String(unit).trim() : null,
    status: status === 'inactive' ? 'inactive' : 'active',
    unit_price_cents: Math.trunc(priceCents),
    currency: currencyStr,
    low_stock_threshold: Math.trunc(lowThreshold),
    image_url: image_url == null || !String(image_url).trim() ? null : String(image_url).trim(),
    quick_sale_enabled: quick_sale_enabled === true || quick_sale_enabled === 'true',
  };

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase.from('inventory_items').insert(row).select(ITEM_FIELDS).single();
    if (error) {
      if (isMissingRelationError(error.message)) {
        return res.status(503).json({ ok: false, error: 'Tabla inventory_items no existe. Aplica la migración en Supabase.' });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }
    const initialStockInt = Math.trunc(initialStock);
    if (initialStockInt > 0) {
      const { error: movementErr } = await supabase.from('inventory_movements').insert({
        club_id: clubIdStr,
        item_id: (data as { id: string }).id,
        movement_type: 'in',
        quantity: initialStockInt,
        reason: 'Stock inicial',
        movement_at: new Date().toISOString(),
      });
      if (movementErr) return res.status(500).json({ ok: false, error: movementErr.message });
      return res.status(201).json({ ok: true, item: { ...(data as Record<string, unknown>), current_quantity: initialStockInt } });
    }
    return res.status(201).json({ ok: true, item: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * PUT /inventario/items/{id}
 * Actualiza un producto.
 */
router.put('/items/:id', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing } = await supabase.from('inventory_items').select('club_id').eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    if (!canAccessClub(req, String((existing as any).club_id), 'gestion')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  } catch {
    return res.status(500).json({ ok: false, error: 'Error al verificar producto' });
  }

  const { name, sku, unit, status, unit_price_cents, currency, low_stock_threshold, image_url, category_id, quick_sale_enabled } = req.body ?? {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) update.name = String(name).trim();
  if (category_id !== undefined) update.category_id = category_id == null || !String(category_id).trim() ? null : String(category_id).trim();
  if (sku !== undefined) update.sku = sku == null || !String(sku).trim() ? null : String(sku).trim();
  if (unit !== undefined) update.unit = unit == null || !String(unit).trim() ? null : String(unit).trim();
  if (status !== undefined) update.status = status === 'inactive' ? 'inactive' : 'active';
  if (unit_price_cents !== undefined) {
    const n = Number(unit_price_cents);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ ok: false, error: 'unit_price_cents inválido' });
    update.unit_price_cents = Math.trunc(n);
  }
  if (currency !== undefined) {
    const c = String(currency ?? '').trim();
    update.currency = c || 'EUR';
  }
  if (low_stock_threshold !== undefined) {
    const n = Number(low_stock_threshold);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ ok: false, error: 'low_stock_threshold inválido' });
    update.low_stock_threshold = Math.trunc(n);
  }
  if (image_url !== undefined) {
    update.image_url = image_url == null || !String(image_url).trim() ? null : String(image_url).trim();
  }
  if (quick_sale_enabled !== undefined) {
    update.quick_sale_enabled = quick_sale_enabled === true || quick_sale_enabled === 'true';
  }

  if (Object.keys(update).length === 1) return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase.from('inventory_items').update(update).eq('id', id).select(ITEM_FIELDS).maybeSingle();
    if (error) {
      if (isMissingRelationError(error.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_items no existe.' });
      return res.status(500).json({ ok: false, error: error.message });
    }
    if (!data) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    return res.json({ ok: true, item: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * DELETE /inventario/items/{id}
 * Elimina un producto.
 */
router.delete('/items/:id', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing } = await supabase.from('inventory_items').select('club_id').eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    if (!canAccessClub(req, String((existing as any).club_id), 'gestion')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /inventario/movements
 * Lista movimientos del inventario (para auditoría).
 */
router.get('/movements', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  const item_id = req.query.item_id as string | undefined;
  if (!club_id?.trim()) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id, 'gestion')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase.from('inventory_movements').select(MOVEMENT_FIELDS).eq('club_id', club_id);
    if (item_id?.trim()) q = q.eq('item_id', item_id.trim());
    q = q.order('movement_at', { ascending: false }).order('created_at', { ascending: false }).limit(100);

    const { data, error } = await q;
    if (error) {
      if (isMissingRelationError(error.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_movements no existe.' });
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, movements: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /inventario/movements
 * Crea un movimiento de stock (entrada/salida).
 */
router.post('/movements', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { club_id, item_id, movement_type, quantity, reason, movement_at } = req.body ?? {};

  const clubIdStr = String(club_id ?? '').trim();
  const itemIdStr = String(item_id ?? '').trim();
  const typeStr = String(movement_type ?? '').trim();
  const qty = Number(quantity ?? 0);

  if (!clubIdStr || !itemIdStr) return res.status(400).json({ ok: false, error: 'club_id y item_id son obligatorios' });
  if (typeStr !== 'in' && typeStr !== 'out') return res.status(400).json({ ok: false, error: 'movement_type debe ser in u out' });
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ ok: false, error: 'quantity debe ser un número > 0' });
  if (!canAccessClub(req, clubIdStr, 'gestion')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  let movementAtIso: string | null = null;
  if (movement_at != null && String(movement_at).trim()) {
    const d = new Date(String(movement_at));
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ ok: false, error: 'movement_at inválido (usa fecha/hora ISO o YYYY-MM-DD)' });
    }
    movementAtIso = d.toISOString();
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: itemRow, error: itemErr } = await supabase
      .from('inventory_items')
      .select('id')
      .eq('id', itemIdStr)
      .eq('club_id', clubIdStr)
      .maybeSingle();

    if (itemErr) {
      if (isMissingRelationError(itemErr.message)) {
        return res.status(503).json({ ok: false, error: 'Tabla inventory_items no existe. Aplica la migración en Supabase.' });
      }
      return res.status(500).json({ ok: false, error: itemErr.message });
    }
    if (!itemRow) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    if (typeStr === 'out') {
      // Validación: no permitir que el stock quede negativo.
      const { data: movements, error: movErr } = await supabase
        .from('inventory_movements')
        .select('movement_type, quantity')
        .eq('club_id', clubIdStr)
        .eq('item_id', itemIdStr);

      if (movErr) {
        if (isMissingRelationError(movErr.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_movements no existe.' });
        return res.status(500).json({ ok: false, error: movErr.message });
      }

      let currentStock = 0;
      for (const m of movements ?? []) {
        const movementType = String((m as any).movement_type ?? '') as InventoryMovementType;
        const q = Number((m as any).quantity ?? 0);
        const sign = movementType === 'out' ? -1 : 1;
        if (Number.isFinite(q) && q > 0) currentStock += sign * Math.trunc(q);
      }

      if (currentStock - Math.trunc(qty) < 0) {
        return res.status(400).json({ ok: false, error: 'No puedes restar más stock del disponible' });
      }
    }

    const row: Record<string, unknown> = {
      club_id: clubIdStr,
      item_id: itemIdStr,
      movement_type: typeStr,
      quantity: Math.trunc(qty),
      reason: reason != null && String(reason).trim() ? String(reason).trim() : null,
    };
    row.movement_at = movementAtIso ?? new Date().toISOString();

    const { data, error } = await supabase.from('inventory_movements').insert(row).select(MOVEMENT_FIELDS).single();
    if (error) {
      if (isMissingRelationError(error.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_movements no existe.' });
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(201).json({ ok: true, movement: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /inventario/sales:
 *   post:
 *     tags: [Inventory]
 *     summary: Registrar venta de carrito (productos y/o cobro de turnos)
 *     description: |
 *       Registra venta de tienda (productos), cobro de uno o más turnos del jugador, o ambos en un mismo ticket.
 *       `booking_id` es opcional (referencia de auditoría para productos). `booking_charges` cobra turnos
 *       (completo o parte del jugador). Puede omitirse turno si solo hay productos.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, player_id, payment_method]
 *             properties:
 *               club_id: { type: string, format: uuid, description: ID del club }
 *               booking_id: { type: string, format: uuid, description: Turno de referencia opcional para productos }
 *               player_id: { type: string, format: uuid, description: Jugador/cliente que paga }
 *               payment_method:
 *                 type: string
 *                 enum: [cash, card, wallet]
 *                 description: Método de cobro del importe en efectivo/tarjeta (wallet = saldo bono)
 *               wallet_amount_cents:
 *                 type: integer
 *                 minimum: 0
 *                 description: Importe total a descontar del monedero (productos + turnos)
 *               booking_charges:
 *                 type: array
 *                 description: Turnos a cobrar en el mismo ticket
 *                 items:
 *                   type: object
 *                   required: [booking_id, charge_scope]
 *                   properties:
 *                     booking_id: { type: string, format: uuid }
 *                     charge_scope:
 *                       type: string
 *                       enum: [full, player_share]
 *                       description: full = saldo pendiente del turno; player_share = parte del jugador
 *               lines:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [quantity]
 *                   properties:
 *                     item_id: { type: string, format: uuid }
 *                     name: { type: string, example: "Venta excepcional" }
 *                     unit_price_cents: { type: integer, minimum: 0 }
 *                     quantity: { type: integer, minimum: 1, example: 2 }
 *           examples:
 *             productsOnly:
 *               value:
 *                 club_id: "11111111-1111-1111-1111-111111111111"
 *                 player_id: "33333333-3333-3333-3333-333333333333"
 *                 payment_method: "cash"
 *                 lines:
 *                   - item_id: "44444444-4444-4444-4444-444444444444"
 *                     quantity: 1
 *             bookingAndProducts:
 *               value:
 *                 club_id: "11111111-1111-1111-1111-111111111111"
 *                 player_id: "33333333-3333-3333-3333-333333333333"
 *                 payment_method: "card"
 *                 booking_charges:
 *                   - booking_id: "22222222-2222-2222-2222-222222222222"
 *                     charge_scope: full
 *                 lines:
 *                   - item_id: "44444444-4444-4444-4444-444444444444"
 *                     quantity: 2
 *     responses:
 *       201:
 *         description: Venta registrada
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   sale:
 *                     id: "1715440000000"
 *                     player_id: "33333333-3333-3333-3333-333333333333"
 *                     payment_method: "cash"
 *                     total_cents: 2500
 *                     products_cents: 500
 *                     bookings_cents: 2000
 *                     currency: "EUR"
 *       400: { description: Datos inválidos, jugador fuera del turno, precio inválido o stock insuficiente }
 *       401: { description: Token requerido }
 *       403: { description: Sin acceso al club }
 *       404: { description: Turno o producto no encontrado }
 *       500: { description: Error interno }
 */
router.post('/sales', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { club_id, booking_id, player_id, payment_method, wallet_amount_cents, lines, booking_charges } = req.body ?? {};
  const clubIdStr = String(club_id ?? '').trim();
  const bookingIdStr = String(booking_id ?? '').trim();
  const playerIdStr = String(player_id ?? '').trim();
  const methodStr = String(payment_method ?? '').trim();
  const requestedWalletCents = Math.max(0, Math.trunc(Number(wallet_amount_cents ?? 0)));
  const rawLines = Array.isArray(lines) ? lines as InventorySaleLineInput[] : [];
  const rawBookingCharges = Array.isArray(booking_charges) ? booking_charges as BookingChargeInput[] : [];

  if (!clubIdStr || !playerIdStr) {
    return res.status(400).json({ ok: false, error: 'club_id y player_id son obligatorios' });
  }
  if (methodStr !== 'cash' && methodStr !== 'card' && methodStr !== 'wallet') {
    return res.status(400).json({ ok: false, error: 'payment_method debe ser cash, card o wallet' });
  }
  if (!canAccessClub(req, clubIdStr, 'gestion')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  const saleLines = rawLines
    .map((line) => ({
      item_id: String(line.item_id ?? '').trim(),
      quantity: Math.trunc(Number(line.quantity ?? 0)),
      name: String(line.name ?? '').trim(),
      unit_price_cents: Math.trunc(Number(line.unit_price_cents ?? 0)),
    }))
    .filter((line) => line.quantity > 0 && (line.item_id || line.name));

  const bookingChargeInputs = rawBookingCharges
    .map((row) => ({
      booking_id: String(row.booking_id ?? '').trim(),
      charge_scope: String(row.charge_scope ?? 'player_share').trim() as BookingChargeScope,
    }))
    .filter((row) => row.booking_id);

  const seenBookingIds = new Set<string>();
  for (const row of bookingChargeInputs) {
    if (seenBookingIds.has(row.booking_id)) {
      return res.status(400).json({ ok: false, error: 'No repitas el mismo turno en el carrito' });
    }
    seenBookingIds.add(row.booking_id);
    if (row.charge_scope !== 'full' && row.charge_scope !== 'player_share') {
      return res.status(400).json({ ok: false, error: 'charge_scope debe ser full o player_share' });
    }
  }

  if (saleLines.length === 0 && bookingChargeInputs.length === 0) {
    return res.status(400).json({ ok: false, error: 'Añade productos o al menos un turno a cobrar' });
  }

  const inventorySaleLines = saleLines.filter((line) => line.item_id);
  const customSaleLines = saleLines.filter((line) => !line.item_id);
  for (const line of customSaleLines) {
    if (!line.name) return res.status(400).json({ ok: false, error: 'Nombre obligatorio para venta excepcional' });
    if (!Number.isFinite(line.unit_price_cents) || line.unit_price_cents <= 0) {
      return res.status(400).json({ ok: false, error: 'Precio inválido para venta excepcional' });
    }
  }

  const linkBookingIdStr =
    bookingIdStr ||
    bookingChargeInputs[0]?.booking_id ||
    '';

  try {
    const supabase = getSupabaseServiceRoleClient();

    if (bookingIdStr && bookingChargeInputs.length === 0) {
      const { data: booking, error: bookingErr } = await supabase
        .from('bookings')
        .select('id, status, organizer_player_id, currency, courts(club_id), booking_participants(player_id)')
        .eq('id', bookingIdStr)
        .maybeSingle();

      if (bookingErr) return res.status(500).json({ ok: false, error: bookingErr.message });
      if (!booking) return res.status(404).json({ ok: false, error: 'Turno no encontrado' });

      const court = Array.isArray((booking as any).courts) ? (booking as any).courts[0] : (booking as any).courts;
      if (String(court?.club_id ?? '') !== clubIdStr) {
        return res.status(400).json({ ok: false, error: 'El turno no pertenece a este club' });
      }
      if (String((booking as any).status ?? '') === 'cancelled') {
        return res.status(400).json({ ok: false, error: 'No se puede asociar una venta a un turno cancelado' });
      }

      const participantIds = new Set<string>();
      if ((booking as any).organizer_player_id) participantIds.add(String((booking as any).organizer_player_id));
      for (const participant of (booking as any).booking_participants ?? []) {
        if (participant?.player_id) participantIds.add(String(participant.player_id));
      }
      if (!participantIds.has(playerIdStr)) {
        return res.status(400).json({ ok: false, error: 'El jugador seleccionado no figura en ese turno' });
      }
    }

    const quantitiesByItem = new Map<string, number>();
    for (const line of inventorySaleLines) {
      quantitiesByItem.set(line.item_id, (quantitiesByItem.get(line.item_id) ?? 0) + line.quantity);
    }
    const itemIds = [...quantitiesByItem.keys()];

    let itemRows: any[] = [];
    if (itemIds.length > 0) {
      const { data, error: itemErr } = await supabase
        .from('inventory_items')
        .select('id, club_id, name, status, unit_price_cents, currency')
        .eq('club_id', clubIdStr)
        .in('id', itemIds);

      if (itemErr) {
        if (isMissingRelationError(itemErr.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_items no existe.' });
        return res.status(500).json({ ok: false, error: itemErr.message });
      }
      itemRows = data ?? [];
    }
    if ((itemRows ?? []).length !== itemIds.length) {
      return res.status(404).json({ ok: false, error: 'Uno o más productos no existen' });
    }

    const itemById = new Map((itemRows ?? []).map((item: any) => [String(item.id), item]));
    const inactive = [...itemById.values()].find((item: any) => item.status !== 'active');
    if (inactive) return res.status(400).json({ ok: false, error: `Producto inactivo: ${inactive.name}` });

    let movementRows: any[] = [];
    if (itemIds.length > 0) {
      const { data, error: movementErr } = await supabase
        .from('inventory_movements')
        .select('item_id, movement_type, quantity')
        .eq('club_id', clubIdStr)
        .in('item_id', itemIds);

      if (movementErr) {
        if (isMissingRelationError(movementErr.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_movements no existe.' });
        return res.status(500).json({ ok: false, error: movementErr.message });
      }
      movementRows = data ?? [];
    }

    const stockByItem = new Map<string, number>();
    for (const movement of movementRows ?? []) {
      const itemId = String((movement as any).item_id ?? '');
      const qty = Math.trunc(Number((movement as any).quantity ?? 0));
      if (!itemId || !Number.isFinite(qty)) continue;
      const sign = String((movement as any).movement_type ?? '') === 'out' ? -1 : 1;
      stockByItem.set(itemId, (stockByItem.get(itemId) ?? 0) + sign * qty);
    }

    for (const [itemId, qty] of quantitiesByItem) {
      const available = stockByItem.get(itemId) ?? 0;
      if (available < qty) {
        const item = itemById.get(itemId) as any;
        return res.status(400).json({ ok: false, error: `Stock insuficiente para ${item?.name ?? 'producto'} (${available} disponible)` });
      }
    }

    const resolvedCharges: Array<{ bookingId: string; scope: BookingChargeScope; amountCents: number; currency: string }> = [];
    for (const input of bookingChargeInputs) {
      const resolved = await resolveBookingChargeCents(supabase, input.booking_id, playerIdStr, input.charge_scope);
      if ('error' in resolved) {
        return res.status(400).json({ ok: false, error: resolved.error });
      }
      if (resolved.clubId !== clubIdStr) {
        return res.status(400).json({ ok: false, error: 'El turno no pertenece a este club' });
      }
      resolvedCharges.push({
        bookingId: input.booking_id,
        scope: input.charge_scope,
        amountCents: resolved.amountCents,
        currency: resolved.currency,
      });
    }

    const saleId = `${Date.now()}`;
    const movementAt = new Date().toISOString();
    let productsCents = 0;
    let bookingsCents = 0;
    let customTotalCents = 0;
    let currency = 'EUR';

    const inventoryLineTotals: Array<{ itemId: string; lineTotal: number; item: any }> = [];
    for (const [itemId, quantity] of quantitiesByItem) {
      const item = itemById.get(itemId) as any;
      const unitPrice = Math.max(0, Math.trunc(Number(item.unit_price_cents ?? 0)));
      const lineTotal = unitPrice * quantity;
      productsCents += lineTotal;
      currency = String(item.currency ?? currency) || currency;
      inventoryLineTotals.push({ itemId, lineTotal, item });
    }

    for (const line of customSaleLines) {
      const lineTotal = line.unit_price_cents * line.quantity;
      productsCents += lineTotal;
      customTotalCents += lineTotal;
    }

    for (const charge of resolvedCharges) {
      bookingsCents += charge.amountCents;
      currency = charge.currency || currency;
    }

    const grandTotalCents = productsCents + bookingsCents;

    let walletDebitCents = 0;
    let cashCardMethod = methodStr;
    if (methodStr === 'wallet' || requestedWalletCents > 0) {
      const { data: walletRows, error: walletSumErr } = await supabase
        .from('wallet_transactions')
        .select('amount_cents')
        .eq('player_id', playerIdStr)
        .eq('club_id', clubIdStr);
      if (walletSumErr) {
        if (walletSumErr.code === '42P01' || walletSumErr.message?.includes('does not exist')) {
          return res.status(400).json({ ok: false, error: 'El jugador no tiene saldo bono disponible' });
        }
        return res.status(500).json({ ok: false, error: walletSumErr.message });
      }
      const balanceCents = (walletRows ?? []).reduce((acc, row) => acc + Number((row as { amount_cents?: number }).amount_cents ?? 0), 0);
      if (balanceCents <= 0 && (methodStr === 'wallet' || requestedWalletCents > 0)) {
        return res.status(400).json({ ok: false, error: 'El jugador no tiene saldo bono disponible' });
      }
      const targetWallet =
        methodStr === 'wallet' && requestedWalletCents <= 0
          ? grandTotalCents
          : requestedWalletCents > 0
            ? requestedWalletCents
            : 0;
      walletDebitCents = Math.min(targetWallet, grandTotalCents, balanceCents);
      if (walletDebitCents <= 0 && (methodStr === 'wallet' || requestedWalletCents > 0)) {
        return res.status(400).json({ ok: false, error: 'Saldo bono insuficiente para esta compra' });
      }
      const remainderCents = grandTotalCents - walletDebitCents;
      if (remainderCents > 0) {
        if (methodStr !== 'cash' && methodStr !== 'card') {
          return res.status(400).json({
            ok: false,
            error: 'Saldo bono insuficiente. Elige efectivo o tarjeta para el resto.',
          });
        }
        cashCardMethod = methodStr;
      } else if (grandTotalCents > 0) {
        cashCardMethod = 'wallet';
      }
    }

    const saleMethodLabel =
      walletDebitCents > 0 && walletDebitCents < grandTotalCents
        ? `${cashCardMethod}+wallet`
        : walletDebitCents >= grandTotalCents && grandTotalCents > 0
          ? 'wallet'
          : cashCardMethod;

    let walletRemaining = walletDebitCents;
    const bookingWalletById = new Map<string, number>();
    const bookingCashById = new Map<string, number>();
    for (const charge of resolvedCharges) {
      const chargeWallet = Math.min(charge.amountCents, walletRemaining);
      walletRemaining -= chargeWallet;
      bookingWalletById.set(charge.bookingId, chargeWallet);
      bookingCashById.set(charge.bookingId, charge.amountCents - chargeWallet);
    }
    const productsWalletCents = Math.min(productsCents, walletRemaining);
    walletRemaining -= productsWalletCents;
    const productsCashCents = productsCents - productsWalletCents;

    const movementInserts = inventoryLineTotals.map(({ itemId, lineTotal, item }) => ({
      club_id: clubIdStr,
      item_id: itemId,
      movement_type: 'out' as const,
      quantity: quantitiesByItem.get(itemId) ?? 0,
      reason: `SALE|${saleId}|${saleMethodLabel}|${lineTotal}|${String(item.name ?? '').replace(/\|/g, ' ')}|booking:${linkBookingIdStr || 'none'}|player:${playerIdStr}|wallet:${productsWalletCents}`,
      movement_at: movementAt,
    }));

    let inserted: unknown[] = [];
    if (movementInserts.length > 0) {
      const { data, error: insertErr } = await supabase
        .from('inventory_movements')
        .insert(movementInserts)
        .select(MOVEMENT_FIELDS);

      if (insertErr) {
        if (isMissingRelationError(insertErr.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_movements no existe.' });
        return res.status(500).json({ ok: false, error: insertErr.message });
      }
      inserted = data ?? [];
    }

    const customCashCardCents = Math.max(0, customTotalCents - Math.min(productsWalletCents, customTotalCents));
    if (customCashCardCents > 0 && cashCardMethod !== 'wallet') {
      const storeBookingRef = linkBookingIdStr || null;
      const { error: txErr } = await supabase.from('payment_transactions').insert({
        booking_id: storeBookingRef,
        payer_player_id: playerIdStr,
        amount_cents: customCashCardCents,
        currency,
        stripe_payment_intent_id: `STORE_SALE_${cashCardMethod}_${saleId}`,
        status: 'succeeded',
      });
      if (txErr) return res.status(500).json({ ok: false, error: txErr.message });
    }

    for (const charge of resolvedCharges) {
      const chargeWallet = bookingWalletById.get(charge.bookingId) ?? 0;
      const chargeCash = bookingCashById.get(charge.bookingId) ?? 0;
      const payMethod =
        chargeWallet > 0 && chargeCash > 0
          ? cashCardMethod
          : chargeWallet >= charge.amountCents
            ? 'wallet'
            : cashCardMethod;

      const { data: bookingRow, error: bFetchErr } = await supabase
        .from('bookings')
        .select('id, organizer_player_id, total_price_cents, booking_participants(player_id, role, share_amount_cents, paid_amount_cents, wallet_amount_cents, payment_method)')
        .eq('id', charge.bookingId)
        .maybeSingle();
      if (bFetchErr || !bookingRow) {
        return res.status(500).json({ ok: false, error: bFetchErr?.message ?? 'Turno no encontrado' });
      }

      const participantRows: Array<{
        player_id: string;
        paid_amount_cents: number;
        wallet_amount_cents: number;
        payment_method: string | null;
        share_amount_cents: number;
      }> = [];

      const orgId = String((bookingRow as any).organizer_player_id ?? '');
      const parts = (bookingRow as any).booking_participants ?? [];
      const byPlayer = new Map<string, any>();
      for (const p of parts) {
        if (p?.player_id) byPlayer.set(String(p.player_id), p);
      }
      if (orgId && !byPlayer.has(orgId)) {
        byPlayer.set(orgId, { player_id: orgId, role: 'organizer', share_amount_cents: 0, paid_amount_cents: 0, wallet_amount_cents: 0 });
      }

      for (const [pid, p] of byPlayer) {
        const existingPaid = Math.trunc(Number(p.paid_amount_cents ?? 0));
        const existingWallet = Math.trunc(Number(p.wallet_amount_cents ?? 0));
        let paid = existingPaid;
        let wallet = existingWallet;
        let method: string | null = p.payment_method ?? null;
        if (pid === playerIdStr) {
          paid += chargeCash;
          wallet += chargeWallet;
          method = chargeWallet >= charge.amountCents ? 'wallet' : payMethod;
        }
        participantRows.push({
          player_id: pid,
          paid_amount_cents: paid,
          wallet_amount_cents: wallet,
          payment_method: method,
          share_amount_cents: Math.trunc(Number(p.share_amount_cents ?? 0)),
        });
      }

      if (!participantRows.some((p) => p.player_id === playerIdStr)) {
        participantRows.push({
          player_id: playerIdStr,
          paid_amount_cents: chargeCash,
          wallet_amount_cents: chargeWallet,
          payment_method: chargeWallet >= charge.amountCents ? 'wallet' : payMethod,
          share_amount_cents: 0,
        });
      }

      const walletCheck = await checkWalletBalances(supabase, clubIdStr, [
        { player_id: playerIdStr, wallet_amount_cents: chargeWallet, payment_method: chargeWallet > 0 ? 'wallet' : null },
      ]);
      if (!walletCheck.ok) return res.status(400).json({ ok: false, error: walletCheck.error });

      await upsertManualPayments(supabase, charge.bookingId, participantRows);

      const bookingTotal = Math.trunc(Number((bookingRow as any).total_price_cents ?? 0));
      const newStatus = computeBookingStatus(bookingTotal, participantRows);
      await supabase.from('bookings').update({ status: newStatus }).eq('id', charge.bookingId);

      for (const p of participantRows) {
        const isOrganizer = p.player_id === orgId;
        const updatePayload = {
          share_amount_cents: p.share_amount_cents,
          paid_amount_cents: p.paid_amount_cents,
          wallet_amount_cents: p.wallet_amount_cents,
          payment_method: p.payment_method,
          payment_status: p.paid_amount_cents + p.wallet_amount_cents > 0 ? 'paid' : 'pending',
        };
        if (isOrganizer) {
          await supabase.from('booking_participants').update(updatePayload).eq('booking_id', charge.bookingId).eq('role', 'organizer');
        } else {
          await supabase.from('booking_participants').update(updatePayload).eq('booking_id', charge.bookingId).eq('player_id', p.player_id);
        }
      }

      if (chargeWallet > 0) {
        const { error: walletErr } = await supabase.from('wallet_transactions').insert({
          player_id: playerIdStr,
          club_id: clubIdStr,
          amount_cents: -chargeWallet,
          concept: `Pago turno #${charge.bookingId.slice(0, 8)}`,
          type: 'debit',
          booking_id: charge.bookingId,
          notes: `cart_sale_id=${saleId}`,
        });
        if (walletErr) return res.status(500).json({ ok: false, error: walletErr.message });
      }
    }

    if (productsWalletCents > 0) {
      const { error: walletErr } = await supabase.from('wallet_transactions').insert({
        player_id: playerIdStr,
        club_id: clubIdStr,
        amount_cents: -productsWalletCents,
        concept: `Compra tienda #${saleId.slice(-6)}`,
        type: 'debit',
        booking_id: linkBookingIdStr || null,
        notes: `store_sale_id=${saleId}`,
      });
      if (walletErr) return res.status(500).json({ ok: false, error: walletErr.message });
    }

    return res.status(201).json({
      ok: true,
      sale: {
        id: saleId,
        booking_id: linkBookingIdStr || null,
        player_id: playerIdStr,
        payment_method: saleMethodLabel,
        wallet_amount_cents: walletDebitCents,
        total_cents: grandTotalCents,
        products_cents: productsCents,
        bookings_cents: bookingsCents,
        currency,
        movements: inserted ?? [],
        booking_charges: resolvedCharges.map((c) => ({
          booking_id: c.bookingId,
          charge_scope: c.scope,
          amount_cents: c.amountCents,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /inventario/movements/{id}/sale-amount:
 *   patch:
 *     tags: [Inventory]
 *     summary: Corregir importe de línea de venta en cierre de caja
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, amount_cents]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               amount_cents: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Importe actualizado }
 *       400: { description: Movimiento no es venta o datos inválidos }
 *       403: { description: Sin acceso }
 *       404: { description: Movimiento no encontrado }
 */
router.patch('/movements/:id/sale-amount', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const movementId = String(req.params.id ?? '').trim();
  const clubIdStr = String(req.body?.club_id ?? '').trim();
  const amountCents = Math.trunc(Number(req.body?.amount_cents ?? 0));
  if (!movementId || !clubIdStr) {
    return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return res.status(400).json({ ok: false, error: 'amount_cents inválido' });
  }
  if (!canAccessClub(req, clubIdStr, 'finanzas') && !canAccessClub(req, clubIdStr, 'gestion')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: movement, error: movErr } = await supabase
      .from('inventory_movements')
      .select('id, club_id, reason, movement_type')
      .eq('id', movementId)
      .maybeSingle();
    if (movErr) return res.status(500).json({ ok: false, error: movErr.message });
    if (!movement) return res.status(404).json({ ok: false, error: 'Movimiento no encontrado' });
    if (String((movement as any).club_id) !== clubIdStr) {
      return res.status(400).json({ ok: false, error: 'El movimiento no pertenece a este club' });
    }
    const reason = String((movement as any).reason ?? '');
    if (!reason.startsWith('SALE|') || (movement as any).movement_type !== 'out') {
      return res.status(400).json({ ok: false, error: 'Solo se pueden editar líneas de venta de tienda' });
    }
    const parts = reason.split('|');
    parts[3] = String(amountCents);
    const newReason = parts.join('|');
    const saleId = String(parts[1] ?? '');
    const method = String(parts[2] ?? 'cash');
    const bookingPart = parts.find((p) => p.startsWith('booking:'));
    const bookingId = bookingPart?.slice('booking:'.length) || null;

    const { error: updErr } = await supabase
      .from('inventory_movements')
      .update({ reason: newReason })
      .eq('id', movementId);
    if (updErr) return res.status(500).json({ ok: false, error: updErr.message });

    const cashCardMethod = method.includes('cash') ? 'cash' : method.includes('card') ? 'card' : null;
    if (cashCardMethod && bookingId && bookingId !== 'none') {
      const stripePrefix = `STORE_SALE_${cashCardMethod}_${saleId}`;
      await supabase
        .from('payment_transactions')
        .update({ amount_cents: amountCents })
        .eq('booking_id', bookingId)
        .like('stripe_payment_intent_id', `${stripePrefix}%`);
    }

    return res.json({ ok: true, movement: { id: movementId, amount_cents: amountCents, reason: newReason } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /inventario/items/{id}/image
 * Sube una imagen para un producto y actualiza `image_url`.
 */
router.post('/items/:id/image', requireClubOwnerOrAdminOrPortalStaff, upload.single('file'), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se envió ningún archivo (campo "file")' });

    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: existingErr } = await supabase.from('inventory_items').select('club_id').eq('id', id).maybeSingle();
    if (existingErr) return res.status(500).json({ ok: false, error: existingErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    if (!canAccessClub(req, String((existing as any).club_id), 'gestion')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    const buffer = req.file.buffer ?? (req.file as unknown as { buffer?: Buffer }).buffer;
    if (!buffer || !Buffer.isBuffer(buffer)) return res.status(500).json({ ok: false, error: 'No se pudo leer el archivo' });

    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `inventory-${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });
    if (uploadErr) return res.status(500).json({ ok: false, error: uploadErr.message });

    // Signed URL largo para que no se rompa al renderizar.
    const expiresIn = 60 * 60 * 24 * 365; // 1 año
    const { data: signedData, error: signedErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
    if (signedErr) return res.status(500).json({ ok: false, error: signedErr.message });

    const url = (signedData as { signedUrl?: string; signedURL?: string })?.signedUrl ?? (signedData as { signedURL?: string }).signedURL;
    if (!url) return res.status(500).json({ ok: false, error: 'No se pudo generar la URL de la imagen' });

    const { error: updateErr } = await supabase.from('inventory_items').update({ image_url: url }).eq('id', id);
    if (updateErr) return res.status(500).json({ ok: false, error: updateErr.message });

    return res.json({ ok: true, url });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;

