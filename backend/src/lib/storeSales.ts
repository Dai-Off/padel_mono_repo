import { getSupabaseServiceRoleClient } from './supabase';

export type StoreSalesPeriod = '7d' | '30d' | 'month';

export interface StoreSalesStats {
  revenue_cents: number;
  orders: number;
  avg_ticket_cents: number;
  units: number;
  revenue_delta_pct: number | null;
  orders_delta_pct: number | null;
}

export interface StoreSalesChartBar {
  label: string;
  value_cents: number;
}

export interface StoreSalesTopProduct {
  name: string;
  brand: string | null;
  units: number;
  revenue_cents: number;
}

export interface StoreSalesRecent {
  id: string;
  created_at: string;
  paid_at: string | null;
  customer: string;
  items: number;
  total_cents: number;
  status: string;
}

export interface StoreSalesSummary {
  period: StoreSalesPeriod;
  stats: StoreSalesStats;
  chart: StoreSalesChartBar[];
  top_products: StoreSalesTopProduct[];
  recent_sales: StoreSalesRecent[];
}

const SPANISH_WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const RECENT_SALES_LIMIT = 50;
const TOP_PRODUCTS_LIMIT = 5;

export function parseStoreSalesPeriod(value: unknown): StoreSalesPeriod {
  return value === '30d' || value === 'month' ? value : '7d';
}

type PaidOrderRow = {
  id: string;
  subtotal_cents: number;
  discount_cents: number | null;
  paid_at: string | null;
  player_id: string;
};

/** Importe neto cobrado del pedido (bruto menos descuento de código promocional). */
function netCents(order: { subtotal_cents: number; discount_cents: number | null }): number {
  return Math.max(0, Number(order.subtotal_cents) - Number(order.discount_cents ?? 0));
}

/** Inicio de la ventana actual según el período (en ms epoch). */
function resolveWindow(period: StoreSalesPeriod, now: Date): { currentStart: Date; prevStart: Date } {
  if (period === 'month') {
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    return { currentStart, prevStart };
  }
  const days = period === '30d' ? 30 : 7;
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevStart = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);
  return { currentStart, prevStart };
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Genera los buckets del gráfico (diarios para 7d, semanales para 30d/mes). */
function buildChart(
  period: StoreSalesPeriod,
  currentStart: Date,
  now: Date,
  orders: PaidOrderRow[],
): StoreSalesChartBar[] {
  const buckets: { label: string; start: number; end: number; value_cents: number }[] = [];

  if (period === '7d') {
    const base = startOfDay(now);
    for (let i = 6; i >= 0; i -= 1) {
      const dayStart = new Date(base.getTime() - i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      buckets.push({
        label: SPANISH_WEEKDAYS[dayStart.getDay()],
        start: dayStart.getTime(),
        end: dayEnd.getTime(),
        value_cents: 0,
      });
    }
  } else {
    // Buckets semanales (7 días) desde el inicio de la ventana hasta ahora.
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    let cursor = currentStart.getTime();
    let index = 1;
    const nowMs = now.getTime();
    while (cursor < nowMs && index <= 6) {
      const end = Math.min(cursor + weekMs, nowMs + 1);
      buckets.push({ label: `S${index}`, start: cursor, end, value_cents: 0 });
      cursor += weekMs;
      index += 1;
    }
    if (buckets.length === 0) {
      buckets.push({ label: 'S1', start: currentStart.getTime(), end: nowMs + 1, value_cents: 0 });
    }
  }

  for (const order of orders) {
    if (!order.paid_at) continue;
    const ts = Date.parse(order.paid_at);
    if (Number.isNaN(ts)) continue;
    const bucket = buckets.find((b) => ts >= b.start && ts < b.end);
    if (bucket) bucket.value_cents += netCents(order);
  }

  return buckets.map((b) => ({ label: b.label, value_cents: b.value_cents }));
}

export async function getStoreSalesSummary(period: StoreSalesPeriod): Promise<StoreSalesSummary> {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date();
  const { currentStart, prevStart } = resolveWindow(period, now);

  const { data: paidOrders, error: ordersErr } = await supabase
    .from('store_orders')
    .select('id, subtotal_cents, discount_cents, paid_at, player_id')
    .eq('status', 'paid')
    .gte('paid_at', prevStart.toISOString())
    .order('paid_at', { ascending: false });

  if (ordersErr) throw new Error(ordersErr.message);

  const all = (paidOrders ?? []) as PaidOrderRow[];
  const currentStartMs = currentStart.getTime();
  const current = all.filter((o) => o.paid_at && Date.parse(o.paid_at) >= currentStartMs);
  const previous = all.filter((o) => {
    if (!o.paid_at) return false;
    const ts = Date.parse(o.paid_at);
    return ts >= prevStart.getTime() && ts < currentStartMs;
  });

  const revenueCents = current.reduce((s, o) => s + netCents(o), 0);
  const prevRevenueCents = previous.reduce((s, o) => s + netCents(o), 0);
  const ordersCount = current.length;
  const avgTicketCents = ordersCount > 0 ? Math.round(revenueCents / ordersCount) : 0;

  const currentIds = current.map((o) => o.id);
  const { units, topProducts } = await aggregateItems(currentIds);

  const chart = buildChart(period, currentStart, now, current);
  const recentSales = await buildRecentSales();

  return {
    period,
    stats: {
      revenue_cents: revenueCents,
      orders: ordersCount,
      avg_ticket_cents: avgTicketCents,
      units,
      revenue_delta_pct: pctDelta(revenueCents, prevRevenueCents),
      orders_delta_pct: pctDelta(ordersCount, previous.length),
    },
    chart,
    top_products: topProducts,
    recent_sales: recentSales,
  };
}

async function aggregateItems(
  orderIds: string[],
): Promise<{ units: number; topProducts: StoreSalesTopProduct[] }> {
  if (orderIds.length === 0) return { units: 0, topProducts: [] };

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('store_order_items')
    .select('product_name, product_brand, quantity, line_total_cents')
    .in('order_id', orderIds);

  if (error) throw new Error(error.message);

  let units = 0;
  const byName = new Map<string, StoreSalesTopProduct>();
  for (const row of data ?? []) {
    const qty = Number(row.quantity);
    units += qty;
    const key = String(row.product_name);
    const existing = byName.get(key);
    if (existing) {
      existing.units += qty;
      existing.revenue_cents += Number(row.line_total_cents);
    } else {
      byName.set(key, {
        name: key,
        brand: (row.product_brand as string | null) ?? null,
        units: qty,
        revenue_cents: Number(row.line_total_cents),
      });
    }
  }

  const topProducts = [...byName.values()]
    .sort((a, b) => b.revenue_cents - a.revenue_cents)
    .slice(0, TOP_PRODUCTS_LIMIT);

  return { units, topProducts };
}

async function buildRecentSales(): Promise<StoreSalesRecent[]> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: orders, error } = await supabase
    .from('store_orders')
    .select('id, created_at, paid_at, subtotal_cents, discount_cents, status, player_id')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(RECENT_SALES_LIMIT);

  if (error) throw new Error(error.message);
  const rows = orders ?? [];
  if (rows.length === 0) return [];

  const orderIds = rows.map((o) => o.id);
  const playerIds = [...new Set(rows.map((o) => String(o.player_id)))];

  const [playersRes, itemsRes] = await Promise.all([
    supabase.from('players').select('id, first_name, last_name').in('id', playerIds),
    supabase.from('store_order_items').select('order_id, quantity').in('order_id', orderIds),
  ]);

  const nameById = new Map<string, string>();
  for (const p of playersRes.data ?? []) {
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
    nameById.set(String(p.id), name || 'Sin nombre');
  }

  const itemsByOrder = new Map<string, number>();
  for (const it of itemsRes.data ?? []) {
    const key = String(it.order_id);
    itemsByOrder.set(key, (itemsByOrder.get(key) ?? 0) + Number(it.quantity));
  }

  return rows.map((o) => ({
    id: String(o.id),
    created_at: String(o.created_at),
    paid_at: (o.paid_at as string | null) ?? null,
    customer: nameById.get(String(o.player_id)) ?? 'Sin nombre',
    items: itemsByOrder.get(String(o.id)) ?? 0,
    total_cents: netCents({
      subtotal_cents: Number(o.subtotal_cents),
      discount_cents: (o.discount_cents as number | null) ?? 0,
    }),
    status: String(o.status),
  }));
}
