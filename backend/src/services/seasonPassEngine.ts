import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getActiveSeasonRow, SeasonPassSeasonRow } from './seasonPassSeasonConfig';
import { computeSeasonPass, getOrCreateSeasonPassRow } from './seasonPassService';
import { grantSeasonPassSp, SeasonPassGrantResult } from './seasonPassGrant';
import {
  addDaysToKey,
  currentPeriod,
  MissionPeriod,
  MissionPeriodKind,
  periodForRow,
} from './seasonPassPeriods';
import {
  evaluateMissionCondition,
  MissionDefRow,
  SeasonPassEvalContext,
} from './seasonPassEvaluators';

const DAILY_DRAW_COUNT = 3; // rotating dailies per player per day (PDF §3.1)
const WEEKLY_ACTIVE_COUNT = 6; // community-wide weeklies per ISO week (PDF §3.1)
const EVAL_COOLDOWN_MS = 30_000; // skip re-evaluating on rapid consecutive reads
const LOOKBACK_DAYS = 40; // re-check recent incomplete rows (covers month close)
const PAST_PERIOD_GRACE_DAYS = 2; // still evaluate periods that ended this recently

const lastEvalByPlayer = new Map<string, number>();

export type SeasonPassMissionPayload = {
  id: string; // mission definition id (stable across periods)
  assignment_id: string; // player_season_pass_missions row id (ack/reroll target)
  slug: string;
  period: MissionPeriodKind;
  icon: string;
  title: string;
  description: string;
  sp_reward: number;
  reward_hint: string | null;
  target: number;
  current: number;
  done: boolean;
  sp_granted: number | null;
  period_end_iso: string | null;
  expires_label: string | null;
};

export type SeasonPassPendingCelebration = {
  assignment_id: string;
  slug: string;
  icon: string;
  title: string;
  period: MissionPeriodKind;
  sp_granted: number;
  completed_at: string;
};

export type SeasonPassCompletedMission = {
  slug: string;
  icon: string;
  title: string;
  period: MissionPeriodKind;
  sp_granted: number;
};

/** Block attached to in-app action responses (instant channel, plan §6.7). */
export type SeasonPassDelta = {
  completed_missions: SeasonPassCompletedMission[];
  sp_total: number;
  level: number;
  boost_applied: number;
  level_up: { from: number; to: number; rewards: unknown[] } | null;
};

export type SeasonPassState = {
  missions: SeasonPassMissionPayload[];
  pending_celebrations: SeasonPassPendingCelebration[];
};

type AssignmentRow = {
  id: string;
  mission_id: string;
  period_start: string;
  progress: number;
  completed_at: string | null;
  sp_granted: number | null;
  notified_at: string | null;
};

type CompletedNow = {
  def: MissionDefRow;
  grant: SeasonPassGrantResult;
};

// ---------------------------------------------------------------------------
// Deterministic draw (no cron: same player + same day → same missions)
// ---------------------------------------------------------------------------

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawDeterministic<T>(items: T[], count: number, seedStr: string): T[] {
  const arr = [...items];
  const rnd = mulberry32(fnv1a(seedStr));
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.max(0, count));
}

// ---------------------------------------------------------------------------
// Definitions + assignments
// ---------------------------------------------------------------------------

async function loadActiveDefs(seasonSlug: string): Promise<MissionDefRow[]> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('season_pass_mission_definitions')
    .select(
      'id, slug, icon, title, description, period, target_count, sp_reward, sort_order, condition_key, condition_params, assignment, reward_hint'
    )
    .eq('season_slug', seasonSlug)
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MissionDefRow[];
}

type CurrentPeriods = Record<MissionPeriodKind, MissionPeriod>;

/**
 * Lazy assignment (plan §6.2): materialize the rows for the player's current
 * day/week/month. Idempotent upsert — the unique key ignores existing rows.
 * - daily: fixed anchor missions + DAILY_DRAW_COUNT drawn with a PRNG seeded
 *   by (player, day) → per-player rotation, reproducible without state.
 * - weekly: WEEKLY_ACTIVE_COUNT drawn with (season, monday) → same for all.
 * - monthly: every active monthly mission.
 */
async function ensureAssignments(
  playerId: string,
  season: SeasonPassSeasonRow,
  defs: MissionDefRow[],
  periods: CurrentPeriods
): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const bySlug = (a: MissionDefRow, b: MissionDefRow) => a.slug.localeCompare(b.slug);

  const dailyFixed = defs.filter((d) => d.assignment === 'daily_fixed' && d.period === 'daily');
  const dailyPool = defs.filter((d) => d.assignment === 'daily_pool' && d.period === 'daily').sort(bySlug);
  const weeklyPool = defs
    .filter((d) => d.assignment === 'weekly_calendar' && d.period === 'weekly')
    .sort(bySlug);
  const monthlyAll = defs.filter((d) => d.assignment === 'monthly_all' && d.period === 'monthly');

  const daily = [
    ...dailyFixed,
    ...drawDeterministic(dailyPool, DAILY_DRAW_COUNT, `${playerId}:${periods.daily.period_start}`),
  ];
  const weekly = drawDeterministic(
    weeklyPool,
    WEEKLY_ACTIVE_COUNT,
    `${season.slug}:${periods.weekly.period_start}`
  );

  const rows = [
    ...daily.map((d) => ({ player_id: playerId, mission_id: d.id, period_start: periods.daily.period_start })),
    ...weekly.map((d) => ({ player_id: playerId, mission_id: d.id, period_start: periods.weekly.period_start })),
    ...monthlyAll.map((d) => ({
      player_id: playerId,
      mission_id: d.id,
      period_start: periods.monthly.period_start,
    })),
  ];
  if (rows.length === 0) return;

  const { error } = await supabase
    .from('player_season_pass_missions')
    .upsert(rows, { onConflict: 'player_id,mission_id,period_start', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Evaluation + idempotent grant
// ---------------------------------------------------------------------------

type EvaluationResult = {
  rows: AssignmentRow[];
  defsById: Map<string, MissionDefRow>;
  periods: CurrentPeriods;
  completedNow: CompletedNow[];
};

/**
 * Ensure assignments, evaluate incomplete ones and grant SP for fresh
 * completions. Concurrency-safe: completion is claimed with a conditional
 * update on `completed_at is null`; if the grant crashes mid-way, rows stay
 * with `sp_granted = null` and are retried on the next evaluation.
 */
async function runEvaluation(
  playerId: string,
  season: SeasonPassSeasonRow,
  tz: string,
  opts: { bypassCooldown?: boolean; markNotified?: boolean } = {}
): Promise<EvaluationResult> {
  const supabase = getSupabaseServiceRoleClient();
  const defs = await loadActiveDefs(season.slug);
  const defsById = new Map(defs.map((d) => [d.id, d]));
  const periods: CurrentPeriods = {
    daily: currentPeriod('daily', tz),
    weekly: currentPeriod('weekly', tz),
    monthly: currentPeriod('monthly', tz),
  };

  await ensureAssignments(playerId, season, defs, periods);

  const lookbackKey = addDaysToKey(periods.daily.period_start, -LOOKBACK_DAYS);
  const { data, error } = await supabase
    .from('player_season_pass_missions')
    .select('id, mission_id, period_start, progress, completed_at, sp_granted, notified_at')
    .eq('player_id', playerId)
    .gte('period_start', lookbackKey);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AssignmentRow[];

  const completedNow: CompletedNow[] = [];
  const now = new Date();
  const nowIso = now.toISOString();

  const last = lastEvalByPlayer.get(playerId) ?? 0;
  const shouldEvaluate = opts.bypassCooldown || now.getTime() - last >= EVAL_COOLDOWN_MS;
  if (!shouldEvaluate) return { rows, defsById, periods, completedNow };
  lastEvalByPlayer.set(playerId, now.getTime());

  const ctx = new SeasonPassEvalContext(supabase, playerId, tz);
  const graceFloorKey = addDaysToKey(periods.daily.period_start, -PAST_PERIOD_GRACE_DAYS);

  for (const row of rows) {
    const def = defsById.get(row.mission_id);
    if (!def) continue; // definition deactivated after assignment

    // Crash recovery: completed but the SP grant never landed.
    if (row.completed_at && row.sp_granted === null) {
      try {
        const grant = await grantSeasonPassSp(
          playerId,
          def.sp_reward,
          { source: 'mission', missionId: def.id, tz },
          season
        );
        await supabase
          .from('player_season_pass_missions')
          .update({ sp_granted: grant.granted_sp, updated_at: nowIso })
          .eq('id', row.id);
        row.sp_granted = grant.granted_sp;
      } catch (e) {
        console.warn('[season-pass] grant retry failed:', (e as Error).message);
      }
      continue;
    }
    if (row.completed_at) continue;

    const period = periodForRow(def.period, row.period_start, tz);
    const isCurrent = period.period_start === periods[def.period].period_start;
    const grantAtClose = def.condition_params?.grant_at_period_end === true;
    // Past periods: only re-check recently-ended ones (late score confirmations)
    // and "grant at period close" missions (evaluated on the first read after).
    if (!isCurrent && !grantAtClose && period.period_end_exclusive < graceFloorKey) continue;

    let result;
    try {
      result = await evaluateMissionCondition(ctx, def, period, now);
    } catch (e) {
      console.warn(`[season-pass] eval failed for ${def.slug}:`, (e as Error).message);
      continue;
    }

    if (!result.done) {
      if (result.current !== row.progress) {
        await supabase
          .from('player_season_pass_missions')
          .update({ progress: result.current, updated_at: nowIso })
          .eq('id', row.id);
        row.progress = result.current;
      }
      continue;
    }

    // Claim the completion (idempotent under concurrent evaluations).
    const { data: claimed, error: claimErr } = await supabase
      .from('player_season_pass_missions')
      .update({
        progress: result.current,
        completed_at: nowIso,
        updated_at: nowIso,
        ...(opts.markNotified ? { notified_at: nowIso } : {}),
      })
      .eq('id', row.id)
      .is('completed_at', null)
      .select('id');
    if (claimErr || !claimed || claimed.length === 0) continue;

    row.progress = result.current;
    row.completed_at = nowIso;
    if (opts.markNotified) row.notified_at = nowIso;

    try {
      const grant = await grantSeasonPassSp(
        playerId,
        def.sp_reward,
        { source: 'mission', missionId: def.id, tz },
        season
      );
      await supabase
        .from('player_season_pass_missions')
        .update({ sp_granted: grant.granted_sp, updated_at: nowIso })
        .eq('id', row.id);
      row.sp_granted = grant.granted_sp;
      completedNow.push({ def, grant });
    } catch (e) {
      // sp_granted stays null → retried on next evaluation.
      console.warn('[season-pass] grant failed:', (e as Error).message);
    }
  }

  return { rows, defsById, periods, completedNow };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function formatDailyExpires(endIso: string, timezone: string): string {
  try {
    const d = new Date(new Date(endIso).getTime() - 1000);
    return d.toLocaleString('es-ES', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const PERIOD_ORDER: Record<MissionPeriodKind, number> = { daily: 0, weekly: 1, monthly: 2 };

/**
 * Missions + pending celebrations for GET /season-pass/me. Evaluation runs
 * inline (subject to the per-player cooldown); fresh completions are NOT
 * marked as notified — the Home celebration queue acks them explicitly.
 */
export async function buildSeasonPassState(
  playerId: string,
  season: SeasonPassSeasonRow,
  tz: string
): Promise<SeasonPassState> {
  const { rows, defsById, periods } = await runEvaluation(playerId, season, tz);

  const missions: SeasonPassMissionPayload[] = rows
    .filter((row) => {
      const def = defsById.get(row.mission_id);
      return def && row.period_start === periods[def.period].period_start;
    })
    .map((row) => {
      const def = defsById.get(row.mission_id)!;
      const period = periods[def.period];
      return {
        id: def.id,
        assignment_id: row.id,
        slug: def.slug,
        period: def.period,
        icon: def.icon,
        title: def.title,
        description: def.description,
        sp_reward: def.sp_reward,
        reward_hint: def.reward_hint,
        target: Math.max(1, def.target_count),
        current: row.completed_at ? Math.max(1, def.target_count) : row.progress,
        done: Boolean(row.completed_at),
        sp_granted: row.sp_granted,
        period_end_iso: period.end_iso,
        expires_label: def.period === 'daily' ? formatDailyExpires(period.end_iso, tz) : null,
      };
    })
    .sort((a, b) => {
      const byPeriod = PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
      if (byPeriod !== 0) return byPeriod;
      const da = defsById.get(a.id)?.sort_order ?? 0;
      const db = defsById.get(b.id)?.sort_order ?? 0;
      return da - db;
    });

  const pending_celebrations: SeasonPassPendingCelebration[] = rows
    .filter((row) => row.completed_at && row.notified_at === null && row.sp_granted !== null)
    .map((row) => {
      const def = defsById.get(row.mission_id);
      return def
        ? {
            assignment_id: row.id,
            slug: def.slug,
            icon: def.icon,
            title: def.title,
            period: def.period,
            sp_granted: row.sp_granted ?? 0,
            completed_at: row.completed_at as string,
          }
        : null;
    })
    .filter((c): c is SeasonPassPendingCelebration => c !== null)
    .sort((a, b) => a.completed_at.localeCompare(b.completed_at));

  return { missions, pending_celebrations };
}

/**
 * Instant celebration channel (plan §6.7) — the contract helper for every
 * in-app action endpoint that can complete a mission (lesson, booking,
 * rating, comment; follow/share once the social teams ship). Call it after
 * the action is persisted and attach the result as a `season_pass` block in
 * the response. Missions completed here are marked notified immediately (the
 * caller celebrates them in-place, they must not re-enter the deferred queue).
 *
 * Never throws: returns null when there is no active season or on any error
 * (host endpoints must not fail because of the pass).
 */
export async function evaluateMissionsAndBuildDelta(
  playerId: string,
  tz: string
): Promise<SeasonPassDelta | null> {
  try {
    const season = await getActiveSeasonRow();
    if (!season) return null;

    const { completedNow } = await runEvaluation(playerId, season, tz, {
      bypassCooldown: true,
      markNotified: true,
    });

    const pass = await getOrCreateSeasonPassRow(playerId);
    const computed = computeSeasonPass(pass.sp, season.sp_per_level, season.max_level);

    let levelUp: SeasonPassDelta['level_up'] = null;
    const boostApplied = completedNow.length ? completedNow[0].grant.boost_applied : 0;
    if (completedNow.length) {
      const from = Math.min(...completedNow.map((c) => c.grant.level_from));
      const to = Math.max(...completedNow.map((c) => c.grant.level_to));
      const rewards = completedNow.flatMap((c) =>
        c.grant.rewards_granted.map((r) => ({ tier: r.tier, display: r.display }))
      );
      if (to > from) levelUp = { from, to, rewards };
    }

    return {
      completed_missions: completedNow.map((c) => ({
        slug: c.def.slug,
        icon: c.def.icon,
        title: c.def.title,
        period: c.def.period,
        sp_granted: c.grant.granted_sp,
      })),
      sp_total: pass.sp,
      level: computed.level,
      boost_applied: boostApplied,
      level_up: levelUp,
    };
  } catch (e) {
    console.warn('[season-pass] delta evaluation failed:', (e as Error).message);
    return null;
  }
}

/** Ack de celebraciones diferidas (Home queue). Returns how many rows were acked. */
export async function ackMissionCelebrations(playerId: string, assignmentIds: string[]): Promise<number> {
  if (assignmentIds.length === 0) return 0;
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('player_season_pass_missions')
    .update({ notified_at: new Date().toISOString() })
    .eq('player_id', playerId)
    .in('id', assignmentIds)
    .not('completed_at', 'is', null)
    .is('notified_at', null)
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}
