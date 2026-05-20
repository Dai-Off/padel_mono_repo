import { useEffect } from 'react';

/**
 * Cierra un modal al pulsar Escape. Standard UX que faltaba en los modales
 * del módulo de aprendizaje. Limpia el listener al desmontar.
 */
export function useEscapeClose(onClose: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
}
