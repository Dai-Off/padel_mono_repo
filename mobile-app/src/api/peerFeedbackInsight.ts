import { API_URL } from '../config';

export type PeerFeedbackInsight = {
  ok: boolean;
  empty: boolean;
  match_id: string | null;
  feedback_created_at: string | null;
  peer_count: number;
  average_perceived: number | null;
  distribution: { high: number; mid: number; low: number } | null;
  last_perceived: -1 | 0 | 1 | null;
  recommendation_ia: string | null;
  fortalezas: string[];
  a_mejorar: string[];
  insight_source: 'openai' | 'template' | null;
};

/**
 * Obtiene el insight del feedback de compañeros para un jugador específico.
 */
export async function fetchMyPeerFeedbackInsight(
  token: string | null | undefined,
  playerId: string
): Promise<PeerFeedbackInsight | null> {
  if (!token || !playerId) return null;
  try {
    const res = await fetch(`${API_URL}/players/${playerId}/last-peer-feedback-insight`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
        console.warn('[fetchMyPeerFeedbackInsight] HTTP error:', res.status);
        return null;
    }

    const json = (await res.json()) as PeerFeedbackInsight;
    return json;
  } catch (err) {
    console.error('[fetchMyPeerFeedbackInsight] error:', err);
    return null;
  }
}
