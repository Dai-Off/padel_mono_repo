import { Request, Response, NextFunction } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

function getToken(req: Request): string | null {
  const authHeader = req.headers.authorization ?? req.headers['Authorization'];
  const raw = typeof authHeader === 'string' ? authHeader : '';
  if (raw.startsWith('Bearer ')) return raw.slice(7).trim();
  return raw.trim() || null;
}

export interface AuthContext {
  userId: string;
  clubOwnerId?: string;
  adminId?: string;
  allowedClubIds: string[];
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
      allowedClubIds: [],
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

    req.authContext = ctx;
  } catch {
    req.authContext = null;
  }
  next();
}
