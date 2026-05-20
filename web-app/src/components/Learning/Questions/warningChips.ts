import type { WarningKind } from '../../../types/learningContent';

/**
 * Configuración visual y label de cada tipo de aviso. Centralizada para que
 * cards y sub-tab "Avisos" pinten consistentemente.
 */
export const WARNING_CHIP: Record<WarningKind, { label: string; bg: string; text: string; icon: string; description: string }> = {
  too_easy: {
    label: 'Demasiado fácil',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    icon: '⚠️',
    description: 'Más del 95% de aciertos con muestra suficiente. Quizá obvia o trivial.',
  },
  too_hard: {
    label: 'Demasiado difícil',
    bg: 'bg-red-50',
    text: 'text-red-600',
    icon: '⚠️',
    description: 'Menos del 20% de aciertos con muestra suficiente. Quizá mal redactada o muy compleja.',
  },
  low_quality: {
    label: 'Calidad cuestionable',
    bg: 'bg-fuchsia-50',
    text: 'text-fuchsia-700',
    icon: '⚠️',
    description: 'Más del 20% de los jugadores le han dado dislike (con muestra suficiente).',
  },
};
