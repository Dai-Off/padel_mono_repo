import type { SupabaseClient } from '@supabase/supabase-js';
import { formatInTimeZone } from '../routes/learningTimezone';
import { isValidTimezone, MissionPeriod } from './seasonPassPeriods';

export type MissionDefRow = {
  id: string;
  slug: string;
  icon: string;
  title: string;
  description: string;
  period: 'daily' | 'weekly' | 'monthly';
  target_count: number;
  sp_reward: number;
  sort_order: number;
  condition_key: string;
  condition_params: Record<string, unknown>;
  assignment: 'daily_fixed' | 'daily_pool' | 'weekly_calendar' | 'monthly_all';
  reward_hint: string | null;
};

export type ConditionResult = { current: number; done: boolean };

type ConfirmedMatch = {
  match_id: string;
  team: string;
  result: string;
  type: string | null;
  competitive: boolean;
  confirmed_at: string;
  start_at: string | null;
  booking_timezone: string | null;
  club_id: string | null;
  sets: Array<{ a: number; b: number }> | null;
};

type Teammate = { match_id: string; player_id: string };

function localParts(iso: string, tz: string): { hhmm: string; dow: number } {
  const safeTz = isValidTimezone(tz) ? tz : 'UTC';
  const local = formatInTimeZone(new Date(iso), safeTz); // YYYY-MM-DDTHH:mm:ss
  const dow = new Date(local.slice(0, 10) + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  return { hhmm: local.slice(11, 16), dow };
}

/**
 * Per-evaluation data context: memoizes the datasets shared by several
 * missions (e.g. confirmed matches of the month) so evaluating the whole
 * assignment list costs a bounded number of queries.
 */
export class SeasonPassEvalContext {
  private cache = new Map<string, Promise<unknown>>();

  constructor(
    readonly supabase: SupabaseClient,
    readonly playerId: string,
    readonly tz: string
  ) {}

  private memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let hit = this.cache.get(key);
    if (!hit) {
      hit = fn();
      this.cache.set(key, hit);
    }
    return hit as Promise<T>;
  }

  private async countRows(table: string, apply: (q: any) => any): Promise<number> {
    const base = this.supabase.from(table).select('*', { count: 'exact', head: true });
    const { count, error } = await apply(base);
    if (error) throw new Error(`[season-pass eval ${table}] ${error.message}`);
    return count ?? 0;
  }

  /** Matches with confirmed score in the period where the player took part. */
  confirmedMatches(p: MissionPeriod): Promise<ConfirmedMatch[]> {
    return this.memo(`matches:${p.start_iso}`, async () => {
      const { data, error } = await this.supabase
        .from('match_players')
        .select(
          'match_id, team, result, match:matches!inner(id, type, competitive, score_status, score_confirmed_at, sets, booking:bookings!inner(start_at, timezone, court:courts!inner(club_id)))'
        )
        .eq('player_id', this.playerId)
        .eq('match.score_status', 'confirmed')
        .gte('match.score_confirmed_at', p.start_iso)
        .lt('match.score_confirmed_at', p.end_iso);
      if (error) throw new Error(`[season-pass eval matches] ${error.message}`);
      return (data ?? []).map((raw) => {
        const r = raw as unknown as {
          match_id: string;
          team: string;
          result: string;
          match: {
            type: string | null;
            competitive: boolean;
            score_confirmed_at: string;
            sets: unknown;
            booking: {
              start_at: string | null;
              timezone: string | null;
              court: { club_id: string | null } | null;
            } | null;
          };
        };
        const rawSets = Array.isArray(r.match?.sets) ? (r.match.sets as Array<{ a?: unknown; b?: unknown }>) : null;
        return {
          match_id: r.match_id,
          team: r.team,
          result: r.result,
          type: r.match?.type ?? null,
          competitive: Boolean(r.match?.competitive),
          confirmed_at: r.match?.score_confirmed_at ?? '',
          start_at: r.match?.booking?.start_at ?? null,
          booking_timezone: r.match?.booking?.timezone ?? null,
          club_id: r.match?.booking?.court?.club_id ?? null,
          sets: rawSets
            ? rawSets.map((s) => ({ a: Number(s.a ?? 0), b: Number(s.b ?? 0) }))
            : null,
        };
      });
    });
  }

  /** Teammates (same team) in the period's confirmed matches. */
  teammates(p: MissionPeriod): Promise<Teammate[]> {
    return this.memo(`teammates:${p.start_iso}`, async () => {
      const matches = await this.confirmedMatches(p);
      if (matches.length === 0) return [];
      const teamByMatch = new Map(matches.map((m) => [m.match_id, m.team]));
      const { data, error } = await this.supabase
        .from('match_players')
        .select('match_id, player_id, team')
        .in('match_id', matches.map((m) => m.match_id))
        .neq('player_id', this.playerId);
      if (error) throw new Error(`[season-pass eval teammates] ${error.message}`);
      return (data ?? [])
        .filter((r) => teamByMatch.get(String(r.match_id)) === String(r.team))
        .map((r) => ({ match_id: String(r.match_id), player_id: String(r.player_id) }));
    });
  }

  /** League matches played in the period (league_matches, not `matches`). */
  leagueMatchesCount(p: MissionPeriod): Promise<number> {
    return this.memo(`league:${p.start_iso}`, async () => {
      const entryIds = await this.memo('leagueEntries', async () => {
        const { data, error } = await this.supabase
          .from('league_division_teams')
          .select('id')
          .or(`player_id_1.eq.${this.playerId},player_id_2.eq.${this.playerId}`);
        if (error) throw new Error(`[season-pass eval league entries] ${error.message}`);
        return (data ?? []).map((r) => String(r.id));
      });
      if (entryIds.length === 0) return 0;
      const list = entryIds.join(',');
      return this.countRows('league_matches', (q: any) =>
        q
          .eq('status', 'played')
          .gte('played_at', p.start_iso)
          .lt('played_at', p.end_iso)
          .or(`entry_a_id.in.(${list}),entry_b_id.in.(${list})`)
      );
    });
  }

  lessonsCount(p: MissionPeriod): Promise<number> {
    return this.memo(`lessons:${p.start_iso}`, () =>
      this.countRows('learning_sessions', (q: any) =>
        q.eq('player_id', this.playerId).gte('completed_at', p.start_iso).lt('completed_at', p.end_iso)
      )
    );
  }

  /** Sesiones de lección del período con su acierto (correct/total). */
  private lessonSessions(p: MissionPeriod): Promise<Array<{ correct: number; total: number }>> {
    return this.memo(`lessonSess:${p.start_iso}`, async () => {
      const { data, error } = await this.supabase
        .from('learning_sessions')
        .select('correct_count, total_count')
        .eq('player_id', this.playerId)
        .gte('completed_at', p.start_iso)
        .lt('completed_at', p.end_iso);
      if (error) throw new Error(`[season-pass eval lessonSess] ${error.message}`);
      return (data ?? []).map((r) => ({
        correct: Number((r as { correct_count: unknown }).correct_count ?? 0),
        total: Number((r as { total_count: unknown }).total_count ?? 5),
      }));
    });
  }

  /** Lecciones del período con acierto ≥ minPct%. */
  async lessonScoreCount(p: MissionPeriod, minPct: number): Promise<number> {
    const rows = await this.lessonSessions(p);
    return rows.filter((r) => r.total > 0 && (r.correct / r.total) * 100 >= minPct).length;
  }

  /** Lecciones perfectas del período (todas correctas). */
  async lessonPerfectCount(p: MissionPeriod): Promise<number> {
    const rows = await this.lessonSessions(p);
    return rows.filter((r) => r.total > 0 && r.correct >= r.total).length;
  }

  /** Lecciones de curso (academia) completadas en el período. */
  courseLessonsCount(p: MissionPeriod): Promise<number> {
    return this.memo(`courseLessons:${p.start_iso}`, () =>
      this.countRows('learning_course_progress', (q: any) =>
        q.eq('player_id', this.playerId).gte('completed_at', p.start_iso).lt('completed_at', p.end_iso)
      )
    );
  }

  /** Publicaciones del jugador en el feed de comunidad en el período. */
  communityPostsCount(p: MissionPeriod): Promise<number> {
    return this.memo(`posts:${p.start_iso}`, () =>
      this.countRows('community_posts', (q: any) =>
        q.eq('player_id', this.playerId).gte('created_at', p.start_iso).lt('created_at', p.end_iso)
      )
    );
  }

  /** Reservas del período en un club donde el jugador no había reservado antes. */
  bookingsNewClubCount(p: MissionPeriod): Promise<number> {
    return this.memo(`newClub:${p.start_iso}`, async () => {
      const clubIdsOf = (rows: unknown): Set<string> =>
        new Set(
          ((rows as Array<{ court?: { club_id?: string | null } | null }>) ?? [])
            .map((r) => r.court?.club_id)
            .filter((c): c is string => !!c)
        );
      const base = () =>
        this.supabase
          .from('bookings')
          .select('court:courts!inner(club_id)')
          .eq('organizer_player_id', this.playerId)
          .in('source_channel', ['app', 'mobile', 'web'])
          .neq('status', 'cancelled');
      const [{ data: prev }, { data: cur }] = await Promise.all([
        base().lt('created_at', p.start_iso),
        base().gte('created_at', p.start_iso).lt('created_at', p.end_iso),
      ]);
      const prevClubs = clubIdsOf(prev);
      const curClubs = clubIdsOf(cur);
      let n = 0;
      curClubs.forEach((c) => {
        if (!prevClubs.has(c)) n += 1;
      });
      return n;
    });
  }

  activeDaysCount(p: MissionPeriod): Promise<number> {
    return this.memo(`activeDays:${p.period_start}`, () =>
      this.countRows('player_active_days', (q: any) =>
        q.eq('player_id', this.playerId).gte('day', p.period_start).lt('day', p.period_end_exclusive)
      )
    );
  }

  /** Court bookings created by the player in-app during the period. */
  bookingsCreatedCount(p: MissionPeriod): Promise<number> {
    return this.memo(`bookings:${p.start_iso}`, () =>
      this.countRows('bookings', (q: any) =>
        q
          .eq('organizer_player_id', this.playerId)
          .in('source_channel', ['app', 'mobile', 'web'])
          .neq('status', 'cancelled')
          .gte('created_at', p.start_iso)
          .lt('created_at', p.end_iso)
      )
    );
  }

  /** Class bookings (school) where the player participates, starting in the period. */
  classBookingsCount(p: MissionPeriod): Promise<number> {
    return this.memo(`classes:${p.start_iso}`, async () => {
      const { count, error } = await this.supabase
        .from('booking_participants')
        .select('id, booking:bookings!inner(id)', { count: 'exact', head: true })
        .eq('player_id', this.playerId)
        .in('booking.reservation_type', ['school_group', 'school_individual'])
        .neq('booking.status', 'cancelled')
        .gte('booking.start_at', p.start_iso)
        .lt('booking.start_at', p.end_iso);
      if (error) throw new Error(`[season-pass eval classes] ${error.message}`);
      return count ?? 0;
    });
  }

  ratingsCount(p: MissionPeriod): Promise<number> {
    return this.memo(`ratings:${p.start_iso}`, () =>
      this.countRows('match_feedback', (q: any) =>
        q.eq('reviewer_id', this.playerId).gte('created_at', p.start_iso).lt('created_at', p.end_iso)
      )
    );
  }

  commentsCount(p: MissionPeriod): Promise<number> {
    return this.memo(`comments:${p.start_iso}`, () =>
      this.countRows('community_comments', (q: any) =>
        q.eq('player_id', this.playerId).gte('created_at', p.start_iso).lt('created_at', p.end_iso)
      )
    );
  }

  faultsCount(p: MissionPeriod): Promise<number> {
    return this.memo(`faults:${p.start_iso}`, () =>
      this.countRows('matchmaking_reject_faults', (q: any) =>
        q.eq('player_id', this.playerId).gte('created_at', p.start_iso).lt('created_at', p.end_iso)
      )
    );
  }

  /**
   * Follows created in the period. Schema agreed with the social team
   * (docs/follow-system-implementation-plan.md): created_at is the FIRST time
   * of the pair. Table may not exist yet (mission seeded inactive) → 0.
   */
  followsCount(p: MissionPeriod): Promise<number> {
    return this.memo(`follows:${p.start_iso}`, async () => {
      try {
        return await this.countRows('player_follows', (q: any) =>
          q.eq('follower_id', this.playerId).gte('created_at', p.start_iso).lt('created_at', p.end_iso)
        );
      } catch {
        return 0;
      }
    });
  }

  /**
   * External/join-link shares in the period. Schema agreed with the social
   * team (docs/sharing-implementation-plan.md). Table may not exist yet → 0.
   */
  sharesCount(p: MissionPeriod): Promise<number> {
    return this.memo(`shares:${p.start_iso}`, async () => {
      try {
        return await this.countRows('community_share_events', (q: any) =>
          q
            .eq('player_id', this.playerId)
            .in('channel', ['external', 'join_link'])
            .gte('created_at', p.start_iso)
            .lt('created_at', p.end_iso)
        );
      } catch {
        return 0;
      }
    });
  }

  /** Pass missions of a given period type completed within the range (meta-missions). */
  missionsCompletedCount(p: MissionPeriod, missionPeriod: string): Promise<number> {
    return this.memo(`missionsDone:${missionPeriod}:${p.start_iso}`, async () => {
      const { count, error } = await this.supabase
        .from('player_season_pass_missions')
        .select('id, mission:season_pass_mission_definitions!inner(period)', {
          count: 'exact',
          head: true,
        })
        .eq('player_id', this.playerId)
        .eq('mission.period', missionPeriod)
        .gte('completed_at', p.start_iso)
        .lt('completed_at', p.end_iso);
      if (error) throw new Error(`[season-pass eval missionsDone] ${error.message}`);
      return count ?? 0;
    });
  }
}

function applyMatchFilters(
  rows: ConfirmedMatch[],
  params: Record<string, unknown>,
  fallbackTz: string
): ConfirmedMatch[] {
  let out = rows;
  if (params.kind === 'matchmaking') out = out.filter((r) => r.type === 'matchmaking');
  if (params.competitive === true) out = out.filter((r) => r.competitive);
  if (params.weekend === true) {
    out = out.filter((r) => {
      const anchor = r.start_at ?? r.confirmed_at;
      const { dow } = localParts(anchor, r.booking_timezone || fallbackTz);
      return dow === 0 || dow === 6;
    });
  }
  const startAfter = typeof params.start_after === 'string' ? params.start_after : null;
  if (startAfter) {
    out = out.filter(
      (r) => r.start_at && localParts(r.start_at, r.booking_timezone || fallbackTz).hhmm >= startAfter
    );
  }
  const startBefore = typeof params.start_before === 'string' ? params.start_before : null;
  if (startBefore) {
    out = out.filter(
      (r) => r.start_at && localParts(r.start_at, r.booking_timezone || fallbackTz).hhmm < startBefore
    );
  }
  return out;
}

/** Victoria sin ceder ningún set (2-0 / 3-0): el equipo del jugador ganó todos. */
function isStraightWin(m: ConfirmedMatch): boolean {
  if (m.result !== 'win' || !m.sets || m.sets.length === 0) return false;
  const isA = m.team === 'A';
  return m.sets.every((s) => (isA ? s.a > s.b : s.b > s.a));
}

function longestWinStreak(rows: ConfirmedMatch[]): number {
  const ordered = rows
    .filter((r) => r.result === 'win' || r.result === 'loss' || r.result === 'draw')
    .sort((a, b) => a.confirmed_at.localeCompare(b.confirmed_at));
  let best = 0;
  let run = 0;
  for (const r of ordered) {
    run = r.result === 'win' ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Evaluate one mission condition against the period. Returns clamped progress.
 * Unknown condition_keys evaluate to 0 (mission stays incomplete, never throws).
 */
export async function evaluateMissionCondition(
  ctx: SeasonPassEvalContext,
  def: MissionDefRow,
  period: MissionPeriod,
  now: Date = new Date()
): Promise<ConditionResult> {
  const params = def.condition_params ?? {};
  const target = Math.max(1, Number(def.target_count ?? 1));
  let current = 0;

  switch (def.condition_key) {
    case 'daily_lesson':
      current = await ctx.lessonsCount(period);
      break;
    case 'active_day':
      current = await ctx.activeDaysCount(period);
      break;
    case 'match_completed': {
      if (params.kind === 'league') {
        current = await ctx.leagueMatchesCount(period);
        break;
      }
      const rows = applyMatchFilters(await ctx.confirmedMatches(period), params, ctx.tz);
      if (params.distinct === 'club') {
        current = new Set(rows.map((r) => r.club_id).filter(Boolean)).size;
      } else if (params.distinct === 'partner') {
        current = new Set((await ctx.teammates(period)).map((t) => t.player_id)).size;
      } else if (params.same === 'partner') {
        const counts = new Map<string, number>();
        for (const t of await ctx.teammates(period)) {
          counts.set(t.player_id, (counts.get(t.player_id) ?? 0) + 1);
        }
        current = counts.size ? Math.max(...counts.values()) : 0;
      } else {
        current = rows.length;
      }
      break;
    }
    case 'match_victory': {
      const rows = applyMatchFilters(await ctx.confirmedMatches(period), params, ctx.tz);
      const wins = rows.filter((r) => r.result === 'win');
      current = params.straight === true ? wins.filter(isStraightWin).length : wins.length;
      break;
    }
    case 'victory_streak':
      current = longestWinStreak(await ctx.confirmedMatches(period));
      break;
    case 'lesson_score':
      current = await ctx.lessonScoreCount(period, Number(params.min ?? 60));
      break;
    case 'lesson_perfect':
      current = await ctx.lessonPerfectCount(period);
      break;
    case 'course_lesson':
      current = await ctx.courseLessonsCount(period);
      break;
    case 'community_post':
      current = await ctx.communityPostsCount(period);
      break;
    case 'booking_created':
      current =
        params.new_club === true
          ? await ctx.bookingsNewClubCount(period)
          : await ctx.bookingsCreatedCount(period);
      break;
    case 'class_booking':
      current = await ctx.classBookingsCount(period);
      break;
    case 'rating_submitted':
      current = await ctx.ratingsCount(period);
      break;
    case 'community_comment':
      current = await ctx.commentsCount(period);
      break;
    case 'user_follow':
      current = await ctx.followsCount(period);
      break;
    case 'share_external':
      current = await ctx.sharesCount(period);
      break;
    case 'missions_completed':
      current = await ctx.missionsCompletedCount(
        period,
        typeof params.period === 'string' ? params.period : 'weekly'
      );
      break;
    case 'zero_matchmaking_faults': {
      // Only grantable once the period is over ("keep it at 0 all month").
      const faults = await ctx.faultsCount(period);
      const periodEnded = now.toISOString() >= period.end_iso;
      const clean = faults === 0;
      return { current: periodEnded && clean ? target : 0, done: periodEnded && clean };
    }
    default:
      return { current: 0, done: false };
  }

  const clamped = Math.min(target, Math.max(0, current));
  return { current: clamped, done: clamped >= target };
}
