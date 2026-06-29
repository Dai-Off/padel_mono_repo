import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TiendaProduct } from '../api/store';

const STORAGE_KEY = 'wematch_tienda_cart_v1';

export interface CartLine {
  product: TiendaProduct;
  quantity: number;
}

function isValidLine(value: unknown): value is CartLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Record<string, unknown>;
  const product = line.product as Record<string, unknown> | undefined;
  return (
    typeof line.quantity === 'number' &&
    line.quantity > 0 &&
    !!product &&
    typeof product.id === 'string' &&
    typeof product.priceCents === 'number'
  );
}

export async function loadCartLines(): Promise<CartLine[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidLine);
  } catch {
    return [];
  }
}

export async function saveCartLines(lines: CartLine[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Persistencia best-effort: si falla, el carrito sigue en memoria.
  }
}
