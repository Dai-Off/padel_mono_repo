import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

const HOUR_MS = 60 * 60 * 1000;

/** Vida del caché persistido. gcTime debe ser >= que esto: si no, lo
 * restaurado del disco se recolectaría nada más hidratar. */
const PERSIST_MAX_AGE_MS = 24 * HOUR_MS;

/**
 * Raíces de query key que se persisten en AsyncStorage (warm start).
 * Whitelist deliberada: solo dominios estables donde pintar caché de una
 * sesión anterior es correcto. Lo volátil (matchmaking, invitaciones…)
 * vive solo en memoria.
 */
const PERSIST_ROOTS = new Set<unknown>(['season-pass', 'profile']);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** Paridad con los cooldowns manuales existentes (REVALIDATE_TTL_MS y
       * el background-refresh de HomeDataContext, ambos 30s). */
      staleTime: 30_000,
      gcTime: PERSIST_MAX_AGE_MS,
      retry: 1,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'rq-cache',
  throttleTime: 1000,
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: asyncStoragePersister,
  maxAge: PERSIST_MAX_AGE_MS,
  /** Subir la versión invalida todo el caché persistido (cambios de shape). */
  buster: 'v2', // v2: el pase pasa de /me a /estado + /misiones

  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && PERSIST_ROOTS.has(query.queryKey[0]),
  },
};

let managersWired = false;

/**
 * Cablea los managers de React Query al entorno RN (una sola vez, desde App):
 * - focusManager <- AppState: al volver de background, las queries stale
 *   (>staleTime) refetchean solas. Sustituye a los listeners manuales de
 *   "background -> active" de los contextos.
 * - onlineManager <- NetInfo: pausa fetches sin red y refetchea al reconectar.
 */
export function setupQueryManagers() {
  if (managersWired) return;
  managersWired = true;

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // isConnected null (desconocido) cuenta como online: nunca bloqueamos
      // fetches por falta de información.
      setOnline(state.isConnected !== false);
    }),
  );

  AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active');
  });
}
