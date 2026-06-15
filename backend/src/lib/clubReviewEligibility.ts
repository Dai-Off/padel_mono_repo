import type { SupabaseClient } from '@supabase/supabase-js';

/** Jugador con partido, reserva privada o torneo ya jugado en el club. */
export async function playerCanReviewClub(
  supabase: SupabaseClient,
  playerId: string,
  clubId: string,
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  const { data: courts, error: cErr } = await supabase
    .from('courts')
    .select('id')
    .eq('club_id', clubId);
  if (cErr) throw cErr;
  const courtIds = (courts ?? []).map((c: { id: string }) => c.id);
  if (courtIds.length === 0) return false;

  if (await hasPastPrivateReservation(supabase, playerId, courtIds, nowIso)) return true;
  if (await hasPastMatchAtClub(supabase, playerId, courtIds, nowIso)) return true;
  if (await hasPastTournamentAtClub(supabase, playerId, clubId, nowIso)) return true;
  return false;
}

async function hasPastPrivateReservation(
  supabase: SupabaseClient,
  playerId: string,
  courtIds: string[],
  nowIso: string,
): Promise<boolean> {
  const base = () =>
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .in('court_id', courtIds)
      .eq('reservation_type', 'standard')
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .lt('end_at', nowIso);

  const { count: asOrganizer } = await base().eq('organizer_player_id', playerId);
  if ((asOrganizer ?? 0) > 0) return true;

  const { data: participations } = await supabase
    .from('booking_participants')
    .select('booking_id')
    .eq('player_id', playerId);
  const bookingIds = [
    ...new Set(
      (participations ?? [])
        .map((p: { booking_id?: string | null }) => p.booking_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (bookingIds.length === 0) return false;

  const { count: asParticipant } = await base().in('id', bookingIds);
  return (asParticipant ?? 0) > 0;
}

async function hasPastMatchAtClub(
  supabase: SupabaseClient,
  playerId: string,
  courtIds: string[],
  nowIso: string,
): Promise<boolean> {
  const { data: mpRows } = await supabase
    .from('match_players')
    .select('match_id')
    .eq('player_id', playerId);
  const matchIds = [
    ...new Set(
      (mpRows ?? [])
        .map((r: { match_id?: string | null }) => r.match_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (matchIds.length === 0) return false;

  const { data: matches } = await supabase
    .from('matches')
    .select('booking_id')
    .in('id', matchIds);
  const bookingIds = [
    ...new Set(
      (matches ?? [])
        .map((m: { booking_id?: string | null }) => m.booking_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (bookingIds.length === 0) return false;

  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .in('id', bookingIds)
    .in('court_id', courtIds)
    .neq('status', 'cancelled')
    .is('deleted_at', null)
    .lt('end_at', nowIso);

  return (count ?? 0) > 0;
}

async function hasPastTournamentAtClub(
  supabase: SupabaseClient,
  playerId: string,
  clubId: string,
  nowIso: string,
): Promise<boolean> {
  const { data: rows, error } = await supabase
    .from('tournament_inscriptions')
    .select('tournaments!inner(club_id, end_at)')
    .or(`player_id_1.eq.${playerId},player_id_2.eq.${playerId}`)
    .eq('status', 'confirmed');
  if (error) throw error;

  return (rows ?? []).some((row) => {
    const t = (row as { tournaments?: { club_id?: string; end_at?: string | null } }).tournaments;
    if (!t || t.club_id !== clubId) return false;
    const endAt = t.end_at ? new Date(t.end_at).getTime() : NaN;
    return Number.isFinite(endAt) && endAt < new Date(nowIso).getTime();
  });
}

/** Clubes donde el jugador puede valorar (actividad previa) o ya tiene reseña. */
export async function listClubIdsEligibleForReview(
  supabase: SupabaseClient,
  playerId: string,
): Promise<string[]> {
  const nowIso = new Date().toISOString();
  const clubIds = new Set<string>();

  const { data: orgBookings, error: orgErr } = await supabase
    .from('bookings')
    .select('courts!inner(club_id)')
    .eq('organizer_player_id', playerId)
    .eq('reservation_type', 'standard')
    .neq('status', 'cancelled')
    .is('deleted_at', null)
    .lt('end_at', nowIso);
  if (orgErr) throw orgErr;
  for (const row of orgBookings ?? []) {
    const cid = (row as { courts?: { club_id?: string } }).courts?.club_id;
    if (cid) clubIds.add(cid);
  }

  const { data: participations, error: bpErr } = await supabase
    .from('booking_participants')
    .select('booking_id')
    .eq('player_id', playerId);
  if (bpErr) throw bpErr;
  const partBookingIds = [
    ...new Set(
      (participations ?? [])
        .map((p: { booking_id?: string | null }) => p.booking_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (partBookingIds.length > 0) {
    const { data: partBookings, error: pbErr } = await supabase
      .from('bookings')
      .select('courts!inner(club_id)')
      .in('id', partBookingIds)
      .eq('reservation_type', 'standard')
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .lt('end_at', nowIso);
    if (pbErr) throw pbErr;
    for (const row of partBookings ?? []) {
      const cid = (row as { courts?: { club_id?: string } }).courts?.club_id;
      if (cid) clubIds.add(cid);
    }
  }

  const { data: mpRows, error: mpErr } = await supabase
    .from('match_players')
    .select('match_id')
    .eq('player_id', playerId);
  if (mpErr) throw mpErr;
  const matchIds = [
    ...new Set(
      (mpRows ?? [])
        .map((r: { match_id?: string | null }) => r.match_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (matchIds.length > 0) {
    const { data: matches, error: mErr } = await supabase
      .from('matches')
      .select('booking_id')
      .in('id', matchIds);
    if (mErr) throw mErr;
    const bookingIds = [
      ...new Set(
        (matches ?? [])
          .map((m: { booking_id?: string | null }) => m.booking_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    if (bookingIds.length > 0) {
      const { data: matchBookings, error: mbErr } = await supabase
        .from('bookings')
        .select('courts!inner(club_id)')
        .in('id', bookingIds)
        .neq('status', 'cancelled')
        .is('deleted_at', null)
        .lt('end_at', nowIso);
      if (mbErr) throw mbErr;
      for (const row of matchBookings ?? []) {
        const cid = (row as { courts?: { club_id?: string } }).courts?.club_id;
        if (cid) clubIds.add(cid);
      }
    }
  }

  const { data: inscRows, error: inscErr } = await supabase
    .from('tournament_inscriptions')
    .select('tournaments!inner(club_id, end_at)')
    .or(`player_id_1.eq.${playerId},player_id_2.eq.${playerId}`)
    .eq('status', 'confirmed');
  if (inscErr) throw inscErr;
  for (const row of inscRows ?? []) {
    const t = (row as { tournaments?: { club_id?: string; end_at?: string | null } }).tournaments;
    if (!t?.club_id) continue;
    const endAt = t.end_at ? new Date(t.end_at).getTime() : NaN;
    if (Number.isFinite(endAt) && endAt < new Date(nowIso).getTime()) {
      clubIds.add(t.club_id);
    }
  }

  const { data: existingReviews, error: revErr } = await supabase
    .from('club_reviews')
    .select('club_id')
    .eq('player_id', playerId);
  if (revErr) throw revErr;
  for (const row of existingReviews ?? []) {
    const cid = (row as { club_id?: string }).club_id;
    if (cid) clubIds.add(cid);
  }

  return [...clubIds];
}
