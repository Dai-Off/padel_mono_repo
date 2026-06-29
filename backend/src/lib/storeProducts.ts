export const STORE_CATEGORIES = ['palas', 'pelotas', 'calzado', 'ropa', 'accesorios'] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export const STORE_PRODUCT_FIELDS =
  'id, created_at, updated_at, name, brand, description, category, sku, price_cents, compare_at_price_cents, stock_quantity, low_stock_threshold, image_url, is_active, is_featured, is_flash_deal, sort_order';

export function isStoreCategory(value: unknown): value is StoreCategory {
  return typeof value === 'string' && (STORE_CATEGORIES as readonly string[]).includes(value);
}

export function isStoreProductInStock(stockQuantity: unknown): boolean {
  return typeof stockQuantity === 'number' && Number.isFinite(stockQuantity) && stockQuantity > 0;
}

type ParseOk<T> = { ok: true; value: T };
type ParseFail = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseFail;

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Entero >= 0 obligatorio (p. ej. price_cents). */
export function parseRequiredNonNegativeInt(value: unknown, label: string): ParseResult<number> {
  if (isEmptyValue(value)) {
    return { ok: false, error: `${label} es obligatorio` };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    return { ok: false, error: `${label} debe ser un número entero mayor o igual a 0` };
  }
  return { ok: true, value: n };
}

/** Entero >= 0 con valor por defecto si viene vacío. */
export function parseNonNegativeIntWithDefault(
  value: unknown,
  label: string,
  fallback: number
): ParseResult<number> {
  if (isEmptyValue(value)) {
    return { ok: true, value: fallback };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    return { ok: false, error: `${label} debe ser un número entero mayor o igual a 0` };
  }
  return { ok: true, value: n };
}

/** Entero >= 0 opcional: vacío/null → null (válido). */
export function parseOptionalNonNegativeInt(value: unknown, label: string): ParseResult<number | null> {
  if (isEmptyValue(value)) {
    return { ok: true, value: null };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    return { ok: false, error: `${label} debe ser un número entero mayor o igual a 0, o dejarse vacío` };
  }
  return { ok: true, value: n };
}

/** @deprecated usar parseRequiredNonNegativeInt */
export function parsePositiveInt(value: unknown, fallback?: number): number | null {
  if (isEmptyValue(value)) {
    return fallback !== undefined ? fallback : null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/** @deprecated usar parseOptionalNonNegativeInt */
export function parseOptionalPositiveInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505';
}
