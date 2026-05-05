import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireAuthUser } from '../middleware/requireAuthUser';
import { generateInviteToken, hashInviteToken, getInviteExpiresAt } from '../lib/inviteToken';
import { getFrontendUrl } from '../lib/env';
import { sendClubPortalInviteEmail } from '../lib/mailer';
import { ensureDefaultPortalRolesForClub } from '../lib/clubPortalDefaults';
import { canAccessClub } from '../lib/clubAccess';
import { normalizePermissionKeys, PORTAL_PERMISSION_KEYS, PORTAL_PERMISSION_LABELS } from '../lib/portalPermissions';

const router = Router();

function slugify(name: string): string {
  const base = String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return base || 'rol';
}

/** GET /club-portal/invites/validate?token= — público (sin JWT). */
router.get('/invites/validate', async (req: Request, res: Response) => {
  const token = String(req.query.token ?? '').trim();
  if (!token) return res.status(400).json({ ok: false, error: 'token es obligatorio' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const tokenHash = hashInviteToken(token);
    const { data: inv, error } = await supabase
      .from('club_portal_invites')
      .select('id, email, expires_at, accepted_at, revoked_at, club_id, club_portal_role_id')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error?.message?.includes('does not exist')) {
      return res.status(503).json({ ok: false, error: 'Migración de portal no aplicada en la base de datos.' });
    }
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!inv) return res.status(400).json({ ok: false, error: 'Enlace inválido' });
    const row = inv as {
      email: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
      club_id: string;
      club_portal_role_id: string;
    };
    if (row.revoked_at) return res.status(400).json({ ok: false, error: 'Esta invitación fue revocada' });
    if (row.accepted_at) return res.status(400).json({ ok: false, error: 'Esta invitación ya fue utilizada' });
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ ok: false, error: 'El enlace ha expirado' });
    const [{ data: club }, { data: roleRow }] = await Promise.all([
      supabase.from('clubs').select('name').eq('id', row.club_id).maybeSingle(),
      supabase.from('club_portal_roles').select('name').eq('id', row.club_portal_role_id).maybeSingle(),
    ]);
    return res.json({
      ok: true,
      email: row.email,
      club_id: row.club_id,
      club_name: (club as { name?: string } | null)?.name ?? 'Club',
      role_name: (roleRow as { name?: string } | null)?.name ?? 'Rol',
      expires_at: row.expires_at,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.use(attachAuthContext);
router.use(requireAuthUser);

router.get('/permission-catalog', (_req: Request, res: Response) => {
  const keys = [...PORTAL_PERMISSION_KEYS];
  return res.json({
    ok: true,
    permissions: keys.map((key) => ({ key, label: PORTAL_PERMISSION_LABELS[key] })),
  });
});

router.get('/roles', async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id, 'roles.manage')) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para gestionar roles de este club' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    await ensureDefaultPortalRolesForClub(supabase, club_id);
    const { data: roles, error: rErr } = await supabase
      .from('club_portal_roles')
      .select('id, club_id, name, slug, is_system, created_at')
      .eq('club_id', club_id)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });
    if (rErr) return res.status(500).json({ ok: false, error: rErr.message });
    const roleIds = (roles ?? []).map((r: { id: string }) => r.id);
    const permByRole = new Map<string, string[]>();
    if (roleIds.length) {
      const { data: perms, error: pErr } = await supabase
        .from('club_portal_role_permissions')
        .select('role_id, permission_key')
        .in('role_id', roleIds);
      if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
      for (const p of (perms ?? []) as { role_id: string; permission_key: string }[]) {
        const cur = permByRole.get(p.role_id) ?? [];
        cur.push(p.permission_key);
        permByRole.set(p.role_id, cur);
      }
    }
    const out = (roles ?? []).map((r: { id: string }) => ({
      ...r,
      permission_keys: permByRole.get(r.id) ?? [],
    }));
    return res.json({ ok: true, roles: out });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/roles', async (req: Request, res: Response) => {
  const { club_id, name, permission_keys } = req.body ?? {};
  const cid = String(club_id ?? '').trim();
  const roleName = String(name ?? '').trim();
  if (!cid || !roleName) return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  if (!canAccessClub(req, cid, 'roles.manage')) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para crear roles' });
  }
  const keys = normalizePermissionKeys(permission_keys);
  if (!keys.length) return res.status(400).json({ ok: false, error: 'Selecciona al menos un permiso' });
  let slug = slugify(roleName);
  try {
    const supabase = getSupabaseServiceRoleClient();
    for (let i = 0; i < 20; i++) {
      const { data: existing } = await supabase
        .from('club_portal_roles')
        .select('id')
        .eq('club_id', cid)
        .eq('slug', slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${slugify(roleName)}_${i + 2}`;
    }
    const { data: role, error: rErr } = await supabase
      .from('club_portal_roles')
      .insert({ club_id: cid, name: roleName, slug, is_system: false })
      .select('id, club_id, name, slug, is_system, created_at')
      .single();
    if (rErr) return res.status(500).json({ ok: false, error: rErr.message });
    const roleId = (role as { id: string }).id;
    const { error: pErr } = await supabase
      .from('club_portal_role_permissions')
      .insert(keys.map((permission_key) => ({ role_id: roleId, permission_key })));
    if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
    return res.status(201).json({ ok: true, role: { ...(role as object), permission_keys: keys } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/roles/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, permission_keys } = req.body ?? {};
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: e0 } = await supabase
      .from('club_portal_roles')
      .select('id, club_id, name, slug, is_system')
      .eq('id', id)
      .maybeSingle();
    if (e0) return res.status(500).json({ ok: false, error: e0.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Rol no encontrado' });
    const ex = existing as { club_id: string; is_system: boolean };
    if (!canAccessClub(req, ex.club_id, 'roles.manage')) {
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    }
    if (name !== undefined && String(name).trim()) {
      const { error: uErr } = await supabase
        .from('club_portal_roles')
        .update({ name: String(name).trim(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (uErr) return res.status(500).json({ ok: false, error: uErr.message });
    }
    if (permission_keys !== undefined) {
      const keys = normalizePermissionKeys(permission_keys);
      if (!keys.length) return res.status(400).json({ ok: false, error: 'Selecciona al menos un permiso' });
      const { error: delErr } = await supabase.from('club_portal_role_permissions').delete().eq('role_id', id);
      if (delErr) return res.status(500).json({ ok: false, error: delErr.message });
      const { error: insErr } = await supabase
        .from('club_portal_role_permissions')
        .insert(keys.map((permission_key) => ({ role_id: id, permission_key })));
      if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
    }
    const { data: role, error: rErr } = await supabase
      .from('club_portal_roles')
      .select('id, club_id, name, slug, is_system, created_at')
      .eq('id', id)
      .single();
    if (rErr) return res.status(500).json({ ok: false, error: rErr.message });
    const { data: perms } = await supabase.from('club_portal_role_permissions').select('permission_key').eq('role_id', id);
    return res.json({
      ok: true,
      role: {
        ...role,
        permission_keys: (perms ?? []).map((p: { permission_key: string }) => p.permission_key),
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/roles/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing } = await supabase.from('club_portal_roles').select('club_id, is_system').eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ ok: false, error: 'Rol no encontrado' });
    const ex = existing as { club_id: string; is_system: boolean };
    if (ex.is_system) return res.status(400).json({ ok: false, error: 'No se pueden eliminar roles de sistema' });
    if (!canAccessClub(req, ex.club_id, 'roles.manage')) return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const { error } = await supabase.from('club_portal_roles').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/members', async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id, 'roles.manage')) {
    return res.status(403).json({ ok: false, error: 'No tienes permiso para ver el equipo' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: rows, error } = await supabase
      .from('club_portal_members')
      .select('id, club_id, auth_user_id, club_portal_role_id, created_at')
      .eq('club_id', club_id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const roleIds = [...new Set((rows ?? []).map((r: { club_portal_role_id: string }) => r.club_portal_role_id))];
    const roleById = new Map<string, { name: string; slug: string }>();
    if (roleIds.length) {
      const { data: roles } = await supabase.from('club_portal_roles').select('id, name, slug').in('id', roleIds);
      for (const r of (roles ?? []) as { id: string; name: string; slug: string }[]) {
        roleById.set(r.id, { name: r.name, slug: r.slug });
      }
    }
    const authIds = [...new Set((rows ?? []).map((r: { auth_user_id: string }) => r.auth_user_id))];
    const emailByAuth = new Map<string, string>();
    for (const uid of authIds) {
      const { data: u } = await supabase.auth.admin.getUserById(uid);
      const em = u?.user?.email;
      if (em) emailByAuth.set(uid, em);
    }
    const members = (rows ?? []).map(
      (r: { auth_user_id: string; club_portal_role_id: string }) => {
        const role = roleById.get(r.club_portal_role_id);
        return {
          ...r,
          email: emailByAuth.get(r.auth_user_id) ?? null,
          role_name: role?.name ?? null,
          role_slug: role?.slug ?? null,
        };
      }
    );
    return res.json({ ok: true, members });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/members/:id/role', async (req: Request, res: Response) => {
  const { id } = req.params;
  const roleId = String(req.body?.club_portal_role_id ?? '').trim();
  if (!roleId) return res.status(400).json({ ok: false, error: 'club_portal_role_id es obligatorio' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: member } = await supabase
      .from('club_portal_members')
      .select('id, club_id, auth_user_id')
      .eq('id', id)
      .maybeSingle();
    if (!member) return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
    const m = member as { id: string; club_id: string; auth_user_id: string };
    if (!canAccessClub(req, m.club_id, 'roles.manage')) {
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    }

    const { data: roleRow } = await supabase
      .from('club_portal_roles')
      .select('id, name, slug')
      .eq('id', roleId)
      .eq('club_id', m.club_id)
      .maybeSingle();
    if (!roleRow) return res.status(400).json({ ok: false, error: 'Rol no válido para este club' });

    const { error: updErr } = await supabase
      .from('club_portal_members')
      .update({ club_portal_role_id: roleId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updErr) return res.status(500).json({ ok: false, error: updErr.message });

    const { data: authData } = await supabase.auth.admin.getUserById(m.auth_user_id);
    const email = authData?.user?.email ?? null;
    return res.json({
      ok: true,
      member: {
        id: m.id,
        club_id: m.club_id,
        auth_user_id: m.auth_user_id,
        club_portal_role_id: roleId,
        email,
        role_name: (roleRow as { name?: string }).name ?? null,
        role_slug: (roleRow as { slug?: string }).slug ?? null,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/members/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: row } = await supabase.from('club_portal_members').select('club_id').eq('id', id).maybeSingle();
    if (!row) return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
    if (!canAccessClub(req, (row as { club_id: string }).club_id, 'roles.manage')) {
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    }
    const { error } = await supabase.from('club_portal_members').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/invites', async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id, 'roles.manage')) {
    return res.status(403).json({ ok: false, error: 'Sin permiso' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_portal_invites')
      .select('id, club_id, email, club_portal_role_id, expires_at, accepted_at, revoked_at, created_at')
      .eq('club_id', club_id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const invitesRaw = (data ?? []) as { club_portal_role_id: string }[];
    const rids = [...new Set(invitesRaw.map((i) => i.club_portal_role_id))];
    const roleNameById = new Map<string, string>();
    if (rids.length) {
      const { data: roles } = await supabase.from('club_portal_roles').select('id, name').in('id', rids);
      for (const r of (roles ?? []) as { id: string; name: string }[]) roleNameById.set(r.id, r.name);
    }
    const invites = invitesRaw.map((i) => ({
      ...i,
      role_name: roleNameById.get(i.club_portal_role_id) ?? null,
    }));
    return res.json({ ok: true, invites });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/invites', async (req: Request, res: Response) => {
  const { club_id, email, club_portal_role_id } = req.body ?? {};
  const cid = String(club_id ?? '').trim();
  const em = String(email ?? '').trim().toLowerCase();
  const rid = String(club_portal_role_id ?? '').trim();
  if (!cid || !em || !rid) {
    return res.status(400).json({ ok: false, error: 'club_id, email y club_portal_role_id son obligatorios' });
  }
  if (!canAccessClub(req, cid, 'roles.manage')) {
    return res.status(403).json({ ok: false, error: 'Sin permiso para invitar' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    await ensureDefaultPortalRolesForClub(supabase, cid);
    const { data: roleRow } = await supabase
      .from('club_portal_roles')
      .select('id')
      .eq('id', rid)
      .eq('club_id', cid)
      .maybeSingle();
    if (!roleRow) return res.status(400).json({ ok: false, error: 'Rol no válido para este club' });

    await supabase
      .from('club_portal_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('club_id', cid)
      .eq('email', em)
      .is('accepted_at', null)
      .is('revoked_at', null);

    const { token, tokenHash } = generateInviteToken();
    const expiresAt = getInviteExpiresAt().toISOString();
    const { error: invErr } = await supabase.from('club_portal_invites').insert({
      club_id: cid,
      email: em,
      club_portal_role_id: rid,
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by_auth_user_id: req.authContext!.userId,
    });
    if (invErr) return res.status(500).json({ ok: false, error: invErr.message });

    const { data: club } = await supabase.from('clubs').select('name').eq('id', cid).maybeSingle();
    const clubName = (club as { name?: string } | null)?.name ?? 'Tu club';
    const inviteUrl = `${getFrontendUrl()}/invitacion-equipo?token=${encodeURIComponent(token)}`;
    const mail = await sendClubPortalInviteEmail(em, clubName, inviteUrl);

    return res.status(201).json({
      ok: true,
      invite_url: inviteUrl,
      expires_at: expiresAt,
      email_sent: mail.sent,
      email_error: mail.error,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/invites/:id/revoke', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: inv } = await supabase.from('club_portal_invites').select('club_id, accepted_at').eq('id', id).maybeSingle();
    if (!inv) return res.status(404).json({ ok: false, error: 'Invitación no encontrada' });
    const row = inv as { club_id: string; accepted_at: string | null };
    if (row.accepted_at) return res.status(400).json({ ok: false, error: 'La invitación ya fue aceptada' });
    if (!canAccessClub(req, row.club_id, 'roles.manage')) return res.status(403).json({ ok: false, error: 'Sin permiso' });
    const { error } = await supabase
      .from('club_portal_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
