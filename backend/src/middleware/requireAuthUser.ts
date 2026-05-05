import { Request, Response, NextFunction } from 'express';

/** Tras attachAuthContext: exige JWT válido y usuario resuelto. */
export function requireAuthUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext?.userId) {
    res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
    return;
  }
  next();
}
