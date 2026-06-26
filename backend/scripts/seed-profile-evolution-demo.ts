/**
 * Seed de datos DEMO para la "Evolución del nivel" + "Estadísticas" del perfil.
 *
 * Crea partidos de matchmaking CONFIRMADOS (bookings + matches + match_players)
 * para el usuario de prueba `testwebpadel7@gmail.com`, además de un par de
 * partidos entre otros jugadores. Solo escribe en bookings/matches/match_players
 * (NO modifica la tabla players), por lo que es 100% reversible.
 *
 * El endpoint GET /players/me/level-history reconstruye el ELO hacia atrás desde
 * players.elo_rating actual, así que NO hace falta tocar el ELO del jugador.
 *
 * Uso:
 *   npm run seed:profile-evolution          # crea los datos demo
 *   npm run seed:profile-evolution -- --clean   # elimina los datos demo creados
 *
 * Los IDs creados se guardan en backend/scripts/.seed-profile-evolution.json
 * para poder limpiarlos luego (al borrar las bookings, el cascade elimina
 * matches y match_players).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const TEST_EMAIL = 'testwebpadel7@gmail.com';
const STATE_FILE = path.join(__dirname, '.seed-profile-evolution.json');

type PlayerLite = { id: string; first_name: string | null; last_name: string | null };

// Partidos del usuario de prueba (orden cronológico ascendente). El test user
// siempre va en el equipo A. El signo del delta define victoria/derrota.
const TEST_USER_MATCHES = [
  { daysAgo: 84, delta: 0.2, sets: [{ a: 6, b: 3 }, { a: 6, b: 4 }] },
  { daysAgo: 72, delta: -0.14, sets: [{ a: 4, b: 6 }, { a: 6, b: 7 }] },
  { daysAgo: 60, delta: 0.27, sets: [{ a: 6, b: 2 }, { a: 6, b: 1 }] },
  { daysAgo: 48, delta: 0.18, sets: [{ a: 7, b: 5 }, { a: 6, b: 4 }] },
  { daysAgo: 35, delta: 0.12, sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 6, b: 3 }] },
  { daysAgo: 24, delta: -0.09, sets: [{ a: 5, b: 7 }, { a: 4, b: 6 }] },
  { daysAgo: 12, delta: 0.22, sets: [{ a: 6, b: 1 }, { a: 6, b: 3 }] },
  { daysAgo: 4, delta: 0.1, sets: [{ a: 7, b: 6 }, { a: 6, b: 4 }] },
];

// Partidos entre otros jugadores (sin el test user).
const OTHERS_MATCHES = [
  { daysAgo: 40, delta: 0.15, sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }] },
  { daysAgo: 18, delta: -0.11, sets: [{ a: 3, b: 6 }, { a: 4, b: 6 }] },
];

const MATCH_DURATION_MIN = 90;

function isoDaysAgo(daysAgo: number): { start: string; end: string } {
  const base = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  const start = new Date(base);
  start.setUTCHours(18, 0, 0, 0); // 18:00 UTC, hora plausible de partido
  const end = new Date(start.getTime() + MATCH_DURATION_MIN * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function resolvePlayerByEmail(supabase: SupabaseClient, email: string): Promise<PlayerLite> {
  const { data, error } = await supabase
    .from('players')
    .select('id, first_name, last_name')
    .eq('email', email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No existe un jugador con email ${email}`);
  return data as PlayerLite;
}

async function pickCourtId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.from('courts').select('id').limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No hay ninguna pista (courts) en la base de datos.');
  return (data as { id: string }).id;
}

async function pickOtherPlayers(supabase: SupabaseClient, excludeId: string, n: number): Promise<PlayerLite[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id, first_name, last_name')
    .neq('id', excludeId)
    .not('first_name', 'is', null)
    .eq('status', 'active')
    .limit(n);
  if (error) throw new Error(error.message);
  const list = (data ?? []) as PlayerLite[];
  if (list.length < 4) {
    throw new Error(`Se necesitan al menos 4 jugadores adicionales con nombre; encontrados ${list.length}.`);
  }
  return list;
}

type CreatedIds = { bookingIds: string[]; matchIds: string[] };

async function createMatch(
  supabase: SupabaseClient,
  opts: {
    courtId: string;
    organizerId: string;
    start: string;
    end: string;
    sets: { a: number; b: number }[];
    // 4 jugadores: [A0, A1, B0, B1]
    players: string[];
    // delta de ELO del jugador "principal" (slot 0) — los demás se derivan
    primaryDelta: number;
  },
  created: CreatedIds,
): Promise<void> {
  const { courtId, organizerId, start, end, sets, players, primaryDelta } = opts;

  // 1) booking
  const { data: booking, error: eB } = await supabase
    .from('bookings')
    .insert({
      court_id: courtId,
      organizer_player_id: organizerId,
      start_at: start,
      end_at: end,
      total_price_cents: 0,
      currency: 'EUR',
      status: 'completed',
    })
    .select('id')
    .single();
  if (eB) throw new Error(`booking: ${eB.message}`);
  const bookingId = (booking as { id: string }).id;
  created.bookingIds.push(bookingId);

  // ¿gana el equipo A? (cuenta sets ganados)
  let setsA = 0;
  let setsB = 0;
  for (const s of sets) {
    if (s.a > s.b) setsA++;
    else if (s.b > s.a) setsB++;
  }
  const teamAWins = setsA > setsB;

  // 2) match
  const { data: match, error: eM } = await supabase
    .from('matches')
    .insert({
      booking_id: bookingId,
      competitive: true,
      type: 'matchmaking',
      score_status: 'confirmed',
      status: 'finished',
      match_end_reason: 'completed',
      sets,
      visibility: 'private',
    })
    .select('id')
    .single();
  if (eM) throw new Error(`match: ${eM.message}`);
  const matchId = (match as { id: string }).id;
  created.matchIds.push(matchId);

  // 3) match_players (4)
  const teams: ('A' | 'B')[] = ['A', 'A', 'B', 'B'];
  // delta: slot 0 = primaryDelta; su compañero similar; rivales signo opuesto
  const deltas = [
    primaryDelta,
    Math.round(primaryDelta * 0.8 * 100) / 100,
    Math.round(-primaryDelta * 0.9 * 100) / 100,
    Math.round(-primaryDelta * 1.1 * 100) / 100,
  ];
  const rows = players.map((pid, i) => {
    const team = teams[i];
    const teamWins = team === 'A' ? teamAWins : !teamAWins;
    const result = setsA === setsB ? 'draw' : teamWins ? 'win' : 'loss';
    return {
      match_id: matchId,
      player_id: pid,
      team,
      slot_index: i,
      invite_status: 'accepted',
      result,
      rating_change: deltas[i],
      created_at: start,
    };
  });
  const { error: eMP } = await supabase.from('match_players').insert(rows);
  if (eMP) throw new Error(`match_players: ${eMP.message}`);
}

async function clean(supabase: SupabaseClient): Promise<void> {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('No hay state file; nada que limpiar.');
    return;
  }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as CreatedIds;
  const bookingIds = state.bookingIds ?? [];
  if (!bookingIds.length) {
    console.log('No hay bookings registradas en el state file.');
  } else {
    // Borrar match_players y matches explícitamente por si el cascade no aplica,
    // luego las bookings.
    for (const mid of state.matchIds ?? []) {
      await supabase.from('match_players').delete().eq('match_id', mid);
      await supabase.from('matches').delete().eq('id', mid);
    }
    for (const bid of bookingIds) {
      await supabase.from('bookings').delete().eq('id', bid);
    }
    console.log(`Eliminadas ${bookingIds.length} booking(s) y ${(state.matchIds ?? []).length} match(es) demo.`);
  }
  fs.unlinkSync(STATE_FILE);
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  if (process.argv.includes('--clean')) {
    await clean(supabase);
    return;
  }

  if (fs.existsSync(STATE_FILE)) {
    console.error('Ya existe un seed previo (state file presente). Ejecuta primero con --clean.');
    process.exit(1);
  }

  const testUser = await resolvePlayerByEmail(supabase, TEST_EMAIL);
  const courtId = await pickCourtId(supabase);
  const pool = await pickOtherPlayers(supabase, testUser.id, 7);

  console.log(`Test user: ${testUser.first_name ?? ''} ${testUser.last_name ?? ''} (${testUser.id})`);
  console.log(`Pista demo: ${courtId}`);
  console.log(`Jugadores en pool: ${pool.length}`);

  const created: CreatedIds = { bookingIds: [], matchIds: [] };

  try {
    // Partidos con el test user (slot 0 = test user, equipo A)
    let rot = 0;
    for (const m of TEST_USER_MATCHES) {
      const { start, end } = isoDaysAgo(m.daysAgo);
      const partner = pool[rot % pool.length];
      const rivalA = pool[(rot + 1) % pool.length];
      const rivalB = pool[(rot + 2) % pool.length];
      rot += 3;
      await createMatch(
        supabase,
        {
          courtId,
          organizerId: testUser.id,
          start,
          end,
          sets: m.sets,
          players: [testUser.id, partner.id, rivalA.id, rivalB.id],
          primaryDelta: m.delta,
        },
        created,
      );
      console.log(`  ✓ partido testuser ${start.slice(0, 10)} (Δ ${m.delta})`);
    }

    // Partidos entre otros jugadores
    for (const m of OTHERS_MATCHES) {
      const { start, end } = isoDaysAgo(m.daysAgo);
      const four = [pool[0], pool[1], pool[2], pool[3]];
      await createMatch(
        supabase,
        {
          courtId,
          organizerId: four[0].id,
          start,
          end,
          sets: m.sets,
          players: four.map((p) => p.id),
          primaryDelta: m.delta,
        },
        created,
      );
      console.log(`  ✓ partido otros ${start.slice(0, 10)} (Δ ${m.delta})`);
    }

    fs.writeFileSync(STATE_FILE, JSON.stringify(created, null, 2));
    console.log(`\nCreados ${created.matchIds.length} partidos. State guardado en ${STATE_FILE}`);
    console.log('Para deshacer: npm run seed:profile-evolution -- --clean');
  } catch (err) {
    console.error('\nError sembrando; revirtiendo lo creado…', err);
    // rollback parcial
    for (const mid of created.matchIds) {
      await supabase.from('match_players').delete().eq('match_id', mid);
      await supabase.from('matches').delete().eq('id', mid);
    }
    for (const bid of created.bookingIds) {
      await supabase.from('bookings').delete().eq('id', bid);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
