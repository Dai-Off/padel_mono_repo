import { useEffect, useRef } from 'react';

export const DEFAULT_AUTO_REFRESH_MS = 15000;

interface UseAutoRefreshOptions {
    /** Intervalo de refresco en ms. Por defecto 15s. */
    intervalMs?: number;
    /** Si está en false, no se programa ningún refresco (útil para pausar con modales abiertos). */
    enabled?: boolean;
    /** Refrescar cuando la pestaña vuelve a estar visible / recupera el foco. Por defecto true. */
    refreshOnFocus?: boolean;
}

/**
 * Refresca datos "casi en tiempo real" llamando a `callback` en intervalos,
 * pausando cuando la pestaña está oculta y disparando un refresco al volver el foco.
 *
 * El callback se guarda en un ref para no reprogramar el intervalo en cada render,
 * así podés pasar una función nueva en cada render sin reiniciar el timer.
 */
export function useAutoRefresh(
    callback: () => void | Promise<void>,
    options: UseAutoRefreshOptions = {},
): void {
    const { intervalMs = DEFAULT_AUTO_REFRESH_MS, enabled = true, refreshOnFocus = true } = options;

    const savedCallback = useRef(callback);
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!enabled) return;

        const run = () => {
            if (document.visibilityState !== 'visible') return;
            void savedCallback.current();
        };

        const timer = window.setInterval(run, intervalMs);

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') void savedCallback.current();
        };

        if (refreshOnFocus) {
            document.addEventListener('visibilitychange', onVisibilityChange);
            window.addEventListener('focus', onVisibilityChange);
        }

        return () => {
            window.clearInterval(timer);
            if (refreshOnFocus) {
                document.removeEventListener('visibilitychange', onVisibilityChange);
                window.removeEventListener('focus', onVisibilityChange);
            }
        };
    }, [enabled, intervalMs, refreshOnFocus]);
}
