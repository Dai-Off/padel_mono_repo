import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Inicializa Sentry si hay DSN en el entorno (EXPO_PUBLIC_SENTRY_DSN en .env);
 * sin él es un no-op y la app arranca igual. El DSN va por env a propósito:
 * migrar de cuenta (personal → organización de empresa) es cambiar el valor,
 * cero código.
 *
 * En Expo Go corre en modo solo-JS (errores JS + breadcrumbs). Los crashes
 * nativos y la subida de source maps llegan con las builds (EAS): al
 * montarlas, añadir el config plugin "@sentry/react-native/expo" en app.json
 * con organization/project (de la cuenta de empresa) — sin builds, el plugin
 * solo produce un warning en cada arranque y por eso no está.
 */
export function setupSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: __DEV__ ? 1 : 0.2,
    sendDefaultPii: false,
  });
}

/** Envuelve el componente raíz (captura de render + touch tracking). No-op sin DSN. */
export function withSentry<P extends Record<string, unknown>>(
  component: ComponentType<P>,
): ComponentType<P> {
  return dsn ? Sentry.wrap(component) : component;
}
