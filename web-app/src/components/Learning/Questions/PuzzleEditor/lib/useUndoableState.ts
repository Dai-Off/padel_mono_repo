// Hook genérico de historial con undo/redo. No usa diff — guarda el valor
// completo en cada push, lo cual es ineficiente para estados muy grandes pero
// suficiente para un PuzzleContent.
//
// El historial se limita a HISTORY_MAX para evitar memoria infinita.

import { useCallback, useRef, useState } from 'react';

const HISTORY_MAX = 100;

export interface UndoableState<T> {
  value: T;
  set: (next: T) => void;
  // Sustituye el valor SIN registrar en el historial (útil para reset del padre).
  replaceSilent: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoableState<T>(initial: T): UndoableState<T> {
  const [value, setValue] = useState<T>(initial);
  // past[0] = más antiguo; past[last] = el inmediato anterior al value actual.
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const [version, setVersion] = useState(0); // forzar re-render

  const set = useCallback((next: T) => {
    pastRef.current = [...pastRef.current, value].slice(-HISTORY_MAX);
    futureRef.current = []; // un nuevo cambio invalida el futuro
    setValue(next);
    setVersion((v) => v + 1);
  }, [value]);

  const replaceSilent = useCallback((next: T) => {
    pastRef.current = [];
    futureRef.current = [];
    setValue(next);
    setVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [value, ...futureRef.current].slice(0, HISTORY_MAX);
    setValue(prev);
    setVersion((v) => v + 1);
  }, [value]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, value].slice(-HISTORY_MAX);
    setValue(next);
    setVersion((v) => v + 1);
  }, [value]);

  // version se usa para que el consumidor reciba refs estables (canUndo/Redo).
  void version;

  return {
    value,
    set,
    replaceSilent,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
