import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadTiendaFavoriteIds,
  saveTiendaFavoriteIds,
} from '../lib/tiendaFavoritesStorage';

export function useTiendaFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadTiendaFavoriteIds().then((ids) => {
      if (cancelled) return;
      setFavoriteIds(new Set(ids));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavorite = useCallback((productId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      void saveTiendaFavoriteIds([...next]);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (productId: string) => favoriteIds.has(productId),
    [favoriteIds],
  );

  const favoriteCount = useMemo(() => favoriteIds.size, [favoriteIds]);

  return { favoriteIds, ready, toggleFavorite, isFavorite, favoriteCount };
}
