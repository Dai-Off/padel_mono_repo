import type { Request } from 'express';
import type { AuthContext } from '../middleware/attachAuthContext';
import type { PortalPermissionKey } from './portalPermissions';

/** Dueño del club (o admin plataforma): puede operar caja sin empleado vinculado y delegar en personal. */
export function isClubOwnerForCashLedger(req: Request, clubId: string): boolean {
  const ctx = req.authContext;
  if (!ctx) return false;
  if (ctx.adminId) return true;
  return ctx.allowedClubIds?.includes(clubId) ?? false;
}

/** Dueño real del club o admin plataforma (gestión de pistas / club). */
export function isClubOwnerOrAdmin(req: Request, clubId: string): boolean {
  const ctx = req.authContext;
  if (!ctx) return false;
  if (ctx.adminId) return true;
  if (ctx.allowedClubIds?.includes(clubId)) return true;
  if (hasPortalPermission(ctx, clubId, 'club.manage')) return true;
  return false;
}

export function hasPortalPermission(
  ctx: AuthContext | null | undefined,
  clubId: string,
  key: PortalPermissionKey | PortalPermissionKey[]
): boolean {
  if (!ctx?.portalMemberships?.length) return false;
  const m = ctx.portalMemberships.find((x) => x.club_id === clubId);
  if (!m?.permissions?.length) return false;
  const keys = Array.isArray(key) ? key : [key];
  if (m.permissions.includes('club.manage')) return true;
  return keys.some((k) => m.permissions.includes(k));
}

/**
 * Acceso a recursos de un club: admin, dueño, o miembro de portal con permiso requerido.
 */
export function canAccessClub(
  req: Request,
  clubId: string,
  feature: PortalPermissionKey | PortalPermissionKey[]
): boolean {
  const ctx = req.authContext;
  if (!ctx) return false;
  if (ctx.adminId) return true;
  if (ctx.allowedClubIds?.includes(clubId)) return true;
  return hasPortalPermission(ctx, clubId, feature);
}

/** IDs de club donde el usuario del portal tiene al menos uno de los permisos indicados. */
export function allPortalClubIds(req: Request): string[] {
  const ctx = req.authContext;
  if (!ctx?.portalMemberships?.length) return [];
  return [...new Set(ctx.portalMemberships.map((m) => m.club_id))];
}

/** Ver detalle/listado de club en el portal con cualquier rol asignado. */
export function canAccessClubAsPortalMember(req: Request, clubId: string): boolean {
  const ctx = req.authContext;
  if (!ctx) return false;
  if (ctx.adminId) return true;
  if (ctx.allowedClubIds?.includes(clubId)) return true;
  return !!(ctx.portalMemberships?.some((m) => m.club_id === clubId && (m.permissions?.length ?? 0) > 0));
}

export function portalClubIdsWithAnyPermission(
  req: Request,
  keys: PortalPermissionKey | PortalPermissionKey[]
): string[] {
  const ctx = req.authContext;
  if (!ctx?.portalMemberships?.length) return [];
  const want = Array.isArray(keys) ? keys : [keys];
  const out: string[] = [];
  for (const m of ctx.portalMemberships) {
    const perms = m.permissions ?? [];
    if (perms.includes('club.manage') || want.some((k) => perms.includes(k))) {
      out.push(m.club_id);
    }
  }
  return out;
}

/** Obtiene el staff_id vinculado al usuario actual mediante su email en un club. */
export async function getStaffIdForUser(req: Request, clubId: string): Promise<string | null> {
  const ctx = req.authContext;
  if (!ctx?.userEmail) return null;
  
  // Import dinámico para evitar ciclos si existieran
  const { getSupabaseServiceRoleClient } = await import('./supabase');
  const supabase = getSupabaseServiceRoleClient();
  
  const { data } = await supabase
    .from('club_staff')
    .select('id')
    .eq('club_id', clubId)
    .eq('email', ctx.userEmail.toLowerCase())
    .maybeSingle();
    
  return (data as { id: string } | null)?.id ?? null;
}

/** 
 * Indica si el usuario es estrictamente un profesor (tiene el rol 'profesor' 
 * y no tiene permisos de gestión administrativa global). 
 */
export function isOnlyTeacher(req: Request, clubId: string): boolean {
  const ctx = req.authContext;
  if (!ctx) return false;
  // Dueños de club o admins plataforma no son "solo profesores"
  if (ctx.adminId) return false;
  if (ctx.allowedClubIds?.includes(clubId)) return false;
  
  const m = ctx.portalMemberships?.find((x) => x.club_id === clubId);
  if (!m) return false;
  
  // Si tiene permisos de gestión o club.manage, no es "solo profesor"
  if (m.permissions?.includes('club.manage') || m.permissions?.includes('gestion')) return false;
  
  return m.role_slug === 'profesor';
}
