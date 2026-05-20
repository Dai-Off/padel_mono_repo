import type { SupabaseClient } from '@supabase/supabase-js';

export function isSchoolCoachRole(role: string | null | undefined): boolean {
  const r = String(role ?? '').trim().toLowerCase();
  return /entrenador|entrenadora|coach|trainer/.test(r);
}

export async function assertSchoolCoachStaff(
  supabase: SupabaseClient,
  clubId: string,
  staffId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('club_staff')
    .select('id, club_id, role, status')
    .eq('id', staffId)
    .maybeSingle();
  if (error) return error.message;
  if (!data || (data as { club_id: string }).club_id !== clubId) {
    return 'staff_id inválido para este club';
  }
  if ((data as { status?: string }).status !== 'active') {
    return 'El empleado no está activo';
  }
  if (!isSchoolCoachRole((data as { role?: string }).role)) {
    return 'Solo los entrenadores pueden impartir cursos, clases particulares y tener tarifas propias';
  }
  return null;
}
