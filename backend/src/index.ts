import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import app from './app';

dotenv.config();

const port: number = Number(process.env.PORT) || 3000;

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: '¡Algo salió mal en el servidor!' });
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
  console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎯 FRONTEND_URL: ${process.env.FRONTEND_URL || 'NO CONFIGURADO'}`);
});

export default app;
