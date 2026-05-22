import { useEffect, useState } from 'react';

const DEFAULT_PAGE_SIZE = 20;
const VALID_SIZES = [10, 20, 50];

/**
 * Persiste la preferencia de page_size del usuario en localStorage por clave
 * lógica (ej: 'questions:club:{clubId}', 'questions:admin'). Si el valor
 * guardado no es válido, cae al default (20).
 */
export function usePageSizePref(storageKey: string): [number, (n: number) => void] {
  const fullKey = `learning_page_size:${storageKey}`;
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      const parsed = raw ? parseInt(raw, 10) : NaN;
      return VALID_SIZES.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(fullKey, String(pageSize)); } catch { /* SSR / privacidad */ }
  }, [fullKey, pageSize]);

  return [pageSize, setPageSize];
}
