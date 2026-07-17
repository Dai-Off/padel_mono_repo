import './instrument'; // Sentry: debe cargar antes que la app (carga dotenv él mismo)
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import cron from 'node-cron';
import { WebSocketServer } from 'ws';
import * as Sentry from '@sentry/node';
import app from './app';
import { sentryEnabled } from './instrument';
import { initMessagesRealtime } from './lib/messagesRealtime';
import { runAccountDeletionJob } from './lib/accountDeletionJob';

dotenv.config();

const port: number = Number(process.env.PORT) || 3000;

// Captura en Sentry los errores que llegan al middleware de error de Express
// (va después de las rutas y antes de nuestro handler, que responde al cliente).
if (sentryEnabled) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err?.stack ?? err);
  const message = err?.message || '¡Algo salió mal en el servidor!';
  res.status(500).json({ ok: false, error: message });
});

const server = createServer(app);
const messagesWss = new WebSocketServer({ server, path: '/messages/ws' });
initMessagesRealtime(messagesWss);

server.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);

  if (process.env.ACCOUNT_DELETION_CRON !== '0') {
    cron.schedule('0 3 * * *', () => {
      runAccountDeletionJob()
        .then((r) => console.log('[cron account-deletion]', JSON.stringify(r)))
        .catch((e) => console.error('[cron account-deletion]', e));
    });
    console.log('Cron de eliminación de cuentas programado (diario 03:00 UTC)');
  }
});

function shutdown(signal: string) {
  console.log(`[shutdown] ${signal} — liberando puerto ${port}`);
  messagesWss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
