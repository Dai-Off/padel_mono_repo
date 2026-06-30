import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tipos de reserva del sistema con sus metadatos por defecto. Fuente única
 * (la usan el endpoint de precios por tipo y el seeding del alta).
 */
export const RESERVATION_SYSTEM_TYPES = [
  { reservation_type: 'standard', display_name: 'Pista privada', color: '#005bc5', sort_order: 10, default_online: true },
  { reservation_type: 'open_match', display_name: 'Partido abierto', color: '#7c3aed', sort_order: 20, default_online: true },
  { reservation_type: 'pozo', display_name: 'Americanas', color: '#ea580c', sort_order: 30, default_online: false },
  { reservation_type: 'fixed_recurring', display_name: 'Turno fijo', color: '#166534', sort_order: 40, default_online: false },
  { reservation_type: 'school_group', display_name: 'Escuela grupo', color: '#fdf2f8', sort_order: 50, default_online: false },
  { reservation_type: 'school_individual', display_name: 'Clase particular', color: '#fdf2f8', sort_order: 60, default_online: false },
  { reservation_type: 'flat_rate', display_name: 'Tarifa plana', color: '#be185d', sort_order: 70, default_online: false },
  { reservation_type: 'tournament', display_name: 'Torneo', color: '#b45309', sort_order: 80, default_online: false },
  { reservation_type: 'blocked', display_name: 'Bloqueo administrativo', color: '#4b5563', sort_order: 90, default_online: false },
] as const;

/** Respaldo si el alta no trajo tarifas válidas (20 €/h). */
const FALLBACK_HOURLY_CENTS = 2000;

type PricingFranja = { label?: unknown; price?: unknown };

function parseEurosToCents(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Lista de tarifas (€/h → cents) válidas del payload de pricing del alta. */
function franjasToCents(pricing: unknown): { label: string; cents: number }[] {
  if (!Array.isArray(pricing)) return [];
  return pricing
    .map((p) => {
      const franja = (p && typeof p === 'object' ? p : {}) as PricingFranja;
      const cents = parseEurosToCents(franja.price);
      const label = typeof franja.label === 'string' ? franja.label.trim() : '';
      return cents != null ? { label: label || 'Tarifa', cents } : null;
    })
    .filter((x): x is { label: string; cents: number } => x != null);
}

/** Precio base por hora (cents) derivado del promedio de las franjas del alta. */
export function deriveBaseHourlyCents(pricing: unknown): number {
  const franjas = franjasToCents(pricing);
  if (franjas.length === 0) return FALLBACK_HOURLY_CENTS;
  const sum = franjas.reduce((acc, f) => acc + f.cents, 0);
  return Math.round(sum / franjas.length);
}

/**
 * Siembra las tarifas del club a partir del pricing cargado en el alta para que
 * el club quede operativo (reservas con precio calculable) ni bien se crea:
 *  - `reservation_type_prices`: precio base para todos los tipos de pista
 *    (`blocked` = 0). Es lo que usa el cálculo de precio online.
 *  - `club_tariffs`: una tarifa por franja, para que el dueño arme luego el
 *    calendario por horario en Finanzas sin perder lo que cargó.
 */
export async function seedClubPricingFromApplication(
  supabase: SupabaseClient,
  clubId: string,
  pricing: unknown,
  currency: string = 'EUR',
): Promise<{ ok: boolean; error?: string }> {
  const base = deriveBaseHourlyCents(pricing);
  const now = new Date().toISOString();

  const rows = RESERVATION_SYSTEM_TYPES.map((s) => ({
    club_id: clubId,
    reservation_type: s.reservation_type,
    price_per_hour_cents: s.reservation_type === 'blocked' ? 0 : base,
    currency,
    color: s.color,
    allow_online: s.default_online,
    display_name: s.display_name,
    is_system: true,
    sort_order: s.sort_order,
    updated_at: now,
  }));

  const { error: rtpErr } = await supabase
    .from('reservation_type_prices')
    .upsert(rows, { onConflict: 'club_id,reservation_type' });
  if (rtpErr) return { ok: false, error: rtpErr.message };

  const franjas = franjasToCents(pricing);
  if (franjas.length > 0) {
    const tariffRows = franjas.map((f) => ({
      club_id: clubId,
      name: f.label,
      price_cents: f.cents,
      is_blocking: false,
    }));
    const { error: tErr } = await supabase.from('club_tariffs').insert(tariffRows);
    // 23505 = nombre de tarifa duplicado: no es bloqueante para el alta.
    if (tErr && tErr.code !== '23505') return { ok: false, error: tErr.message };
  }

  return { ok: true };
}
