/**
 * Ensures testwebpadel1..12@gmail.com exist as players (Elo + gender) and
 * adds confirmed tournament inscriptions so you can generate brackets from the web.
 *
 * Usage (from backend/):
 *   npx ts-node -r dotenv/config scripts/seed-tournament-test-players.ts <TOURNAMENT_UUID>
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createHash } from 'crypto';
import { getSupabaseServiceRoleClient } from '../src/lib/supabase';
import { refreshTournamentStatus } from '../src/services/tournamentsService';

const EMAILS = Array.from({ length: 12 }, (_, i) => `testwebpadel${i + 1}@gmail.com`);

function tokenHashFromSeed(seed: string): string {
  return createHash('sha256').update(`seed-tournament-test:${seed}`).digest('hex');
}

type TourneyRow = {
  id: string;
  registration_mode: string;
  max_players: number;
  invite_ttl_minutes: number;
  gender: string | null;
  elo_min: number | null;
  elo_max: number | null;
};

function eloForTournament(t: TourneyRow, index: number): number {
  const min = t.elo_min != null ? Number(t.elo_min) : null;
  const max = t.elo_max != null ? Number(t.elo_max) : null;
  if (min != null && max != null && min <= max) {
    const span = max - min;
    const step = span > 0 ? (index % 5) * (span / 4) : 0;
    return Math.min(max, Math.max(min, min + step));
  }
  return 3.5 + (index % 5) * 0.25;
}

function genderForTournament(tg: string | null | undefined): string {
  const g = String(tg ?? '').toLowerCase();
  if (g === 'male' || g === 'female') return g;
  return 'any';
}

async function main() {
  const tournamentId = process.argv[2]?.trim();
  if (!tournamentId) {
    console.error('Uso: npx ts-node -r dotenv/config scripts/seed-tournament-test-players.ts <TOURNAMENT_UUID>');
    process.exit(1);
  }

  const supabase = getSupabaseServiceRoleClient();

  const { data: tourney, error: tErr } = await supabase
    .from('tournaments')
    .select('id, registration_mode, max_players, invite_ttl_minutes, gender, elo_min, elo_max')
    .eq('id', tournamentId)
    .maybeSingle();

  if (tErr) throw new Error(tErr.message);
  if (!tourney) {
    console.error('Torneo no encontrado:', tournamentId);
    process.exit(1);
  }

  const t = tourney as TourneyRow;
  const mode = String(t.registration_mode ?? 'individual');
  const maxP = Number(t.max_players);
  if (maxP < 12) {
    console.error(
      `max_players (${maxP}) es menor que 12 jugadores de prueba. Aumentá el cupo del torneo.`,
    );
    process.exit(1);
  }

  const gPlayer = genderForTournament(t.gender);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(1, Number(t.invite_ttl_minutes)) * 60_000).toISOString();

  const playerIds: string[] = [];

  for (let i = 0; i < EMAILS.length; i += 1) {
    const email = EMAILS[i];
    const elo = eloForTournament(t, i);
    const first = 'Test';
    const last = `WebPadel ${i + 1}`;

    const { data: existing } = await supabase.from('players').select('id').eq('email', email).maybeSingle();

    if (existing?.id) {
      const { error: uErr } = await supabase
        .from('players')
        .update({
          elo_rating: elo,
          gender: gPlayer,
          initial_rating_completed: true,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (uErr) throw new Error(`Update player ${email}: ${uErr.message}`);
      playerIds.push(existing.id as string);
      console.log('Actualizado:', email, '→', existing.id);
    } else {
      const { data: created, error: cErr } = await supabase
        .from('players')
        .insert({
          first_name: first,
          last_name: last,
          email,
          status: 'active',
          elo_rating: elo,
          gender: gPlayer,
          initial_rating_completed: true,
        })
        .select('id')
        .single();
      if (cErr) throw new Error(`Insert player ${email}: ${cErr.message}`);
      playerIds.push(created!.id as string);
      console.log('Creado:', email, '→', created!.id);
    }
  }

  if (mode === 'pair') {
    for (let p = 0; p < 6; p += 1) {
      const p1 = playerIds[p * 2];
      const p2 = playerIds[p * 2 + 1];
      const { data: dup } = await supabase
        .from('tournament_inscriptions')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('player_id_1', p1)
        .eq('player_id_2', p2)
        .eq('status', 'confirmed')
        .maybeSingle();
      if (dup) {
        console.log('Inscripción pareja ya existe:', p1, p2);
        continue;
      }
      const { error: insErr } = await supabase.from('tournament_inscriptions').insert({
        tournament_id: tournamentId,
        status: 'confirmed',
        invited_at: now,
        expires_at: expiresAt,
        confirmed_at: now,
        player_id_1: p1,
        player_id_2: p2,
        token_hash: tokenHashFromSeed(`${tournamentId}:pair:${p}:${p1}:${p2}`),
      });
      if (insErr) throw new Error(`Insert inscription pair ${p + 1}: ${insErr.message}`);
      console.log('Inscripto pareja', p + 1, p1, p2);
    }
  } else {
    for (let i = 0; i < playerIds.length; i += 1) {
      const pid = playerIds[i];
      const { data: dup } = await supabase
        .from('tournament_inscriptions')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('player_id_1', pid)
        .maybeSingle();
      if (dup) {
        const { error: fix } = await supabase
          .from('tournament_inscriptions')
          .update({ status: 'confirmed', confirmed_at: now, updated_at: now, player_id_2: null })
          .eq('id', dup.id);
        if (fix) throw new Error(`Update inscription: ${fix.message}`);
        console.log('Ya inscripto, dejado en confirmed:', pid);
        continue;
      }
      const { error: insErr } = await supabase.from('tournament_inscriptions').insert({
        tournament_id: tournamentId,
        status: 'confirmed',
        invited_at: now,
        expires_at: expiresAt,
        confirmed_at: now,
        player_id_1: pid,
        player_id_2: null,
        token_hash: tokenHashFromSeed(`${tournamentId}:single:${i}:${pid}`),
      });
      if (insErr) throw new Error(`Insert inscription ${i + 1}: ${insErr.message}`);
      console.log('Inscripto individual', i + 1, pid);
    }
  }

  await refreshTournamentStatus(tournamentId, { force: true });
  console.log('Listo. Estado del torneo actualizado (open/closed según cupo).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
