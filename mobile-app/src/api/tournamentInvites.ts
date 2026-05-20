import { API_URL } from '../config';

export async function acceptTournamentInvite(
  token: string | null | undefined,
  inviteToken: string,
  tournamentId: string,
): Promise<{ ok: true; tournament_id: string } | { ok: false; error: string }> {
  if (!token) {
    return { ok: false, error: 'Inicia sesión para aceptar la invitación' };
  }
  try {
    const res = await fetch(
      `${API_URL}/tournaments/invites/${encodeURIComponent(inviteToken)}/accept`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      },
    );
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      tournament_id?: string;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudo aceptar la invitación' };
    }
    return {
      ok: true,
      tournament_id: json.tournament_id ?? tournamentId,
    };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}
