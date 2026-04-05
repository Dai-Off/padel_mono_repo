import { getSupabaseServiceRoleClient } from '../lib/supabase';

export type CompetitionFormat = 'single_elim' | 'group_playoff' | 'round_robin';
export type MatchRules = { best_of_sets: number; allow_draws?: boolean };
export type SetScore = { games_a: number; games_b: number };

type TeamRow = { id: string; name: string; slot_index: number };

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function ensureBestOf(bestOf: number): number {
  if (!Number.isFinite(bestOf) || bestOf < 1) return 3;
  const rounded = Math.round(bestOf);
  return rounded % 2 === 0 ? rounded + 1 : rounded;
}

function groupCode(index: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

async function fetchPlayerNames(playerIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return {};
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase.from('players').select('id,first_name,last_name').in('id', ids);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    out[(row as any).id] = `${(row as any).first_name ?? ''} ${(row as any).last_name ?? ''}`.trim() || 'Jugador';
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function clearTournamentCompetitionTables(tournamentId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: matches } = await supabase.from('tournament_stage_matches').select('id').eq('tournament_id', tournamentId);
  const matchIds = (matches ?? []).map((m: any) => m.id as string).filter(Boolean);
  if (matchIds.length) {
    await supabase.from('tournament_match_results').delete().in('match_id', matchIds);
  }
  await supabase.from('tournament_stage_matches').delete().eq('tournament_id', tournamentId);
  const { data: stages } = await supabase.from('tournament_stages').select('id').eq('tournament_id', tournamentId);
  const stageIds = (stages ?? []).map((s: any) => s.id as string).filter(Boolean);
  if (stageIds.length) {
    await supabase.from('tournament_stage_groups').delete().in('stage_id', stageIds);
  }
  await supabase.from('tournament_stages').delete().eq('tournament_id', tournamentId);
  await supabase.from('tournament_podium').delete().eq('tournament_id', tournamentId);
  await supabase.from('tournament_teams').delete().eq('tournament_id', tournamentId);
}

async function resolveManualTeamPayload(
  tournamentId: string,
  registrationMode: 'individual' | 'pair',
  key: string
): Promise<{ player_id_1: string; player_id_2: string; name: string }> {
  const supabase = getSupabaseServiceRoleClient();
  if (key.startsWith('pair:')) {
    const insId = key.slice('pair:'.length);
    const { data: row } = await supabase
      .from('tournament_inscriptions')
      .select('player_id_1,player_id_2,status')
      .eq('id', insId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (!row || (row as any).status !== 'confirmed') throw new Error(`Inscripción no válida para la clave ${key}`);
    const p1 = (row as any).player_id_1 as string | null;
    const p2 = (row as any).player_id_2 as string | null;
    if (!p1 || !p2) throw new Error(`Pareja incompleta (${key})`);
    const nameById = await fetchPlayerNames([p1, p2]);
    return {
      player_id_1: p1,
      player_id_2: p2,
      name: `${nameById[p1] ?? 'Jugador 1'} / ${nameById[p2] ?? 'Jugador 2'}`,
    };
  }
  if (key.startsWith('ind:')) {
    if (registrationMode !== 'individual') throw new Error('Clave ind: solo aplica a torneos en modo individual');
    const rest = key.slice('ind:'.length);
    const parts = rest.split(':');
    if (parts.length !== 2) throw new Error(`Clave inválida: ${key}`);
    const [id1, id2] = parts;
    const { data: r1 } = await supabase
      .from('tournament_inscriptions')
      .select('player_id_1,status')
      .eq('id', id1)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    const { data: r2 } = await supabase
      .from('tournament_inscriptions')
      .select('player_id_1,status')
      .eq('id', id2)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (!r1 || !r2 || (r1 as any).status !== 'confirmed' || (r2 as any).status !== 'confirmed') {
      throw new Error(`Inscripciones no válidas para ${key}`);
    }
    const p1 = (r1 as any).player_id_1 as string | null;
    const p2 = (r2 as any).player_id_1 as string | null;
    if (!p1 || !p2) throw new Error(`Faltan jugadores en ${key}`);
    const nameById = await fetchPlayerNames([p1, p2]);
    return {
      player_id_1: p1,
      player_id_2: p2,
      name: `${nameById[p1] ?? 'Jugador 1'} / ${nameById[p2] ?? 'Jugador 2'}`,
    };
  }
  if (UUID_RE.test(key)) {
    const { data: team } = await supabase
      .from('tournament_teams')
      .select('player_id_1,player_id_2,name')
      .eq('id', key)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (!team) throw new Error(`Equipo no encontrado: ${key}`);
    const p1 = (team as any).player_id_1 as string;
    const p2 = (team as any).player_id_2 as string | null;
    if (!p2) throw new Error(`El equipo ${key} no tiene dos jugadores`);
    return { player_id_1: p1, player_id_2: p2, name: String((team as any).name) };
  }
  throw new Error(`Clave de equipo no reconocida: ${key}`);
}

export async function setupTournamentCompetition(params: {
  tournamentId: string;
  format: CompetitionFormat;
  matchRules?: Partial<MatchRules>;
  standingsRules?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const bestOf = ensureBestOf(Number(params.matchRules?.best_of_sets ?? 3));
  const payload = {
    competition_format: params.format,
    match_rules: { best_of_sets: bestOf, allow_draws: Boolean(params.matchRules?.allow_draws) },
    standings_rules: params.standingsRules ?? {},
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('tournaments').update(payload).eq('id', params.tournamentId);
  if (error) throw new Error(error.message);
}

async function buildTeamsFromInscriptions(tournamentId: string): Promise<TeamRow[]> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: t } = await supabase
    .from('tournaments')
    .select('registration_mode')
    .eq('id', tournamentId)
    .maybeSingle();
  const registrationMode = String((t as any)?.registration_mode ?? 'individual');

  const { data: ins, error: insErr } = await supabase
    .from('tournament_inscriptions')
    .select('player_id_1,player_id_2,status,invited_at')
    .eq('tournament_id', tournamentId)
    .eq('status', 'confirmed')
    .order('invited_at', { ascending: true });
  if (insErr) throw new Error(insErr.message);

  const allPlayerIds: string[] = [];
  for (const row of ins ?? []) {
    if ((row as any).player_id_1) allPlayerIds.push((row as any).player_id_1);
    if ((row as any).player_id_2) allPlayerIds.push((row as any).player_id_2);
  }
  const nameById = await fetchPlayerNames(allPlayerIds);

  const teamsPayload: Array<Record<string, unknown>> = [];
  let slot = 1;
  if (registrationMode === 'pair') {
    for (const row of ins ?? []) {
      const p1 = (row as any).player_id_1 as string | null;
      const p2 = (row as any).player_id_2 as string | null;
      if (!p1 || !p2) continue;
      const n1 = nameById[p1] ?? 'Jugador 1';
      const n2 = nameById[p2] ?? 'Jugador 2';
      teamsPayload.push({
        tournament_id: tournamentId,
        slot_index: slot++,
        player_id_1: p1,
        player_id_2: p2,
        name: `${n1} / ${n2}`,
        status: 'active',
      });
    }
  } else {
    const singles = (ins ?? []).map((x: any) => x.player_id_1).filter(Boolean);
    for (let i = 0; i + 1 < singles.length; i += 2) {
      const p1 = String(singles[i]);
      const p2 = String(singles[i + 1]);
      teamsPayload.push({
        tournament_id: tournamentId,
        slot_index: slot++,
        player_id_1: p1,
        player_id_2: p2,
        name: `${nameById[p1] ?? 'Jugador 1'} / ${nameById[p2] ?? 'Jugador 2'}`,
        status: 'active',
      });
    }
  }

  await clearTournamentCompetitionTables(tournamentId);

  if (!teamsPayload.length) return [];
  const { data: teams, error } = await supabase.from('tournament_teams').insert(teamsPayload).select('id,name,slot_index');
  if (error) throw new Error(error.message);
  return (teams ?? []) as TeamRow[];
}

async function createRoundRobinMatches(params: {
  tournamentId: string;
  stageId: string;
  teams: TeamRow[];
  groupId?: string;
  roundNumberBase?: number;
}): Promise<void> {
  const rows: Array<Record<string, unknown>> = [];
  let matchNumber = 1;
  for (let i = 0; i < params.teams.length; i += 1) {
    for (let j = i + 1; j < params.teams.length; j += 1) {
      rows.push({
        tournament_id: params.tournamentId,
        stage_id: params.stageId,
        group_id: params.groupId ?? null,
        round_number: params.roundNumberBase ?? 1,
        match_number: matchNumber++,
        team_a_id: params.teams[i].id,
        team_b_id: params.teams[j].id,
        status: 'scheduled',
      });
    }
  }
  if (!rows.length) return;
  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase.from('tournament_stage_matches').insert(rows);
  if (error) throw new Error(error.message);
}

async function createSingleElimination(params: { tournamentId: string; teams: TeamRow[]; stageName?: string; stageType?: string }): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: stage, error: sErr } = await supabase
    .from('tournament_stages')
    .insert({
      tournament_id: params.tournamentId,
      stage_type: params.stageType ?? 'single_elim',
      stage_name: params.stageName ?? 'Eliminación directa',
      stage_order: 1,
    })
    .select('id')
    .single();
  if (sErr) throw new Error(sErr.message);
  const stageId = (stage as any).id as string;
  const bracketSize = nextPowerOfTwo(Math.max(2, params.teams.length));
  const firstRoundMatches = bracketSize / 2;
  const sorted = [...params.teams].sort((a, b) => a.slot_index - b.slot_index);
  const firstRows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < firstRoundMatches; i += 1) {
    const teamA = sorted[i * 2] ?? null;
    const teamB = sorted[i * 2 + 1] ?? null;
    firstRows.push({
      tournament_id: params.tournamentId,
      stage_id: stageId,
      round_number: 1,
      match_number: i + 1,
      team_a_id: teamA?.id ?? null,
      team_b_id: teamB?.id ?? null,
      status: teamA && !teamB ? 'bye' : 'scheduled',
      winner_team_id: teamA && !teamB ? teamA.id : null,
    });
  }
  const { data: insertedRound, error: mErr } = await supabase.from('tournament_stage_matches').insert(firstRows).select('id');
  if (mErr) throw new Error(mErr.message);
  let prev = (insertedRound ?? []).map((x: any) => x.id as string);
  let roundNumber = 2;
  while (prev.length > 1) {
    const nextRows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < prev.length; i += 2) {
      nextRows.push({
        tournament_id: params.tournamentId,
        stage_id: stageId,
        round_number: roundNumber,
        match_number: i / 2 + 1,
        source_match_a_id: prev[i],
        source_match_b_id: prev[i + 1] ?? null,
        status: 'scheduled',
      });
    }
    const { data, error } = await supabase.from('tournament_stage_matches').insert(nextRows).select('id');
    if (error) throw new Error(error.message);
    prev = (data ?? []).map((x: any) => x.id as string);
    roundNumber += 1;
  }
}

export async function generateTournamentFixturesManual(
  tournamentId: string,
  teamKeys: string[]
): Promise<{ teams_count: number; matches_count: number }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('competition_format, registration_mode')
    .eq('id', tournamentId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!tournament) throw new Error('Torneo no encontrado');
  const format = String((tournament as any).competition_format || 'single_elim') as CompetitionFormat;
  if (format !== 'single_elim') {
    throw new Error('La generación manual del cuadro solo está disponible para eliminación directa');
  }
  const registrationMode = String((tournament as any).registration_mode ?? 'individual') as 'individual' | 'pair';
  if (!Array.isArray(teamKeys) || teamKeys.length < 2) {
    throw new Error('Indica al menos dos equipos en el orden del cuadro');
  }

  const resolved: Array<{ player_id_1: string; player_id_2: string; name: string }> = [];
  const seenPlayers = new Set<string>();
  for (const key of teamKeys) {
    const row = await resolveManualTeamPayload(tournamentId, registrationMode, key.trim());
    for (const pid of [row.player_id_1, row.player_id_2]) {
      if (seenPlayers.has(pid)) throw new Error('Un jugador no puede figurar en dos equipos distintos');
      seenPlayers.add(pid);
    }
    resolved.push(row);
  }

  const teamsPayload: Array<Record<string, unknown>> = [];
  let slot = 1;
  for (const row of resolved) {
    teamsPayload.push({
      tournament_id: tournamentId,
      slot_index: slot++,
      player_id_1: row.player_id_1,
      player_id_2: row.player_id_2,
      name: row.name,
      status: 'active',
    });
  }

  await clearTournamentCompetitionTables(tournamentId);

  const { data: teams, error } = await supabase.from('tournament_teams').insert(teamsPayload).select('id,name,slot_index');
  if (error) throw new Error(error.message);

  await createSingleElimination({ tournamentId, teams: (teams ?? []) as TeamRow[] });

  const { count } = await supabase
    .from('tournament_stage_matches')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', tournamentId);
  return { teams_count: (teams ?? []).length, matches_count: count ?? 0 };
}

export async function generateTournamentFixtures(tournamentId: string): Promise<{ teams_count: number; matches_count: number }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('competition_format, standings_rules')
    .eq('id', tournamentId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!tournament) throw new Error('Torneo no encontrado');
  const format = String((tournament as any).competition_format || 'single_elim') as CompetitionFormat;
  const standingsRules = ((tournament as any).standings_rules || {}) as Record<string, unknown>;

  const teams = await buildTeamsFromInscriptions(tournamentId);
  if (teams.length < 2) throw new Error('Se requieren al menos 2 parejas para generar fixture');

  if (format === 'single_elim') {
    await createSingleElimination({ tournamentId, teams });
  } else if (format === 'group_playoff') {
    const groupSize = Math.max(3, Number(standingsRules.group_size ?? 4));
    const groupsCount = Math.ceil(teams.length / groupSize);
    const { data: groupsStage, error: gsErr } = await supabase
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        stage_type: 'groups',
        stage_name: 'Fase de grupos',
        stage_order: 1,
      })
      .select('id')
      .single();
    if (gsErr) throw new Error(gsErr.message);
    const groupsStageId = (groupsStage as any).id as string;
    const groupsPayload = Array.from({ length: groupsCount }, (_, i) => ({
      stage_id: groupsStageId,
      group_code: groupCode(i),
    }));
    const { data: insertedGroups, error: igErr } = await supabase
      .from('tournament_stage_groups')
      .insert(groupsPayload)
      .select('id,group_code');
    if (igErr) throw new Error(igErr.message);
    const groupsMap = insertedGroups ?? [];
    for (let i = 0; i < groupsMap.length; i += 1) {
      const members = teams.filter((_, idx) => idx % groupsMap.length === i);
      await createRoundRobinMatches({
        tournamentId,
        stageId: groupsStageId,
        teams: members,
        groupId: (groupsMap[i] as any).id,
      });
    }
    const qualifiersPerGroup = Math.max(1, Number(standingsRules.qualifiers_per_group ?? 2));
    const qualifiersCount = groupsMap.length * qualifiersPerGroup;
    const bracketSize = nextPowerOfTwo(Math.max(2, qualifiersCount));
    const playoffRoundMatches = bracketSize / 2;
    const { data: playoffStage, error: psErr } = await supabase
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        stage_type: 'playoff',
        stage_name: 'Playoffs',
        stage_order: 2,
      })
      .select('id')
      .single();
    if (psErr) throw new Error(psErr.message);
    const playoffStageId = (playoffStage as any).id as string;
    const playoffRows = Array.from({ length: playoffRoundMatches }, (_, i) => ({
      tournament_id: tournamentId,
      stage_id: playoffStageId,
      round_number: 1,
      match_number: i + 1,
      seed_label_a: `G${i + 1}-1`,
      seed_label_b: `G${i + 1}-2`,
      status: 'scheduled',
    }));
    const { data: round1, error: prErr } = await supabase.from('tournament_stage_matches').insert(playoffRows).select('id');
    if (prErr) throw new Error(prErr.message);
    let prev = (round1 ?? []).map((x: any) => x.id as string);
    let roundNumber = 2;
    while (prev.length > 1) {
      const rows = [];
      for (let i = 0; i < prev.length; i += 2) {
        rows.push({
          tournament_id: tournamentId,
          stage_id: playoffStageId,
          round_number: roundNumber,
          match_number: i / 2 + 1,
          source_match_a_id: prev[i],
          source_match_b_id: prev[i + 1] ?? null,
          status: 'scheduled',
        });
      }
      const { data, error } = await supabase.from('tournament_stage_matches').insert(rows).select('id');
      if (error) throw new Error(error.message);
      prev = (data ?? []).map((x: any) => x.id as string);
      roundNumber += 1;
    }
  } else {
    const { data: stage, error: sErr } = await supabase
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        stage_type: 'round_robin',
        stage_name: 'Liga todos contra todos',
        stage_order: 1,
      })
      .select('id')
      .single();
    if (sErr) throw new Error(sErr.message);
    await createRoundRobinMatches({ tournamentId, stageId: (stage as any).id, teams });
  }

  const { count } = await supabase
    .from('tournament_stage_matches')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', tournamentId);
  return { teams_count: teams.length, matches_count: count ?? 0 };
}

function evalWinnerFromSets(sets: SetScore[], bestOfSets: number, allowDraws = false): 'A' | 'B' | 'DRAW' | null {
  let a = 0;
  let b = 0;
  for (const set of sets) {
    if (set.games_a > set.games_b) a += 1;
    else if (set.games_b > set.games_a) b += 1;
  }
  const toWin = Math.floor(ensureBestOf(bestOfSets) / 2) + 1;
  if (a >= toWin && a > b) return 'A';
  if (b >= toWin && b > a) return 'B';
  if (allowDraws && a === b) return 'DRAW';
  return null;
}

export async function saveMatchResult(params: {
  tournamentId: string;
  matchId: string;
  sets: SetScore[];
  override?: boolean;
  submittedByUserId?: string | null;
}): Promise<{ winner_team_id: string | null }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('match_rules')
    .eq('id', params.tournamentId)
    .maybeSingle();
  if (!tournament) throw new Error('Torneo no encontrado');
  const rules = ((tournament as any).match_rules || {}) as MatchRules;
  const bestOf = ensureBestOf(Number(rules.best_of_sets ?? 3));
  if (!Array.isArray(params.sets) || params.sets.length === 0) throw new Error('sets es obligatorio');
  for (const s of params.sets) {
    if (!Number.isFinite(Number(s.games_a)) || !Number.isFinite(Number(s.games_b))) throw new Error('Cada set debe incluir games_a y games_b');
    if (Number(s.games_a) < 0 || Number(s.games_b) < 0) throw new Error('games_a/games_b deben ser >= 0');
  }

  const { data: match, error: mErr } = await supabase
    .from('tournament_stage_matches')
    .select('id, team_a_id, team_b_id, status, winner_team_id, source_match_a_id, source_match_b_id, stage_id, round_number, match_number')
    .eq('id', params.matchId)
    .eq('tournament_id', params.tournamentId)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  if (!match) throw new Error('Partido no encontrado');
  if (!(match as any).team_a_id || !(match as any).team_b_id) throw new Error('El partido aún no tiene ambos equipos definidos');
  if ((match as any).status === 'finished' && !params.override) throw new Error('El partido ya está finalizado. Usa override=true para corregir');

  const winnerSide = evalWinnerFromSets(params.sets, bestOf, Boolean(rules.allow_draws));
  if (!winnerSide || winnerSide === 'DRAW') throw new Error('Los sets no definen un ganador válido para la regla configurada');
  const winnerTeamId = winnerSide === 'A' ? (match as any).team_a_id : (match as any).team_b_id;

  const existingRes = await supabase.from('tournament_match_results').select('id').eq('match_id', params.matchId).maybeSingle();
  if ((existingRes.data as any)?.id) {
    const { error } = await supabase
      .from('tournament_match_results')
      .update({
        winner_team_id: winnerTeamId,
        sets: params.sets,
        submitted_by_user_id: params.submittedByUserId ?? null,
        submitted_at: new Date().toISOString(),
      })
      .eq('match_id', params.matchId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('tournament_match_results').insert({
      match_id: params.matchId,
      winner_team_id: winnerTeamId,
      sets: params.sets,
      submitted_by_user_id: params.submittedByUserId ?? null,
    });
    if (error) throw new Error(error.message);
  }

  const { error: upErr } = await supabase
    .from('tournament_stage_matches')
    .update({
      status: 'finished',
      winner_team_id: winnerTeamId,
    })
    .eq('id', params.matchId);
  if (upErr) throw new Error(upErr.message);

  const { data: downstream } = await supabase
    .from('tournament_stage_matches')
    .select('id, source_match_a_id, source_match_b_id')
    .eq('tournament_id', params.tournamentId)
    .or(`source_match_a_id.eq.${params.matchId},source_match_b_id.eq.${params.matchId}`);
  for (const row of downstream ?? []) {
    const patch: Record<string, unknown> = {};
    if ((row as any).source_match_a_id === params.matchId) patch.team_a_id = winnerTeamId;
    if ((row as any).source_match_b_id === params.matchId) patch.team_b_id = winnerTeamId;
    if (Object.keys(patch).length) await supabase.from('tournament_stage_matches').update(patch).eq('id', (row as any).id);
  }
  return { winner_team_id: winnerTeamId };
}

export async function computeStandings(tournamentId: string): Promise<Record<string, any[]>> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: matches } = await supabase
    .from('tournament_stage_matches')
    .select('id,group_id,team_a_id,team_b_id,winner_team_id,status')
    .eq('tournament_id', tournamentId);
  const { data: results } = await supabase.from('tournament_match_results').select('match_id,sets').in('match_id', (matches ?? []).map((m: any) => m.id));
  const { data: teams } = await supabase.from('tournament_teams').select('id,name,slot_index').eq('tournament_id', tournamentId);
  const byMatchResult = new Map<string, any>((results ?? []).map((r: any) => [r.match_id, r]));
  const byGroup: Record<string, Record<string, any>> = {};
  for (const m of matches ?? []) {
    const groupKey = String((m as any).group_id ?? 'global');
    byGroup[groupKey] = byGroup[groupKey] ?? {};
    for (const teamId of [(m as any).team_a_id, (m as any).team_b_id]) {
      if (!teamId) continue;
      if (!byGroup[groupKey][teamId]) {
        const team = (teams ?? []).find((t: any) => t.id === teamId);
        byGroup[groupKey][teamId] = {
          team_id: teamId,
          team_name: team?.name ?? `Equipo ${teamId}`,
          played: 0,
          wins: 0,
          losses: 0,
          sets_won: 0,
          sets_lost: 0,
          games_won: 0,
          games_lost: 0,
          points: 0,
        };
      }
    }
    if ((m as any).status !== 'finished') continue;
    const a = byGroup[groupKey][(m as any).team_a_id];
    const b = byGroup[groupKey][(m as any).team_b_id];
    if (!a || !b) continue;
    a.played += 1;
    b.played += 1;
    if ((m as any).winner_team_id === (m as any).team_a_id) {
      a.wins += 1;
      b.losses += 1;
      a.points += 2;
    } else if ((m as any).winner_team_id === (m as any).team_b_id) {
      b.wins += 1;
      a.losses += 1;
      b.points += 2;
    }
    const setRows = (byMatchResult.get((m as any).id)?.sets ?? []) as SetScore[];
    for (const s of setRows) {
      a.games_won += Number(s.games_a ?? 0);
      a.games_lost += Number(s.games_b ?? 0);
      b.games_won += Number(s.games_b ?? 0);
      b.games_lost += Number(s.games_a ?? 0);
      if (Number(s.games_a ?? 0) > Number(s.games_b ?? 0)) {
        a.sets_won += 1;
        b.sets_lost += 1;
      } else if (Number(s.games_b ?? 0) > Number(s.games_a ?? 0)) {
        b.sets_won += 1;
        a.sets_lost += 1;
      }
    }
  }
  const out: Record<string, any[]> = {};
  for (const [groupId, rows] of Object.entries(byGroup)) {
    out[groupId] = Object.values(rows).sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      const setDiffX = x.sets_won - x.sets_lost;
      const setDiffY = y.sets_won - y.sets_lost;
      if (setDiffY !== setDiffX) return setDiffY - setDiffX;
      const gameDiffX = x.games_won - x.games_lost;
      const gameDiffY = y.games_won - y.games_lost;
      if (gameDiffY !== gameDiffX) return gameDiffY - gameDiffX;
      return String(x.team_name).localeCompare(String(y.team_name));
    });
  }
  return out;
}

export async function getCompetitionView(tournamentId: string): Promise<any> {
  const supabase = getSupabaseServiceRoleClient();
  const [{ data: tournament }, { data: teams }, { data: stages }, { data: groups }, { data: matches }, { data: podium }] = await Promise.all([
    supabase
      .from('tournaments')
      .select('id,club_id,visibility,competition_format,match_rules,standings_rules,status,prizes')
      .eq('id', tournamentId)
      .maybeSingle(),
    supabase.from('tournament_teams').select('id,slot_index,name,status,player_id_1,player_id_2').eq('tournament_id', tournamentId).order('slot_index'),
    supabase.from('tournament_stages').select('id,stage_type,stage_name,stage_order').eq('tournament_id', tournamentId).order('stage_order'),
    supabase
      .from('tournament_stage_groups')
      .select('id,stage_id,group_code')
      .in('stage_id', (await supabase.from('tournament_stages').select('id').eq('tournament_id', tournamentId)).data?.map((x: any) => x.id) ?? ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('tournament_stage_matches')
      .select('id,stage_id,group_id,round_number,match_number,team_a_id,team_b_id,source_match_a_id,source_match_b_id,seed_label_a,seed_label_b,status,winner_team_id')
      .eq('tournament_id', tournamentId)
      .order('round_number')
      .order('match_number'),
    supabase.from('tournament_podium').select('position,team_id,note').eq('tournament_id', tournamentId).order('position'),
  ]);
  const standings = await computeStandings(tournamentId);
  const { data: results } = await supabase
    .from('tournament_match_results')
    .select('match_id,winner_team_id,sets,submitted_at')
    .in('match_id', (matches ?? []).map((m: any) => m.id));
  const resultByMatch = new Map((results ?? []).map((r: any) => [r.match_id, r]));
  const matchesWithResults = (matches ?? []).map((m: any) => ({ ...m, result: resultByMatch.get(m.id) ?? null }));
  return {
    tournament: tournament ?? null,
    teams: teams ?? [],
    stages: stages ?? [],
    groups: groups ?? [],
    matches: matchesWithResults,
    standings,
    podium: podium ?? [],
  };
}

/** Podio manual en panel club: hasta 3 puestos, independiente del desglose de premios. */
const MANUAL_PODIUM_MAX_POSITION = 3;

export async function saveManualPodium(params: {
  tournamentId: string;
  rows: Array<{ position: number; team_id: string; note?: string | null }>;
  createdByUserId?: string | null;
}): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();

  const normalized = params.rows.map((r) => {
    const position = Math.round(Number(r.position));
    return { position, team_id: String(r.team_id).trim(), note: r.note ?? null };
  });
  const uniquePos = new Set(normalized.map((r) => r.position));
  const uniqueTeams = new Set(normalized.map((r) => r.team_id));
  if (uniquePos.size !== normalized.length) throw new Error('No se puede repetir posición en podio');
  if (uniqueTeams.size !== normalized.length) throw new Error('No se puede repetir equipo en podio');
  for (const row of normalized) {
    if (!Number.isInteger(row.position) || row.position < 1 || row.position > MANUAL_PODIUM_MAX_POSITION) {
      throw new Error(`Posición de podio inválida: usa 1..${MANUAL_PODIUM_MAX_POSITION}`);
    }
    if (!row.team_id) throw new Error('team_id obligatorio en cada fila de podio');
  }
  const { data: teams } = await supabase.from('tournament_teams').select('id').eq('tournament_id', params.tournamentId);
  const teamSet = new Set((teams ?? []).map((t: any) => t.id as string));
  for (const row of normalized) {
    if (!teamSet.has(row.team_id)) throw new Error('El equipo del podio no pertenece a este torneo');
  }
  await supabase.from('tournament_podium').delete().eq('tournament_id', params.tournamentId);
  if (!normalized.length) return;
  const payload = normalized.map((r) => ({
    tournament_id: params.tournamentId,
    position: r.position,
    team_id: r.team_id,
    note: r.note ?? null,
    created_by_user_id: params.createdByUserId ?? null,
  }));
  const { error } = await supabase.from('tournament_podium').insert(payload);
  if (error) throw new Error(error.message);
}
