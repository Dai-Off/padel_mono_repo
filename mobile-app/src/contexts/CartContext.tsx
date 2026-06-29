import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { TiendaProduct } from '../api/store';
import { loadCartLines, saveCartLines, type CartLine } from '../lib/cartStorage';

interface CartContextValue {
  lines: CartLine[];
  /** Total de unidades en el carrito (suma de cantidades). */
  totalCount: number;
  /** Suma de precios * cantidad, en céntimos. */
  subtotalCents: number;
  ready: boolean;
  getQuantity: (productId: string) => number;
  addItem: (product: TiendaProduct, quantity?: number) => void;
  incrementItem: (productId: string) => void;
  decrementItem: (productId: string) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Tope de unidades por producto, limitado por el stock disponible. */
function maxForProduct(product: TiendaProduct): number {
  return product.stock > 0 ? product.stock : 0;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadCartLines().then((loaded) => {
      if (cancelled) return;
      setLines(loaded);
      hydratedRef.current = true;
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persiste cada cambio una vez hidratado (evita pisar el storage al cargar).
  useEffect(() => {
    if (!hydratedRef.current) return;
    void saveCartLines(lines);
  }, [lines]);

  const getQuantity = useCallback(
    (productId: string) => lines.find((l) => l.product.id === productId)?.quantity ?? 0,
    [lines],
  );

  const addItem = useCallback((product: TiendaProduct, quantity = 1) => {
    const max = maxForProduct(product);
    if (max <= 0) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(existing.quantity + quantity, max);
        return prev.map((l) =>
          l.product.id === product.id ? { product, quantity: nextQty } : l,
        );
      }
      return [...prev, { product, quantity: Math.min(quantity, max) }];
    });
  }, []);

  const incrementItem = useCallback((productId: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.product.id !== productId) return l;
        const max = maxForProduct(l.product);
        return { ...l, quantity: Math.min(l.quantity + 1, max) };
      }),
    );
  }, []);

  const decrementItem = useCallback((productId: string) => {
    setLines((prev) =>
      prev
        .map((l) => (l.product.id === productId ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setLines([]);
  }, []);

  const totalCount = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity, 0),
    [lines],
  );
  const subtotalCents = useMemo(
    () => lines.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0),
    [lines],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      totalCount,
      subtotalCents,
      ready,
      getQuantity,
      addItem,
      incrementItem,
      decrementItem,
      removeItem,
      clearCart,
    }),
    [
      lines,
      totalCount,
      subtotalCents,
      ready,
      getQuantity,
      addItem,
      incrementItem,
      decrementItem,
      removeItem,
      clearCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart debe usarse dentro de <CartProvider>');
  }
  return ctx;
}
