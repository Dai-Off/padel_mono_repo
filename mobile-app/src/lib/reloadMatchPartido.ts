import { fetchMatchById } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import type { PartidoItem } from '../screens/PartidosScreen';

const RETRY_MS = 400;

/** Carga el partido expandido; un reintento cubre desfase justo tras confirmar pago. */
export async function reloadMatchPartido(
  matchId: string,
  token: string,
  opts?: { retryIfMissingPlayerId?: string },
): Promise<PartidoItem | null> {
  const load = async () => {
    const m = await fetchMatchById(matchId, token);
    return m ? mapMatchToPartido(m) : null;
  };

  let partido = await load();
  const pid = opts?.retryIfMissingPlayerId?.trim();
  if (pid && partido && !(partido.playerIds ?? []).includes(pid)) {
    await new Promise((r) => setTimeout(r, RETRY_MS));
    partido = await load();
  }
  return partido;
}
