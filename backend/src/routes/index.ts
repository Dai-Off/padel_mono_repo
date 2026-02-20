import { Router } from 'express';
import healthRouter from './health';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ message: '¡Bienvenido a la API de Padel!' });
});

router.use('/health', healthRouter);

export default router;
