import { API_URL } from '../config';

export type TournamentPrize = { label: string; amount_cents: number };

export type ClubPublicEmbed = {
  id?: string;
  name: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  lat?: number | null;
  lng?: number | null;
  logo_url?: string | null;
};

export type ClubBrief = ClubPublicEmbed | ClubPublicEmbed[] | null;

export type PublicTournamentRow = {
  id: string;
  club_id: string;
  created_at?: string;
  updated_at?: string;
  start_at: string;
  end_at: string;
  duration_min: number;
  /** Precio de inscripción por jugador/equipo según `registration_mode`, en céntimos (p. ej. 2500 = 25,00 €). */
  price_cents: number;
  prize_total_cents?: number | null;
  /** JSONB en backend; array de premios por puesto. */
  prizes?: TournamentPrize[] | unknown;
  currency: string;
  visibility?: string;
  gender?: 'male' | 'female' | 'mixed' | string | null;
  max_players: number;
  status: string;
  description: string | null;
  normas?: string | null;
  elo_min: number | null;
  elo_max: number | null;
  registration_mode: 'individual' | 'pair' | 'both';
  registration_closed_at?: string | null;
  cancellation_cutoff_at?: string | null;
  invite_ttl_minutes?: number;
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
  closed_at?: string | null;
  created_by_player_id?: string | null;
  tournament_courts?: { court_id: string }[] | null;
  clubs?: ClubBrief;
  confirmed_count?: number;
  pending_count?: number;
};

type ListResponse = { ok?: boolean; tournaments?: PublicTournamentRow[]; error?: string };
type ListPagination = { limit: number; offset: number; has_more: boolean };

function headers(token: string | null | undefined): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function fetchPublicTournaments(
  token: string | null | undefined,
  opts?: { limit?: number; offset?: number },
): Promise<
  | { ok: true; tournaments: PublicTournamentRow[]; pagination: ListPagination }
  | { ok: false; error: string }
> {
  try {
    const limit = Math.max(1, Math.trunc(opts?.limit ?? 20));
    const offset = Math.max(0, Math.trunc(opts?.offset ?? 0));
    const url = `${API_URL}/tournaments/public/list?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: headers(token) });
    const json = (await res.json()) as ListResponse & { pagination?: ListPagination };
    if (!res.ok) return { ok: false, error: json.error ?? 'No se pudieron cargar los torneos' };
    return {
      ok: true,
      tournaments: json.tournaments ?? [],
      pagination: json.pagination ?? { limit, offset, has_more: false },
    };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchMyTournaments(
  token: string | null | undefined,
  opts?: { limit?: number; offset?: number },
): Promise<
  | { ok: true; tournaments: PublicTournamentRow[]; pagination: ListPagination }
  | { ok: false; error: string }
> {
  if (!token) return { ok: false, error: 'Inicia sesión para ver tus inscripciones' };
  try {
    const limit = Math.max(1, Math.trunc(opts?.limit ?? 20));
    const offset = Math.max(0, Math.trunc(opts?.offset ?? 0));
    const url = `${API_URL}/tournaments/player/me-list?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: headers(token) });
    const json = (await res.json()) as ListResponse & { pagination?: ListPagination };
    if (!res.ok) return { ok: false, error: json.error ?? 'No se pudieron cargar tus torneos' };
    return {
      ok: true,
      tournaments: json.tournaments ?? [],
      pagination: json.pagination ?? { limit, offset, has_more: false },
    };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

type DetailResponse = {
  ok?: boolean;
  tournament?: PublicTournamentRow;
  counts?: { confirmed: number; pending: number };
  error?: string;
};

export async function fetchTournamentPublicDetail(
  tournamentId: string,
): Promise<
  | { ok: true; tournament: PublicTournamentRow; counts: { confirmed: number; pending: number } }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${API_URL}/tournaments/public/${encodeURIComponent(tournamentId)}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const json = (await res.json()) as DetailResponse;
    if (!res.ok || !json.ok || !json.tournament) {
      return { ok: false, error: json.error ?? 'No se pudo cargar el torneo' };
    }
    return {
      ok: true,
      tournament: json.tournament,
      counts: json.counts ?? { confirmed: 0, pending: 0 },
    };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function joinPublicTournament(
  tournamentId: string,
  token: string,
): Promise<{ ok: true; already_joined?: boolean } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/join`, {
      method: 'POST',
      headers: headers(token),
    });
    const json = (await res.json()) as { ok?: boolean; already_joined?: boolean; error?: string };
    if (res.ok && json.ok) return { ok: true, already_joined: json.already_joined };
    return { ok: false, error: json.error ?? 'No se pudo completar la inscripción' };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

/** Baja del torneo (inscripción pending o confirmed). */
export async function leaveTournament(
  tournamentId: string,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/leave`, {
      method: 'POST',
      headers: headers(token),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok && json.ok) return { ok: true };
    return { ok: false, error: json.error ?? 'No se pudo cancelar la inscripción' };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

type PlayerDetailJson = {
  ok?: boolean;
  tournament?: PublicTournamentRow;
  counts?: { confirmed: number; pending: number };
  my_inscription?: { status?: string } | null;
  my_entry_request?: {
    id?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'dismissed' | string;
    message?: string;
    response_message?: string | null;
    created_at?: string;
    resolved_at?: string | null;
  } | null;
  participants?: TournamentParticipantRow[];
  error?: string;
};

export type TournamentParticipantRow = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  elo_rating?: number | null;
  inscription_status?: string;
};

export type TournamentChatMessage = {
  id: string;
  created_at: string;
  author_user_id: string;
  author_name: string;
  message: string;
};

export type MyTournamentEntryRequest = {
  id: string;
  tournament_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'dismissed' | string;
  message: string;
  response_message?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  tournament?: {
    id: string;
    name?: string | null;
    start_at?: string;
    status?: string;
    price_cents?: number;
    registration_mode?: 'individual' | 'pair' | 'both' | string;
    visibility?: string;
    elo_min?: number | null;
    elo_max?: number | null;
  } | null;
};

export type TournamentCompetitionTeam = {
  id: string;
  slot_index: number;
  name: string;
  status?: string;
  player_id_1?: string | null;
  player_id_2?: string | null;
};

export type TournamentCompetitionStage = {
  id: string;
  stage_type: string;
  stage_name: string;
  stage_order: number;
};

export type ScheduleBooking = {
  booking_id: string;
  start_at: string;
  end_at: string;
  status: string;
  court_id: string;
  court_name: string | null;
};

export type TournamentCompetitionMatch = {
  id: string;
  stage_id: string | null;
  group_id: string | null;
  round_number: number | null;
  match_number: number | null;
  team_a_id: string | null;
  team_b_id: string | null;
  seed_label_a?: string | null;
  seed_label_b?: string | null;
  status?: string;
  winner_team_id?: string | null;
  booking_id?: string | null;
  schedule_booking?: ScheduleBooking | null;
  result?: {
    winner_team_id?: string | null;
    sets?: Array<{ games_a: number; games_b: number }>;
    submitted_at?: string | null;
  } | null;
};

export type TournamentTournamentWindow = {
  start_at: string;
  end_at: string;
  duration_min: number | null;
};

export type TournamentCourtBookingSlot = {
  booking_id: string;
  court_id: string;
  court_name: string | null;
  start_at: string;
  end_at: string;
  status: string;
  organizer_player_id: string | null;
  i_am_organizer: boolean;
  i_am_participant: boolean;
};

export type TournamentPlayerAgenda = {
  tournament_id: string;
  tournament_window: TournamentTournamentWindow;
  court_bookings: TournamentCourtBookingSlot[];
  my_court_bookings: TournamentCourtBookingSlot[];
};

export type TournamentCompetitionPlayerView = {
  teams: TournamentCompetitionTeam[];
  stages: TournamentCompetitionStage[];
  matches: TournamentCompetitionMatch[];
  my_team_ids: string[];
  my_matches: TournamentCompetitionMatch[];
  tournament_window?: TournamentTournamentWindow;
  court_bookings?: TournamentCourtBookingSlot[];
  /** Incluido desde `competition/player-view` (reglas y formato). */
  tournament?: {
    id?: string;
    match_rules?: { best_of_sets?: number; results_entry?: string } | null;
  } | null;
};

/** Detalle con inscripción del jugador (requiere sesión). */
export async function fetchTournamentPlayerDetail(
  tournamentId: string,
  token: string | null | undefined,
): Promise<{
  tournament: PublicTournamentRow;
  counts: { confirmed: number; pending: number };
  my_inscription: { status?: string } | null;
  my_entry_request: {
    id?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'dismissed' | string;
    message?: string;
    response_message?: string | null;
    created_at?: string;
    resolved_at?: string | null;
  } | null;
  participants: TournamentParticipantRow[];
} | null> {
  if (!token) return null;
  try {
    const res = await fetch(
      `${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/player-detail`,
      { headers: headers(token) },
    );
    const json = (await res.json()) as PlayerDetailJson;
    if (!res.ok || !json.ok || !json.tournament) return null;
    return {
      tournament: json.tournament,
      counts: json.counts ?? { confirmed: 0, pending: 0 },
      my_inscription: json.my_inscription ?? null,
      my_entry_request: json.my_entry_request ?? null,
      participants: json.participants ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Detalle para la pantalla del torneo: **una sola petición** si hay sesión (`player-detail`
 * ya incluye torneo + cupos + inscripción), evitando duplicar trabajo en servidor con
 * `public/:id` + `player-detail` en paralelo.
 */
export async function fetchTournamentDetailForScreen(
  tournamentId: string,
  token: string | null | undefined,
): Promise<
  | {
      ok: true;
      tournament: PublicTournamentRow;
      counts: { confirmed: number; pending: number };
      my_inscription: { status?: string } | null;
      my_entry_request: {
        id?: string;
        status?: 'pending' | 'approved' | 'rejected' | 'dismissed' | string;
        message?: string;
        response_message?: string | null;
        created_at?: string;
        resolved_at?: string | null;
      } | null;
      participants: TournamentParticipantRow[];
    }
  | { ok: false; error: string }
> {
  const t = token?.trim();
  if (t) {
    try {
      const res = await fetch(
        `${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/player-detail`,
        { headers: headers(t) },
      );
      const json = (await res.json()) as PlayerDetailJson;
      if (res.ok && json.ok && json.tournament) {
        return {
          ok: true,
          tournament: json.tournament,
          counts: json.counts ?? { confirmed: 0, pending: 0 },
          my_inscription: json.my_inscription ?? null,
          my_entry_request: json.my_entry_request ?? null,
          participants: json.participants ?? [],
        };
      }
      /** Nunca sustituir por detalle público con `my_inscription: null`: el usuario vería «Inscribirme» aunque esté inscrito. */
      return {
        ok: false,
        error: json.error ?? `No se pudo cargar el torneo (${res.status})`,
      };
    } catch {
      return { ok: false, error: 'Error de conexión' };
    }
  }
  return fetchTournamentPublicDetail(tournamentId).then((p) =>
    p.ok
      ? {
          ok: true,
          tournament: p.tournament,
          counts: p.counts,
          my_inscription: null,
          my_entry_request: null,
          participants: [],
        }
      : { ok: false, error: p.error },
  );
}

export async function submitTournamentEntryRequest(
  tournamentId: string,
  message: string,
  token: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para enviar solicitud' };
  try {
    const res = await fetch(`${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/entry-requests`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ message }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'No se pudo enviar la solicitud' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchTournamentChatMessages(
  tournamentId: string,
  token: string | null | undefined,
): Promise<{ ok: true; messages: TournamentChatMessage[] } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para ver el chat del torneo' };
  try {
    const res = await fetch(`${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/chat/player`, {
      headers: headers(token),
    });
    const json = (await res.json()) as { ok?: boolean; messages?: TournamentChatMessage[]; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudo cargar el chat del torneo' };
    }
    return { ok: true, messages: json.messages ?? [] };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function sendTournamentChatMessage(
  tournamentId: string,
  message: string,
  token: string | null | undefined,
): Promise<{ ok: true; message?: TournamentChatMessage } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para escribir en el chat del torneo' };
  try {
    const res = await fetch(`${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/chat/player`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ message }),
    });
    const json = (await res.json()) as { ok?: boolean; message?: TournamentChatMessage; error?: string };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'No se pudo enviar el mensaje' };
    return { ok: true, message: json.message };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchMyTournamentEntryRequests(
  token: string | null | undefined,
): Promise<{ ok: true; requests: MyTournamentEntryRequest[] } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para ver tus solicitudes' };
  try {
    const res = await fetch(`${API_URL}/tournaments/player/my-entry-requests`, {
      headers: headers(token),
    });
    const json = (await res.json()) as { ok?: boolean; requests?: MyTournamentEntryRequest[]; error?: string };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'No se pudieron cargar tus solicitudes' };
    return { ok: true, requests: json.requests ?? [] };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

type CompetitionPlayerViewResponse = {
  ok?: boolean;
  tournament?: TournamentCompetitionPlayerView['tournament'];
  teams?: TournamentCompetitionTeam[];
  stages?: TournamentCompetitionStage[];
  matches?: TournamentCompetitionMatch[];
  my_team_ids?: string[];
  my_matches?: TournamentCompetitionMatch[];
  tournament_window?: TournamentTournamentWindow;
  court_bookings?: TournamentCourtBookingSlot[];
  error?: string;
};

export async function submitTournamentMatchResultAsPlayer(
  tournamentId: string,
  matchId: string,
  sets: Array<{ games_a: number; games_b: number }>,
  token: string,
  options?: { override?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/result/player`,
      {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({ sets, override: Boolean(options?.override) }),
      },
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok && json.ok) return { ok: true };
    return { ok: false, error: json.error ?? 'No se pudo guardar el resultado' };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchTournamentCompetitionPlayerView(
  tournamentId: string,
  token: string | null | undefined,
): Promise<{ ok: true; data: TournamentCompetitionPlayerView } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para ver el cuadro y tus partidos' };
  try {
    const res = await fetch(
      `${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/competition/player-view`,
      { headers: headers(token) },
    );
    const json = (await res.json()) as CompetitionPlayerViewResponse;
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudo cargar la competencia del torneo' };
    }
    return {
      ok: true,
      data: {
        teams: json.teams ?? [],
        stages: json.stages ?? [],
        matches: json.matches ?? [],
        my_team_ids: json.my_team_ids ?? [],
        my_matches: json.my_matches ?? [],
        tournament_window: json.tournament_window,
        court_bookings: json.court_bookings ?? [],
        tournament: json.tournament ?? null,
      },
    };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

type PlayerAgendaJson = {
  ok?: boolean;
  tournament_id?: string;
  tournament_window?: TournamentTournamentWindow;
  court_bookings?: TournamentCourtBookingSlot[];
  my_court_bookings?: TournamentCourtBookingSlot[];
  error?: string;
};

export async function fetchTournamentPlayerAgenda(
  tournamentId: string,
  token: string | null | undefined,
): Promise<{ ok: true; data: TournamentPlayerAgenda } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para ver la agenda del torneo' };
  try {
    const res = await fetch(
      `${API_URL}/tournaments/${encodeURIComponent(tournamentId)}/player/agenda`,
      { headers: headers(token) },
    );
    const json = (await res.json()) as PlayerAgendaJson;
    if (!res.ok || !json.ok || !json.tournament_id) {
      return { ok: false, error: json.error ?? 'No se pudo cargar la agenda del torneo' };
    }
    return {
      ok: true,
      data: {
        tournament_id: json.tournament_id,
        tournament_window: json.tournament_window ?? {
          start_at: '',
          end_at: '',
          duration_min: null,
        },
        court_bookings: json.court_bookings ?? [],
        my_court_bookings: json.my_court_bookings ?? [],
      },
    };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}
