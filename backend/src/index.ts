import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import app from './app';
import { initMessagesRealtime } from './lib/messagesRealtime';

dotenv.config();

const port: number = Number(process.env.PORT) || 3000;

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
});

export default app;
