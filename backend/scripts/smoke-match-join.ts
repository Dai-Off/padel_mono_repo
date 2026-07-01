/**
 * Prueba de humo: varios jugadores se unen al mismo partido en paralelo (sin Stripe).
 *
 * Uso:
 *   cd backend
 *   npx ts-node -r dotenv/config scripts/smoke-match-join.ts <match_id>
 *
 * Variables:
 *   SMOKE_PLAYER_IDS=uuid1,uuid2,uuid3  (obligatorio; no incluir al organizador)
 *
 * Qué hace:
 * 1. Marca a cada jugador como guest paid en booking_participants
 * 2. Llama guestJoinMatchAfterPayment en paralelo (misma ruta que confirm-client)
 * 3. Verifica que todos quedaron en match_players con slots únicos
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getSupabaseServiceRoleClient } from '../src/lib/supabase';
import {
  assertGuestCanJoinMatch,
  guestJoinMatchAfterPayment,
} from '../src/services/matchPlayerSlotService';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main(): Promise<void> {
  const matchId = process.argv[2]?.trim();
  const playerIds = (process.env.SMOKE_PLAYER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!matchId) {
    console.error('Uso: npx ts-node -r dotenv/config scripts/smoke-match-join.ts <match_id>');
    console.error('Env: SMOKE_PLAYER_IDS=uuid1,uuid2,uuid3');
    process.exit(1);
  }
  if (playerIds.length === 0) {
    console.error('Define SMOKE_PLAYER_IDS con al menos un jugador (no el organizador).');
    process.exit(1);
  }

  const supabase = getSupabaseServiceRoleClient();

  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id, booking_id')
    .eq('id', matchId)
    .maybeSingle();
  if (matchErr || !match?.booking_id) {
    console.error('Partido no encontrado:', matchErr?.message ?? matchId);
    process.exit(1);
  }

  const bookingId = match.booking_id as string;
  const { data: booking } = await supabase
    .from('bookings')
    .select('total_price_cents')
    .eq('id', bookingId)
    .maybeSingle();
  const shareCents = Math.ceil(Number(booking?.total_price_cents ?? 0) / 4);

  console.log(`Match ${matchId} · booking ${bookingId}`);
  console.log(`Jugadores a unir en paralelo: ${playerIds.length}`);

  for (const playerId of playerIds) {
    const { data: existing } = await supabase
      .from('booking_participants')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('player_id', playerId)
      .maybeSingle();
    if (!existing) {
      const { error: insErr } = await supabase.from('booking_participants').insert({
        booking_id: bookingId,
        player_id: playerId,
        role: 'guest',
        share_amount_cents: shareCents,
        payment_status: 'paid',
      });
      if (insErr) {
        console.error(`booking_participants insert failed for ${playerId}:`, insErr.message);
        process.exit(1);
      }
    } else {
      await supabase
        .from('booking_participants')
        .update({ payment_status: 'paid' })
        .eq('booking_id', bookingId)
        .eq('player_id', playerId);
    }
  }

  const preferredSlots = [1, 2, 3].slice(0, playerIds.length);
  console.log('\n--- Fase 1: capacidad (simula create-intent en paralelo) ---');
  const capacityResults = await Promise.all(
    playerIds.map((playerId, i) =>
      assertGuestCanJoinMatch(supabase, matchId, bookingId, playerId, preferredSlots[i] ?? null),
    ),
  );
  capacityResults.forEach((r, i) => {
    if (!r.ok) console.log(`capacity BLOCK ${playerIds[i]}: ${r.code}`);
    else console.log(`capacity OK   ${playerIds[i]}: remaining≈${r.remaining}`);
  });

  console.log('\n--- Fase 2: unión tras pago (en paralelo) ---');
  const results = await Promise.all(
    playerIds.map((playerId, i) =>
      guestJoinMatchAfterPayment(supabase, bookingId, playerId, preferredSlots[i] ?? null),
    ),
  );

  let failed = 0;
  results.forEach((r, i) => {
    const pid = playerIds[i];
    if (!r.ok) {
      failed += 1;
      console.error(`FAIL ${pid}:`, r.code, r.error);
    } else {
      console.log(`OK   ${pid}: slot ${r.slot_index}${r.reassigned ? ' (reassigned)' : ''}`);
    }
  });

  const { data: rows } = await supabase
    .from('match_players')
    .select('player_id, slot_index')
    .eq('match_id', matchId)
    .order('slot_index');

  const slots = new Set<number>();
  for (const row of rows ?? []) {
    const s = Number((row as { slot_index?: number }).slot_index);
    if (s >= 0 && s <= 3) {
      if (slots.has(s)) {
        console.error(`DUPLICATE SLOT ${s} en match_players`);
        failed += 1;
      }
      slots.add(s);
    }
  }

  console.log('\nEstado final match_players:');
  for (const row of rows ?? []) {
    console.log(`  slot ${row.slot_index} → ${row.player_id}`);
  }

  if (failed > 0) {
    console.error(`\nSmoke test FAILED (${failed} errores)`);
    process.exit(1);
  }
  console.log('\nSmoke test PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
