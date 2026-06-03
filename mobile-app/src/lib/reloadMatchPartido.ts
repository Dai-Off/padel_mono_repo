import { fetchMatchById } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import type { PartidoItem } from '../screens/PartidosScreen';

const RETRY_MS = 450;
const MAX_PLAYER_RETRIES = 4;

/** Carga el partido expandido; reintentos cubren desfase justo tras confirmar pago. */
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
  if (!pid) return partido;

  for (let attempt = 0; attempt < MAX_PLAYER_RETRIES; attempt++) {
    if (!partido) break;
    const inIds = (partido.playerIds ?? []).includes(pid);
    const inSlots = (partido.playerIdsBySlot ?? []).some((id) => id === pid);
    if (inIds || inSlots) break;
    await new Promise((r) => setTimeout(r, RETRY_MS));
    partido = await load();
  }
  return partido;
}
