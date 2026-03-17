import { Request, Response, NextFunction } from 'express';

/**
 * Requires req.authContext to be set and user to be either admin or club owner.
 * Use after attachAuthContext. Returns 401 if no auth, 403 if not admin and not club owner.
 */
export function requireClubOwnerOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
    return;
  }
  if (req.authContext.adminId || req.authContext.clubOwnerId) {
    next();
    return;
  }
  res.status(403).json({ ok: false, error: 'Se requieren permisos de administrador o dueño de club.' });
}
