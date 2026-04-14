import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { sendMatchmakingExpansionNudge } from '../lib/mailer';
import { runNearMissTripletScan } from './matchmakingNearMiss';

const DEFAULT_FIRST_MS = 3 * 60 * 60 * 1000;
const DEFAULT_STEP_MS = 6 * 60 * 60 * 1000;

export type ExpansionOfferKind = 'side_any' | 'gender_any' | 'dist_plus_5' | 'dist_plus_10';

export type NearGroupOfferKind = 'near_group_distance' | 'near_group_gender';

export type ExpansionOfferPayload = {
  kind: ExpansionOfferKind | NearGroupOfferKind;
  title: string;
  message: string;
  offered_at: string;
  order_index: number;
  suggested_max_distance_km?: number;
  delta_km?: number;
  peer_player_ids?: string[];
};

const ORDER: ExpansionOfferKind[] = ['side_any', 'gender_any', 'dist_plus_5', 'dist_plus_10'];

function firstPromptMs(): number {
  const n = Number(process.env.MATCHMAKING_EXPANSION_FIRST_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FIRST_MS;
}

function stepPromptMs(): number {
  const n = Number(process.env.MATCHMAKING_EXPANSION_STEP_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STEP_MS;
}

function applies(kind: ExpansionOfferKind, row: Record<string, unknown>): boolean {
  const side = row.preferred_side as string | null;
  const gender = String(row.gender ?? 'any');
  const maxKm = row.max_distance_km as number | null;
  switch (kind) {
    case 'side_any':
      return side != null && side !== 'any';
    case 'gender_any':
      return gender === 'male' || gender === 'female';
    case 'dist_plus_5':
      return maxKm != null && maxKm < 120;
    case 'dist_plus_10':
      return maxKm != null && maxKm < 110;
    default:
      return false;
  }
}

function messageFor(kind: ExpansionOfferKind, row: Record<string, unknown>): { title: string; message: string } {
  const maxKm = row.max_distance_km as number | null;
  switch (kind) {
    case 'side_any':
      return {
        title: 'Ampliar posición en pista',
        message:
          'Llevás varias horas buscando partido. ¿Querés jugar también en el otro lado (reves) para encontrar antes?',
      };
    case 'gender_any':
      return {
        title: 'Ampliar tipo de partido',
        message:
          'No encontramos partido con tu preferencia de género. ¿Querés ampliar a “cualquiera” para este matchmaking?',
      };
    case 'dist_plus_5':
      return {
        title: 'Ampliar distancia',
        message: `¿Sumamos +5 km a tu radio (${maxKm ?? '?'} km) para buscar clubes un poco más lejos?`,
      };
    case 'dist_plus_10':
      return {
        title: 'Ampliar distancia',
        message: `¿Sumamos +10 km a tu radio (${maxKm ?? '?'} km) para más opciones?`,
      };
    default:
      return { title: 'Matchmaking', message: '¿Querés ampliar criterios de búsqueda?' };
  }
}

function pickKindFromIndex(startIndex: number, row: Record<string, unknown>): { kind: ExpansionOfferKind; orderIndex: number } | null {
  for (let i = startIndex; i < ORDER.length; i++) {
    const k = ORDER[i];
    if (applies(k, row)) return { kind: k, orderIndex: i };
  }
  return null;
}

/**
 * §6.2 — ampliaciones progresivas (lado → género → distancia).
 */
async function runProgressiveExpansionScan(): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const now = Date.now();
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('matchmaking_pool')
    .select(
      'player_id, preferred_side, gender, max_distance_km, created_at, expansion_offer, expansion_cycle_index, last_expansion_prompt_at',
    )
    .eq('status', 'searching');

  if (error) {
    console.error('[matchmaking expansion]', error.message);
    return 0;
  }

  let sent = 0;
  const firstMs = firstPromptMs();
  const stepMs = stepPromptMs();

  for (const raw of rows ?? []) {
    const row = raw as Record<string, unknown>;
    if (row.expansion_offer) continue;

    const cycle = Number(row.expansion_cycle_index ?? 0);
    if (cycle >= ORDER.length) continue;

    const created = new Date(String(row.created_at)).getTime();
    if (!Number.isFinite(created)) continue;

    const lastPrompt = row.last_expansion_prompt_at
      ? new Date(String(row.last_expansion_prompt_at)).getTime()
      : null;
    const minNext =
      lastPrompt != null && Number.isFinite(lastPrompt) ? lastPrompt + stepMs : created + firstMs;
    if (now < minNext) continue;

    const picked = pickKindFromIndex(cycle, row);
    if (!picked) continue;

    const { title, message } = messageFor(picked.kind, row);
    const payload = {
      kind: picked.kind,
      title,
      message,
      offered_at: nowIso,
      order_index: picked.orderIndex,
    };

    const { error: upErr } = await supabase
      .from('matchmaking_pool')
      .update({
        expansion_offer: payload,
        last_expansion_prompt_at: nowIso,
        updated_at: nowIso,
      })
      .eq('player_id', row.player_id as string)
      .is('expansion_offer', null);

    if (upErr) continue;

    const push = await sendMatchmakingExpansionNudge({
      playerId: row.player_id as string,
      title,
      body: message,
      data: { kind: picked.kind, source: 'matchmaking_expansion' },
    });
    if (!push.sent && push.error) {
      console.warn('[matchmaking expansion] push:', push.error);
    }
    sent++;
  }

  return sent;
}

/** §6.1 primero, luego §6.2. */
export async function runMatchmakingExpansionScan(): Promise<number> {
  const near = await runNearMissTripletScan();
  const prog = await runProgressiveExpansionScan();
  return near + prog;
}

export function applyExpansionAccept(
  kind: ExpansionOfferKind | NearGroupOfferKind,
  row: {
    max_distance_km: number | null;
    preferred_side: string | null;
    gender: string;
  },
  extras?: { suggested_max_distance_km?: number },
): Record<string, unknown> {
  if (kind === 'near_group_distance') {
    const sm = extras?.suggested_max_distance_km;
    if (sm == null || !Number.isFinite(Number(sm))) return {};
    return { max_distance_km: Math.round(Number(sm)) };
  }
  if (kind === 'near_group_gender') {
    return { gender: 'any' };
  }
  switch (kind) {
    case 'side_any':
      return { preferred_side: null };
    case 'gender_any':
      return { gender: 'any' };
    case 'dist_plus_5':
      return { max_distance_km: (row.max_distance_km ?? 0) + 5 };
    case 'dist_plus_10':
      return { max_distance_km: (row.max_distance_km ?? 0) + 10 };
    default:
      return {};
  }
}
