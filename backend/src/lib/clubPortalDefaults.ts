import type { SupabaseClient } from '@supabase/supabase-js';

const SYSTEM_ROLES: { slug: string; name: string; permissions: string[] }[] = [
  {
    slug: 'recepcion',
    name: 'Recepción',
    permissions: ['grilla', 'clientes'],
  },
  {
    slug: 'profesor',
    name: 'Profesor',
    permissions: ['grilla', 'escuela'],
  },
  {
    slug: 'administrador',
    name: 'Administrador',
    permissions: ['club.manage', 'roles.manage', 'grilla', 'clientes', 'finanzas', 'torneos', 'escuela', 'gestion', 'configuracion'],
  },
];

/**
 * Crea los tres roles de sistema por club si aún no existen (idempotente).
 */
export async function ensureDefaultPortalRolesForClub(
  supabase: SupabaseClient,
  clubId: string
): Promise<void> {
  const { count, error: cErr } = await supabase
    .from('club_portal_roles')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId);
  if (cErr) {
    if (cErr.message.includes('does not exist')) return;
    throw new Error(cErr.message);
  }
  if ((count ?? 0) > 0) return;

  for (const def of SYSTEM_ROLES) {
    const { data: role, error: rErr } = await supabase
      .from('club_portal_roles')
      .insert({
        club_id: clubId,
        name: def.name,
        slug: def.slug,
        is_system: true,
      })
      .select('id')
      .single();
    if (rErr) throw new Error(rErr.message);
    const roleId = (role as { id: string }).id;
    const permRows = def.permissions.map((permission_key) => ({ role_id: roleId, permission_key }));
    const { error: pErr } = await supabase.from('club_portal_role_permissions').insert(permRows);
    if (pErr) throw new Error(pErr.message);
  }
}
