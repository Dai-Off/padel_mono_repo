import { Request, Response, NextFunction } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

function getToken(req: Request): string | null {
  const authHeader = req.headers.authorization ?? req.headers['Authorization'];
  const raw = typeof authHeader === 'string' ? authHeader : '';
  if (raw.startsWith('Bearer ')) return raw.slice(7).trim();
  return raw.trim() || null;
}

export interface PortalMembership {
  club_id: string;
  club_portal_role_id: string;
  role_name: string;
  role_slug: string;
  permissions: string[];
}

export interface AuthContext {
  userId: string;
  userEmail?: string;
  clubOwnerId?: string;
  adminId?: string;
  allowedClubIds: string[];
  /** Personal del club con rol configurable (no dueño). */
  portalMemberships: PortalMembership[];
}

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext | null;
    }
  }
}

/**
 * Resolves JWT and attaches authContext to req: userId, clubOwnerId, adminId, allowedClubIds (clubs owned by this owner).
 * If no token or invalid, req.authContext is null. Does not send 401/403.
 */
export async function attachAuthContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = getToken(req);
  if (!token) {
    req.authContext = null;
    next();
    return;
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      req.authContext = null;
      next();
      return;
    }
    const ctx: AuthContext = {
      userId: user.id,
      userEmail: user.email,
      allowedClubIds: [],
      portalMemberships: [],
    };
    const { data: owner } = await supabase
      .from('club_owners')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (owner) {
      ctx.clubOwnerId = owner.id;
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id')
        .eq('owner_id', owner.id);
      ctx.allowedClubIds = (clubs ?? []).map((c) => c.id);
    }
    const { data: admin } = await supabase
      .from('admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (admin) ctx.adminId = admin.id;

    const { data: memberRows, error: memErr } = await supabase
      .from('club_portal_members')
      .select('club_id, club_portal_role_id')
      .eq('auth_user_id', user.id);
    if (memErr && !memErr.message.includes('does not exist')) {
      console.error('[attachAuthContext] club_portal_members:', memErr.message);
    }
    const members =
      memErr && !memErr.message.includes('does not exist')
        ? ([] as { club_id: string; club_portal_role_id: string }[])
        : ((memberRows ?? []) as { club_id: string; club_portal_role_id: string }[]);
    if (members.length > 0) {
      const roleIds = [...new Set(members.map((m) => m.club_portal_role_id))];
      const [{ data: roleRows }, { data: permRows }] = await Promise.all([
        supabase.from('club_portal_roles').select('id, name, slug').in('id', roleIds),
        supabase.from('club_portal_role_permissions').select('role_id, permission_key').in('role_id', roleIds),
      ]);
      const roleById = new Map(
        ((roleRows ?? []) as { id: string; name: string; slug: string }[]).map((r) => [r.id, r])
      );
      const permsByRole = new Map<string, string[]>();
      for (const p of (permRows ?? []) as { role_id: string; permission_key: string }[]) {
        const list = permsByRole.get(p.role_id) ?? [];
        list.push(p.permission_key);
        permsByRole.set(p.role_id, list);
      }
      for (const m of members) {
        const role = roleById.get(m.club_portal_role_id);
        ctx.portalMemberships.push({
          club_id: m.club_id,
          club_portal_role_id: m.club_portal_role_id,
          role_name: role?.name ?? 'Rol',
          role_slug: role?.slug ?? '',
          permissions: permsByRole.get(m.club_portal_role_id) ?? [],
        });
      }
    }

    req.authContext = ctx;
  } catch {
    req.authContext = null;
  }
  next();
}
