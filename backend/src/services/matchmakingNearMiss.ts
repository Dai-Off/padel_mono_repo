/**
 * §6.1 — Grupos de 3 compatibles si el jugador relaja un criterio concreto (distancia o género).
 */
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { haversineKm } from '../lib/haversine';
import { sendMatchmakingExpansionNudge } from '../lib/mailer';
import {
  type PoolRow,
  type QuartetPreCourtContext,
  buildUnits,
  iterUnitCombos,
  resolveClubId,
  quartetPreCourtValid,
} from './matchmakingShared';

const DEFAULT_NEAR_MISS_AFTER_MS = 2 * 60 * 60 * 1000;
const MAX_TRIPLET_ITERATIONS = 400;

function nearMissAfterMs(): number {
  const n = Number(process.env.MATCHMAKING_NEAR_MISS_AFTER_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_NEAR_MISS_AFTER_MS;
}

function cloneRow(r: PoolRow): PoolRow {
  return { ...r };
}

export type NearMissOfferPayload = {
  kind: 'near_group_distance' | 'near_group_gender';
  title: string;
  message: string;
  offered_at: string;
  order_index: number;
  suggested_max_distance_km?: number;
  delta_km?: number;
  peer_player_ids: string[];
};

function unitContainingPlayer(units: { players: string[]; rows: PoolRow[] }[], playerId: string) {
  return units.find((u) => u.players.includes(playerId)) ?? null;
}

export async function runNearMissTripletScan(): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const now = Date.now();
  const nowIso = new Date().toISOString();
  const afterMs = nearMissAfterMs();

  const { data: poolRows, error } = await supabase
    .from('matchmaking_pool')
    .select(
      'id, player_id, paired_with_id, club_id, max_distance_km, preferred_side, gender, available_from, available_until, expires_at, search_lat, search_lng, created_at, expansion_offer, status',
    )
    .eq('status', 'searching');

  if (error) {
    console.error('[matchmaking near-miss]', error.message);
    return 0;
  }

  const rows = ((poolRows ?? []) as PoolRow[]).filter((r) => {
    const ex = r.expires_at;
    return !ex || new Date(ex).getTime() > Date.now();
  });

  if (rows.length < 4) return 0;

  const poolIds = [...new Set(rows.map((r) => r.player_id))];
  const { data: skillRows } = await supabase
    .from('players')
    .select('id, mu, sigma, beta, elo_rating, sex, liga')
    .in('id', poolIds);

  const skillsById = new Map<string, { mu: number; sigma: number; beta: number }>();
  const eloById = new Map<string, number>();
  const sexById = new Map<string, string | null>();
  const ligaById = new Map<string, string>();
  for (const p of skillRows ?? []) {
    const row = p as { id: string; mu: number; sigma: number; beta: number; elo_rating: number; sex: string | null; liga?: string | null };
    skillsById.set(row.id, { mu: row.mu, sigma: row.sigma, beta: row.beta });
    eloById.set(row.id, Number(row.elo_rating));
    sexById.set(row.id, row.sex ?? null);
    ligaById.set(row.id, row.liga ?? 'bronce');
  }

  const { data: hist } = await supabase
    .from('match_players')
    .select('player_id, result, created_at')
    .in('player_id', poolIds)
    .in('result', ['win', 'loss'])
    .order('created_at', { ascending: false });

  const recentById = new Map<string, ('win' | 'loss')[]>();
  for (const h of hist ?? []) {
    const pid = (h as { player_id: string }).player_id;
    const r = (h as { result: string }).result as 'win' | 'loss';
    const arr = recentById.get(pid) ?? [];
    if (arr.length >= 4) continue;
    arr.push(r);
    recentById.set(pid, arr);
  }

  const synergyMap = new Map<string, number>();
  if (poolIds.length >= 2) {
    const { data: synRows } = await supabase.from('player_synergies').select('player_id_1, player_id_2, value').in('player_id_1', poolIds);
    const set = new Set(poolIds);
    for (const row of synRows ?? []) {
      const a = (row as { player_id_1: string }).player_id_1;
      const b = (row as { player_id_2: string }).player_id_2;
      if (!set.has(b)) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      synergyMap.set(key, Number((row as { value: number }).value));
    }
  }

  const clubIds = [...new Set(rows.map((r) => r.club_id).filter(Boolean))] as string[];
  const clubPosById = new Map<string, { lat: number; lng: number }>();
  if (clubIds.length) {
    const { data: clubData } = await supabase.from('clubs').select('id, lat, lng').in('id', clubIds);
    for (const c of clubData ?? []) {
      const row = c as { id: string; lat: number | null; lng: number | null };
      if (row.lat != null && row.lng != null && Number.isFinite(row.lat) && Number.isFinite(row.lng)) {
        clubPosById.set(row.id, { lat: row.lat, lng: row.lng });
      }
    }
  }

  const ctxBase: QuartetPreCourtContext = {
    clubPosById,
    eloById,
    recentById,
    sexById,
    skillsById,
    synergyMap,
    ligaById,
  };

  const units = buildUnits(rows);
  const byPlayerRow = new Map(rows.map((r) => [r.player_id, r]));

  let sent = 0;

  for (const pRow of rows) {
    if (pRow.paired_with_id) continue;
    const raw = pRow as PoolRow & { expansion_offer?: unknown; created_at?: string };
    if (raw.expansion_offer != null) continue;

    const created = new Date(String(raw.created_at ?? 0)).getTime();
    if (!Number.isFinite(created) || now < created + afterMs) continue;

    const uP = unitContainingPlayer(units, pRow.player_id);
    if (!uP || uP.players.length !== 1) continue;

    const otherUnits = units.filter((u) => !u.players.includes(pRow.player_id));
    let iter = 0;
    let found: NearMissOfferPayload | null = null;

    for (const combo of iterUnitCombos(otherUnits, 3, 0, [])) {
      iter++;
      if (iter > MAX_TRIPLET_ITERATIONS) break;

      const tripletRows = combo.flatMap((u) => u.rows);
      const tripletIds = combo.flatMap((u) => u.players);
      if (tripletIds.length !== 3) continue;

      const flat4 = [...tripletRows, pRow];
      const ids4 = [...tripletIds, pRow.player_id];
      const clubId = resolveClubId(flat4);
      if (!clubId) continue;

      if (quartetPreCourtValid(flat4, ids4, clubId, ctxBase)) {
        continue;
      }

      const clubPos = clubPosById.get(clubId);
      if (
        pRow.max_distance_km != null &&
        pRow.max_distance_km > 0 &&
        clubPos &&
        pRow.search_lat != null &&
        pRow.search_lng != null
      ) {
        const km = haversineKm(pRow.search_lat, pRow.search_lng, clubPos.lat, clubPos.lng);
        if (km > pRow.max_distance_km) {
          const needMax = Math.ceil(km);
          const relaxedP = cloneRow(pRow);
          relaxedP.max_distance_km = needMax;
          const flatD = [...tripletRows, relaxedP];
          const idsD = [...tripletIds, pRow.player_id];
          if (quartetPreCourtValid(flatD, idsD, clubId, ctxBase)) {
            found = {
              kind: 'near_group_distance',
              title: 'Hay 3 jugadores compatibles cerca',
              message: `Tres jugadores ya encajan en horario y club; solo faltan unos km más de radio (≈${Math.ceil(km - pRow.max_distance_km)} km). ¿Ampliamos tu distancia máxima a ${needMax} km?`,
              offered_at: nowIso,
              order_index: -1,
              suggested_max_distance_km: needMax,
              delta_km: Math.ceil(km - pRow.max_distance_km),
              peer_player_ids: tripletIds,
            };
            break;
          }
        }
      }

      if (pRow.gender !== 'any' && pRow.gender !== 'mixed') {
        const relaxedG = cloneRow(pRow);
        relaxedG.gender = 'any';
        const flatG = [...tripletRows, relaxedG];
        const idsG = [...tripletIds, pRow.player_id];
        if (quartetPreCourtValid(flatG, idsG, clubId, ctxBase)) {
          found = {
            kind: 'near_group_gender',
            title: 'Hay 3 jugadores esperando',
            message:
              'Tres jugadores ya son compatibles en club y horario; tu preferencia de género del partido es lo que falta. ¿Ampliar a “cualquiera” para unirte a ese grupo?',
            offered_at: nowIso,
            order_index: -1,
            peer_player_ids: tripletIds,
          };
          break;
        }
      }
    }

    if (!found) continue;

    const { error: upErr } = await supabase
      .from('matchmaking_pool')
      .update({
        expansion_offer: found,
        last_expansion_prompt_at: nowIso,
        updated_at: nowIso,
      })
      .eq('player_id', pRow.player_id)
      .is('expansion_offer', null);

    if (upErr) continue;

    const push = await sendMatchmakingExpansionNudge({
      playerId: pRow.player_id,
      title: found.title,
      body: found.message,
      data: { kind: found.kind, source: 'matchmaking_near_miss', peer_player_ids: found.peer_player_ids },
    });
    if (!push.sent && push.error) {
      console.warn('[matchmaking near-miss] push:', push.error);
    }
    sent++;
  }

  return sent;
}
