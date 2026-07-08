import { getApiBase } from '../../../services/api';

/** URL HTTPS compartible (WhatsApp, etc.) que abre la app móvil en el detalle del partido. */
export function buildMatchShareUrl(matchId: string): string {
  return `${getApiBase()}/matches/join/${encodeURIComponent(matchId)}`;
}
