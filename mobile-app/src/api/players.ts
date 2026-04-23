import { API_URL } from "../config";

type PlayersResponse = {
  ok?: boolean;
  players?: { id: string }[];
  error?: string;
};

type MeResponse = {
  ok?: boolean;
  player?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    elo_rating?: number | null;
    status?: string | null;
    liga?: string | null;
    lps?: number | null;
    mm_peak_liga?: string | null;
    matches_played_matchmaking?: number | null;
    fiabilidad?: number | null;
    mm_wins?: number | null;
    mm_losses?: number | null;
    mm_draws?: number | null;
    preferred_side?: string | null;
    preferred_schedule_slots?: string[] | null;
    preferred_days?: string[] | null;
    preferred_play_style?: string | null;
    preferred_match_duration_min?: number | null;
    preferred_partner_level?: string | null;
    favorite_clubs?: string[] | null;
    notif_new_matches?: boolean | null;
    notif_tournament_reminders?: boolean | null;
    notif_class_updates?: boolean | null;
    notif_chat_messages?: boolean | null;
  };
  error?: string;
};

export type PlayerPreferences = {
  preferredSide: "right" | "left" | "both";
  preferredScheduleSlots: ("morning" | "afternoon" | "evening" | "night")[];
  preferredDays: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
  preferredPlayStyle: "competitive" | "social" | "learning" | "balanced";
  preferredMatchDurationMin: 60 | 90 | 120;
  preferredPartnerLevel: "similar" | "higher" | "lower" | "any";
  favoriteClubs: string[];
  notifNewMatches: boolean;
  notifTournamentReminders: boolean;
  notifClassUpdates: boolean;
  notifChatMessages: boolean;
};

export type MyPlayerProfile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  eloRating: number | null;
  status: string | null;
  /** Código de liga MM global: bronce | plata | oro | elite */
  liga: string | null;
  lps: number | null;
  mmPeakLiga: string | null;
  matchesPlayedMatchmaking: number | null;
  fiabilidad: number | null;
  mmWins: number;
  mmLosses: number;
  mmDraws: number;
  preferences: PlayerPreferences;
};

/** Obtiene el jugador actual según la sesión (Bearer token). */
export async function fetchMyPlayerId(
  token: string | null | undefined,
): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/players/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as MeResponse;
    if (res.ok && json.ok && json.player) return json.player.id;
    return null;
  } catch {
    return null;
  }
}

/** Obtiene el perfil completo del jugador actual según la sesión (Bearer token). */
export async function fetchMyPlayerProfile(
  token: string | null | undefined,
): Promise<MyPlayerProfile | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/players/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as MeResponse;
    if (!res.ok || !json.ok || !json.player) return null;
    const rawElo = json.player.elo_rating as number | string | null | undefined;
    const eloNum =
      rawElo == null || rawElo === ""
        ? null
        : typeof rawElo === "number"
          ? rawElo
          : Number(String(rawElo).trim());
    const rawLps = json.player.lps;
    const lpsNum = rawLps == null ? null : Number(rawLps);
    const rawMpm = json.player.matches_played_matchmaking;
    const mpmNum = rawMpm == null ? null : Number(rawMpm);
    const rawFiab = json.player.fiabilidad;
    const fiabNum = rawFiab == null ? null : Number(rawFiab);
    const parseInt0 = (v: unknown): number => {
      if (v == null || v === "") return 0;
      const n = typeof v === "number" ? v : Number(String(v).trim());
      return n != null && !Number.isNaN(n) ? Math.max(0, Math.round(n)) : 0;
    };
    const parseArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
    const prefSideRaw = String(json.player.preferred_side ?? "both")
      .trim()
      .toLowerCase();
    const prefSide: PlayerPreferences["preferredSide"] =
      prefSideRaw === "right" || prefSideRaw === "left" ? prefSideRaw : "both";
    const prefStyleRaw = String(json.player.preferred_play_style ?? "balanced")
      .trim()
      .toLowerCase();
    const prefStyle: PlayerPreferences["preferredPlayStyle"] =
      prefStyleRaw === "competitive" ||
      prefStyleRaw === "social" ||
      prefStyleRaw === "learning"
        ? prefStyleRaw
        : "balanced";
    const prefLevelRaw = String(json.player.preferred_partner_level ?? "any")
      .trim()
      .toLowerCase();
    const prefLevel: PlayerPreferences["preferredPartnerLevel"] =
      prefLevelRaw === "similar" ||
      prefLevelRaw === "higher" ||
      prefLevelRaw === "lower"
        ? prefLevelRaw
        : "any";
    const rawDuration = Number(json.player.preferred_match_duration_min ?? 90);
    const prefDuration: PlayerPreferences["preferredMatchDurationMin"] =
      rawDuration === 60 || rawDuration === 120 ? rawDuration : 90;
    const prefSlots = parseArray(json.player.preferred_schedule_slots)
      .map((v) => v.toLowerCase())
      .filter((v): v is PlayerPreferences["preferredScheduleSlots"][number] =>
        ["morning", "afternoon", "evening", "night"].includes(v),
      );
    const prefDays = parseArray(json.player.preferred_days)
      .map((v) => v.toLowerCase())
      .filter((v): v is PlayerPreferences["preferredDays"][number] =>
        ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(v),
      );
    return {
      id: json.player.id,
      firstName: json.player.first_name ?? null,
      lastName: json.player.last_name ?? null,
      email: json.player.email ?? null,
      phone: json.player.phone ?? null,
      eloRating: eloNum != null && !Number.isNaN(eloNum) ? eloNum : null,
      status: json.player.status ?? null,
      liga:
        json.player.liga != null && String(json.player.liga).trim() !== ""
          ? String(json.player.liga)
          : null,
      lps:
        lpsNum != null && !Number.isNaN(lpsNum)
          ? Math.max(0, Math.round(lpsNum))
          : null,
      mmPeakLiga:
        json.player.mm_peak_liga != null &&
        String(json.player.mm_peak_liga).trim() !== ""
          ? String(json.player.mm_peak_liga)
          : null,
      matchesPlayedMatchmaking:
        mpmNum != null && !Number.isNaN(mpmNum)
          ? Math.max(0, Math.round(mpmNum))
          : null,
      fiabilidad:
        fiabNum != null && !Number.isNaN(fiabNum)
          ? Math.max(0, Math.min(100, Math.round(fiabNum)))
          : null,
      mmWins: parseInt0(json.player.mm_wins),
      mmLosses: parseInt0(json.player.mm_losses),
      mmDraws: parseInt0(json.player.mm_draws),
      preferences: {
        preferredSide: prefSide,
        preferredScheduleSlots: prefSlots,
        preferredDays: prefDays,
        preferredPlayStyle: prefStyle,
        preferredMatchDurationMin: prefDuration,
        preferredPartnerLevel: prefLevel,
        favoriteClubs: parseArray(json.player.favorite_clubs).slice(0, 20),
        notifNewMatches: json.player.notif_new_matches !== false,
        notifTournamentReminders:
          json.player.notif_tournament_reminders !== false,
        notifClassUpdates: json.player.notif_class_updates !== false,
        notifChatMessages: json.player.notif_chat_messages !== false,
      },
    };
  } catch {
    return null;
  }
}

export async function updateMyPlayerPreferences(
  token: string | null | undefined,
  preferences: PlayerPreferences,
): Promise<
  { ok: true; player: MyPlayerProfile } | { ok: false; error: string }
> {
  if (!token)
    return {
      ok: false,
      error: "Inicia sesión para actualizar tus preferencias",
    };
  try {
    const res = await fetch(`${API_URL}/players/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        preferred_side: preferences.preferredSide,
        preferred_schedule_slots: preferences.preferredScheduleSlots,
        preferred_days: preferences.preferredDays,
        preferred_play_style: preferences.preferredPlayStyle,
        preferred_match_duration_min: preferences.preferredMatchDurationMin,
        preferred_partner_level: preferences.preferredPartnerLevel,
        favorite_clubs: preferences.favoriteClubs,
        notif_new_matches: preferences.notifNewMatches,
        notif_tournament_reminders: preferences.notifTournamentReminders,
        notif_class_updates: preferences.notifClassUpdates,
        notif_chat_messages: preferences.notifChatMessages,
      }),
    });
    const json = (await res.json()) as MeResponse;
    if (!res.ok || !json.ok || !json.player)
      return {
        ok: false,
        error: json.error ?? "No se pudo actualizar preferencias",
      };
    const refreshed = await fetchMyPlayerProfile(token);
    if (!refreshed)
      return { ok: false, error: "No se pudo refrescar tu perfil" };
    return { ok: true, player: refreshed };
  } catch {
    return { ok: false, error: "Error de conexión" };
  }
}

/** Obtiene el id del primer jugador disponible (para desarrollo/pruebas cuando no hay auth). */
export type PlayerSearchHit = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
};

/** Lista jugadores; con `q` filtra por nombre o teléfono (misma API que el panel). */
export async function searchPlayers(
  q: string,
  token: string | null | undefined,
): Promise<
  { ok: true; players: PlayerSearchHit[] } | { ok: false; error: string }
> {
  try {
    const url = new URL(`${API_URL}/players`);
    const trimmed = q.trim();
    if (trimmed.length > 0) url.searchParams.set("q", trimmed);
    const res = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const json = (await res.json()) as {
      ok?: boolean;
      players?: PlayerSearchHit[];
      error?: string;
    };
    if (!res.ok || !json.ok)
      return { ok: false, error: json.error ?? "Búsqueda no disponible" };
    return { ok: true, players: json.players ?? [] };
  } catch {
    return { ok: false, error: "Error de conexión" };
  }
}

export async function fetchFirstPlayerId(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/players`, {
      headers: { "Content-Type": "application/json" },
    });
    const json = (await res.json()) as PlayersResponse;
    const players = json.players;
    if (Array.isArray(players) && players.length > 0) {
      return players[0].id;
    }
    return null;
  } catch {
    return null;
  }
}
