import { getSupabaseServiceRoleClient } from './supabase';

export type PromoDiscountType = 'percent' | 'fixed';

export interface PromoCodeRow {
  id: string;
  created_at: string;
  code: string;
  discount_type: PromoDiscountType;
  discount_value: number;
  is_active: boolean;
}

type Supabase = ReturnType<typeof getSupabaseServiceRoleClient>;

/** Normaliza el código: sin espacios y en mayúsculas (los códigos se guardan así). */
export function normalizePromoCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

export function isPromoDiscountType(value: unknown): value is PromoDiscountType {
  return value === 'percent' || value === 'fixed';
}

/** Valida el valor del descuento según el tipo (percent: 1..100, fixed: céntimos > 0). */
export function isValidDiscountValue(type: PromoDiscountType, value: number): boolean {
  if (!Number.isInteger(value) || value <= 0) return false;
  if (type === 'percent') return value <= 100;
  return true;
}

/** Calcula el descuento en céntimos, acotado a [0, subtotal]. */
export function computeDiscountCents(
  type: PromoDiscountType,
  value: number,
  subtotalCents: number,
): number {
  if (subtotalCents <= 0) return 0;
  const raw = type === 'percent' ? Math.floor((subtotalCents * value) / 100) : value;
  return Math.max(0, Math.min(raw, subtotalCents));
}

export type PromoValidation =
  | {
      ok: true;
      code: string;
      discountType: PromoDiscountType;
      discountValue: number;
      discountCents: number;
    }
  | { ok: false; error: string };

/**
 * Busca un código activo y calcula el descuento para un subtotal dado.
 * Fuente de verdad del servidor: nunca se confía en el descuento del cliente.
 */
export async function validatePromoCode(
  supabase: Supabase,
  rawCode: unknown,
  subtotalCents: number,
): Promise<PromoValidation> {
  const code = normalizePromoCode(rawCode);
  if (!code) return { ok: false, error: 'Ingresá un código' };

  const { data, error } = await supabase
    .from('promo_codes')
    .select('id, code, discount_type, discount_value, is_active')
    .eq('code', code)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data || !data.is_active) return { ok: false, error: 'Código inválido o inactivo' };

  const discountCents = computeDiscountCents(
    data.discount_type as PromoDiscountType,
    Number(data.discount_value),
    subtotalCents,
  );
  if (discountCents <= 0) return { ok: false, error: 'El código no aplica a este pedido' };

  return {
    ok: true,
    code: String(data.code),
    discountType: data.discount_type as PromoDiscountType,
    discountValue: Number(data.discount_value),
    discountCents,
  };
}
