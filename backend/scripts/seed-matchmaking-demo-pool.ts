/**

 * Seed matchmaking demo pool: 5 bands × 3 players (15 bots) searching for a match.

 *

 * Each band has tight ELO (spread ≤ 0.3) so 3 bots alone never form a quartet (need 4).

 * Bands are far apart (>1.0) so bots from different bands do not mix without a real 4th player.

 * Bots have no preferred club — they match any real player regardless of club or distance mode.

 *

 * Usage:

 *   cd backend

 *   npx ts-node -r dotenv/config scripts/seed-matchmaking-demo-pool.ts

 *   npx ts-node -r dotenv/config scripts/seed-matchmaking-demo-pool.ts --clean

 *   npx ts-node -r dotenv/config scripts/seed-matchmaking-demo-pool.ts --run-cycle

 *

 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional DEMO_MM_PASSWORD (default DemoPadel2026!)

 */

import * as dotenv from 'dotenv';

import * as path from 'path';

import { createClient } from '@supabase/supabase-js';

import { ligaFromElo } from '../src/services/matchmakingLeague';

import { assignActiveMatchmakingSeasonIfNull } from '../src/services/matchmakingSeasonService';

import { runMatchmakingCycle } from '../src/services/matchmakingService';



dotenv.config({ path: path.resolve(__dirname, '../.env') });



const DEMO_EMAIL_DOMAIN = 'padel-demo.local';

const DEMO_PASSWORD = process.env.DEMO_MM_PASSWORD?.trim() || 'DemoPadel2026!';



type Band = {

  key: string;

  label: string;

  elos: [number, number, number];

};



const BANDS: Band[] = [

  { key: 'bronce', label: 'Bronce', elos: [1.2, 1.35, 1.5] },

  { key: 'plata_b', label: 'Plata B', elos: [2.4, 2.65, 2.85] },

  { key: 'plata', label: 'Plata', elos: [3.2, 3.45, 3.65] },

  { key: 'oro', label: 'Oro', elos: [4.2, 4.45, 4.7] },

  { key: 'elite', label: 'Elite', elos: [5.6, 5.85, 6.1] },

];



function muFromElo(elo: number): number {

  return 25.0 + (elo - 3.5) * 1.8;

}



/** Start of today (Europe/Madrid) so bots overlap mobile "hoy tarde/noche" windows. */

function slotWindow(): { available_from: string; available_until: string } {

  const parts = new Intl.DateTimeFormat('en-CA', {

    timeZone: 'Europe/Madrid',

    year: 'numeric',

    month: '2-digit',

    day: '2-digit',

  }).formatToParts(new Date());

  const y = Number(parts.find((p) => p.type === 'year')!.value);

  const m = Number(parts.find((p) => p.type === 'month')!.value);

  const d = Number(parts.find((p) => p.type === 'day')!.value);

  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const madridHour = Number(

    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }).format(probe),

  );

  const from = new Date(probe.getTime() - madridHour * 60 * 60 * 1000);

  const until = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);

  return { available_from: from.toISOString(), available_until: until.toISOString() };

}



async function main(): Promise<void> {

  const clean = process.argv.includes('--clean');

  const runCycle = process.argv.includes('--run-cycle');



  const url = process.env.SUPABASE_URL;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {

    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');

    process.exit(1);

  }



  const supabase = createClient(url, key, { auth: { persistSession: false } });



  const demoEmails = BANDS.flatMap((b, bi) =>

    [0, 1, 2].map((i) => `mm_demo_${b.key}_${i + 1}@${DEMO_EMAIL_DOMAIN}`),

  );



  if (clean) {

    console.log('Cleaning previous demo users…');

    const { data: players } = await supabase

      .from('players')

      .select('id, email, auth_user_id')

      .like('email', `%@${DEMO_EMAIL_DOMAIN}`);

    for (const p of players ?? []) {

      const row = p as { id: string; email: string; auth_user_id?: string | null };

      await supabase.from('matchmaking_pool').delete().eq('player_id', row.id);

      await supabase.from('players').delete().eq('id', row.id);

      if (row.auth_user_id) {

        try {

          await supabase.auth.admin.deleteUser(row.auth_user_id);

        } catch {

          /* ignore */

        }

      }

    }

    console.log(`Removed ${(players ?? []).length} demo player(s).`);

    return;

  }



  const slot = slotWindow();

  const created: Array<{ email: string; elo: number; band: string; playerId: string }> = [];



  for (const band of BANDS) {

    for (let i = 0; i < 3; i++) {

      const elo = band.elos[i];

      const n = i + 1;

      const email = `mm_demo_${band.key}_${n}@${DEMO_EMAIL_DOMAIN}`;

      const username = `mm_${band.key}_${n}`.slice(0, 30);

      const firstName = `Demo${band.label.replace(/\s/g, '')}`;

      const lastName = `M${n}`;



      const { data: authExisting } = await supabase.auth.admin.listUsers();

      const existingAuth = authExisting?.users?.find((u) => u.email === email);



      let authUserId = existingAuth?.id;

      if (!authUserId) {

        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({

          email,

          password: DEMO_PASSWORD,

          email_confirm: true,

          user_metadata: { full_name: `${firstName} ${lastName}` },

        });

        if (authErr) {

          console.error(`Auth create failed for ${email}:`, authErr.message);

          continue;

        }

        authUserId = authData.user?.id;

      }



      if (!authUserId) {

        console.error(`No auth user for ${email}`);

        continue;

      }



      const liga = ligaFromElo(elo);

      const playerPayload = {

        first_name: firstName,

        last_name: lastName,

        email,

        username,

        auth_user_id: authUserId,

        status: 'active',

        onboarding_completed: true,

        elo_rating: elo,

        mu: muFromElo(elo),

        sigma: 8.333,

        beta: 4.167,

        liga,

        sex: n % 2 === 0 ? 'male' : 'female',

        preferred_side: 'both',

        preferred_schedule_slots: ['morning', 'afternoon', 'evening'],

        preferred_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],

        preferred_play_style: 'competitive',

        preferred_match_duration_min: 90,

        preferred_partner_level: 'similar',

        favorite_clubs: [],

        updated_at: new Date().toISOString(),

      };



      const { data: existingPl } = await supabase

        .from('players')

        .select('id')

        .eq('email', email)

        .maybeSingle();



      let playerId: string;

      if (existingPl?.id) {

        playerId = existingPl.id as string;

        const { error: upErr } = await supabase.from('players').update(playerPayload).eq('id', playerId);

        if (upErr) {

          console.error(`Player update ${email}:`, upErr.message);

          continue;

        }

      } else {

        const { data: ins, error: insErr } = await supabase

          .from('players')

          .insert([playerPayload])

          .select('id')

          .maybeSingle();

        if (insErr || !ins) {

          console.error(`Player insert ${email}:`, insErr?.message);

          continue;

        }

        playerId = ins.id as string;

      }



      await assignActiveMatchmakingSeasonIfNull(supabase, playerId);



      await supabase.from('matchmaking_pool').delete().eq('player_id', playerId);



      const { error: poolErr } = await supabase.from('matchmaking_pool').insert({

        player_id: playerId,

        club_id: null,

        max_distance_km: null,

        preferred_side: 'any',

        gender: 'any',

        available_from: slot.available_from,

        available_until: slot.available_until,

        status: 'searching',

        search_lat: null,

        search_lng: null,

        expansion_offer: null,

        expansion_cycle_index: 0,

        last_expansion_prompt_at: null,

      });



      if (poolErr) {

        console.error(`Pool insert ${email}:`, poolErr.message);

        continue;

      }



      created.push({ email, elo, band: band.label, playerId });

      console.log(`  ✓ ${email}  elo=${elo}  liga=${liga}  pool=searching (sin club)`);

    }

  }



  console.log(`\nCreated/updated ${created.length} demo players in matchmaking pool (club_id NULL).`);

  console.log(`Password (all demo accounts): ${DEMO_PASSWORD}`);

  console.log('\nDemo flow: el cliente elige club asignado, radio km o sin club — empareja con 3 bots + él.');



  if (runCycle) {

    console.log('\nRunning matchmaking cycle…');

    const result = await runMatchmakingCycle();

    console.log(JSON.stringify(result, null, 2));

  } else {

    console.log('\nTip: pass --run-cycle to execute one matchmaking cycle after seeding.');

  }

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});


