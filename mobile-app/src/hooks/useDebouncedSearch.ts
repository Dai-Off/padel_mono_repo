import { useEffect, useRef, useState } from 'react';

type Options = {
  /** Espera tras dejar de escribir antes de lanzar la búsqueda. Estándar de buscadores: 300 ms. */
  delay?: number;
  /** Mínimo de caracteres antes de buscar. */
  minChars?: number;
};

/**
 * Búsqueda con debounce reutilizable: espera a que el usuario deje de escribir antes de
 * llamar a `search`, ignora respuestas obsoletas y expone `loading`. El `search` se lee por
 * ref para no reejecutar el efecto en cada render (no hace falta memoizarlo).
 */
export function useDebouncedSearch<T>(
  query: string,
  search: (q: string) => Promise<T[]>,
  { delay = 300, minChars = 2 }: Options = {},
): { items: T[]; loading: boolean } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  });

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minChars) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await searchRef.current(trimmed);
          if (!cancelled) setItems(res);
        } catch {
          if (!cancelled) setItems([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, delay, minChars]);

  return { items, loading };
}
