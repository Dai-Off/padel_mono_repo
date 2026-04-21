import { Easing } from 'react-native';

/** Curva del `AnimatedSection` X7: `ease: [0.16, 1, 0.3, 1]`. */
export const INICIO_ENTER_EASING = Easing.bezier(0.16, 1, 0.3, 1);

/** `AnimatedSection` X7: `duration: 0.7`. */
export const INICIO_ENTER_DURATION_MS = 700;

/**
 * `delay` de cada `AnimatedSection` en `InicioScreen.tsx` X7 (segundos → ms).
 * 0.1, 0.15, 0.2, 0.3, 0.4, 0.5 (+ reserva para más bloques en móvil).
 */
const INICIO_SECTION_DELAY_MS = [100, 150, 200, 300, 400, 500, 600] as const;

export function getInicioSectionDelayMs(enterIndex: number): number {
  const i = Math.max(0, Math.min(enterIndex, INICIO_SECTION_DELAY_MS.length - 1));
  return INICIO_SECTION_DELAY_MS[i];
}

/** `WidgetCarousel` X7: `transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)`. */
export const INICIO_CAROUSEL_TRANSITION_MS = 350;

/** @deprecated usar `getInicioSectionDelayMs`. */
export const INICIO_STAGGER_MS = 100;
