import type { SupabaseClient } from '@supabase/supabase-js';

export async function fetchBookingRelatedPlayerIds(
  supabase: SupabaseClient,
  clubId: string
): Promise<string[]> {
  const { data: courts, error: cErr } = await supabase.from('courts').select('id').eq('club_id', clubId);
  if (cErr) throw new Error(cErr.message);
  const courtIds = (courts ?? []).map((c: { id: string }) => c.id);
  if (!courtIds.length) return [];

  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, organizer_player_id')
    .in('court_id', courtIds);
  if (bErr) throw new Error(bErr.message);

  const ids = new Set<string>();
  const bookingIds: string[] = [];
  for (const b of bookings ?? []) {
    bookingIds.push((b as { id: string }).id);
    const org = (b as { organizer_player_id: string | null }).organizer_player_id;
    if (org) ids.add(org);
  }
  if (bookingIds.length) {
    const { data: parts, error: pErr } = await supabase
      .from('booking_participants')
      .select('player_id')
      .in('booking_id', bookingIds);
    if (pErr) throw new Error(pErr.message);
    for (const p of parts ?? []) ids.add((p as { player_id: string }).player_id);
  }
  return [...ids];
}

export async function fetchLinkedPlayerIds(
  supabase: SupabaseClient,
  clubId: string
): Promise<string[]> {
  const { data, error } = await supabase.from('club_player_contacts').select('player_id').eq('club_id', clubId);
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('does not exist') || m.includes('schema cache')) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r: { player_id: string }) => r.player_id);
}

export async function getClubClientPlayerIds(supabase: SupabaseClient, clubId: string): Promise<string[]> {
  const [fromBookings, linked] = await Promise.all([
    fetchBookingRelatedPlayerIds(supabase, clubId),
    fetchLinkedPlayerIds(supabase, clubId),
  ]);
  return [...new Set([...fromBookings, ...linked])];
}
