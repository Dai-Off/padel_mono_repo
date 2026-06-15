import { useEffect, useRef } from 'react';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';

/**
 * Precarga (bufferiza) los vídeos de la lección por adelantado para eliminar el
 * frame negro al mostrarlos. Mantiene una ventana pequeña de players vivos: el
 * del índice actual y el siguiente. Cada player se crea con `createVideoPlayer`
 * (empieza a bufferizar al instante) y se libera manualmente al salir de la
 * ventana o al desmontar la pantalla.
 *
 * Como el índice actual durante la intro es 0, el primer vídeo se precarga
 * mientras el usuario lee la pantalla de "Empezar".
 *
 * @param videoUrls URL del vídeo de cada pregunta por índice, o null si no tiene.
 * @param activeIndex Índice de la pregunta que se está mostrando.
 */
export function useVideoPreloader(videoUrls: (string | null)[], activeIndex: number) {
  // url -> player. Se mantiene entre renders; la mutamos en el efecto.
  const poolRef = useRef<Map<string, VideoPlayer>>(new Map());

  useEffect(() => {
    const pool = poolRef.current;

    // URLs a mantener bufferizadas: la actual y la siguiente con vídeo.
    const keep = new Set<string>();
    for (let i = activeIndex; i <= activeIndex + 1; i++) {
      const url = videoUrls[i];
      if (url) keep.add(url);
    }

    // Crear los players que falten (arrancan la descarga, en pause).
    keep.forEach((url) => {
      if (!pool.has(url)) {
        const p = createVideoPlayer(url);
        p.loop = false;
        p.pause();
        pool.set(url, p);
      }
    });

    // Liberar los que ya no están en la ventana para no acumular memoria.
    for (const [url, p] of pool) {
      if (!keep.has(url)) {
        try { p.release(); } catch { /* ya liberado */ }
        pool.delete(url);
      }
    }
  }, [videoUrls, activeIndex]);

  // Liberar todos los players al desmontar la pantalla.
  useEffect(() => {
    const pool = poolRef.current;
    return () => {
      for (const [, p] of pool) {
        try { p.release(); } catch { /* ya liberado */ }
      }
      pool.clear();
    };
  }, []);

  return {
    /** Devuelve el player precargado para una URL, o null si no está listo. */
    getPlayer: (url: string | null | undefined): VideoPlayer | null =>
      url ? poolRef.current.get(url) ?? null : null,
  };
}
