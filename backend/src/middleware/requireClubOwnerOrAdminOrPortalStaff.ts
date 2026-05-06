import { Request, Response, NextFunction } from 'express';

/**
 * Admin plataforma, dueño de club, o personal del portal (cualquier club asignado).
 * Útil para listar clubs accesibles (GET /clubs) sin dar acceso a rutas de creación de club.
 */
export function requireClubOwnerOrAdminOrPortalStaff(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext?.userId) {
    res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
    return;
  }
  if (
    req.authContext.adminId ||
    req.authContext.clubOwnerId ||
    (req.authContext.portalMemberships?.length ?? 0) > 0
  ) {
    next();
    return;
  }
  res.status(403).json({ ok: false, error: 'Se requieren permisos de club o personal invitado.' });
}
