import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  fetchStoreCollections,
  fetchStoreFlash,
  fetchStoreProducts,
  mapStoreProductsToTienda,
  type StoreCollectionPublic,
  type StoreFlashCampaign,
  type TiendaProduct,
} from '../api/store';
import { storeKeys } from './keys';

/**
 * Catálogo público de la tienda en React Query (sustituye al fetch manual de
 * TiendaScreen). Sin userId en las keys: los endpoints son públicos. Al ser la
 * raíz 'store' volátil (fuera de PERSIST_ROOTS) no hay warm start desde disco,
 * pero el caché en memoria elimina el spinner al remontar dentro de la sesión.
 *
 * Las funciones de api/store devuelven `{ok:false}` en error; se envuelven aquí
 * convirtiendo el fallo en throw para que `isError`/retry funcionen.
 */

/** Catálogo completo. Es el dataset que gatea el loading/error de la pantalla. */
export function useStoreProducts() {
  return useQuery({
    queryKey: storeKeys.products(),
    queryFn: async () => {
      const res = await fetchStoreProducts();
      if (!res.ok || !res.products) throw new Error(res.error || 'store-products failed');
      return res;
    },
  });
}

/** Campaña flash. Tolerante: si falla, la pantalla degrada a "sin flash". */
export function useStoreFlash() {
  return useQuery({
    queryKey: storeKeys.flash(),
    queryFn: async () => {
      const res = await fetchStoreFlash();
      if (!res.ok) throw new Error(res.error || 'store-flash failed');
      return res;
    },
  });
}

/** Colecciones destacadas. Tolerante: si falla, se muestran cero colecciones. */
export function useStoreCollections() {
  return useQuery({
    queryKey: storeKeys.collections(),
    queryFn: async () => {
      const res = await fetchStoreCollections();
      if (!res.ok || !res.collections) throw new Error(res.error || 'store-collections failed');
      return res.collections;
    },
  });
}

export type TiendaCatalog = {
  products: TiendaProduct[];
  flashCampaign: StoreFlashCampaign | null;
  flashApiProducts: TiendaProduct[];
  collections: StoreCollectionPublic[];
  /** Solo la primera carga del catálogo; las revalidaciones son silenciosas. */
  loading: boolean;
  /** True si la carga del catálogo falló (flash/colecciones degradan en silencio). */
  isError: boolean;
  refetch: () => void;
};

/**
 * Agregador que replica la forma que consumía TiendaScreen: combina las tres
 * queries y deriva la campaña flash y sus productos (endpoint vs catálogo) con
 * la misma prioridad que el `loadProducts` original.
 */
export function useTiendaCatalog(): TiendaCatalog {
  const productsQuery = useStoreProducts();
  const flashQuery = useStoreFlash();
  const collectionsQuery = useStoreCollections();
  const queryClient = useQueryClient();

  const derived = useMemo(() => {
    const productsRes = productsQuery.data;
    const mapped = productsRes?.products ? mapStoreProductsToTienda(productsRes.products) : [];

    const catalogFlash = mapped.filter((p) => p.isFlashDeal);
    const flashRes = flashQuery.data;
    const flashFromEndpoint = flashRes?.ok && flashRes.campaign ? flashRes.campaign : null;
    const campaign =
      (flashFromEndpoint?.ends_at ? flashFromEndpoint : null) ??
      (productsRes?.flash?.ends_at ? productsRes.flash : null) ??
      flashFromEndpoint ??
      productsRes?.flash ??
      null;
    const endpointFlash =
      flashRes?.ok && flashRes.campaign?.enabled && flashRes.products
        ? mapStoreProductsToTienda(flashRes.products)
        : [];
    const flashApiProducts = endpointFlash.length > 0 ? endpointFlash : catalogFlash;

    return { products: mapped, flashCampaign: campaign ?? null, flashApiProducts };
  }, [productsQuery.data, flashQuery.data]);

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: storeKeys.all() });
  }, [queryClient]);

  return {
    products: derived.products,
    flashCampaign: derived.flashCampaign,
    flashApiProducts: derived.flashApiProducts,
    collections: collectionsQuery.data ?? [],
    loading: productsQuery.isPending,
    isError: productsQuery.isError,
    refetch,
  };
}
