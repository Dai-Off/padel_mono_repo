import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';

// Debe cargarse ANTES que el resto de la app (import './instrument' primero
// en index.ts) para que Sentry instrumente http/express desde el arranque.
dotenv.config();

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Muestreo de tracing moderado: los errores se capturan siempre.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}

/** true si Sentry quedó inicializado (hay DSN configurado). */
export const sentryEnabled = Boolean(dsn);
