import { API_URL } from '../config';

export interface FollowerPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  frame?: any | null;
  is_following?: boolean;
}

function getHeaders(token: string | null | undefined) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Toggle follow/unfollow a un jugador.
 */
export async function toggleFollow(
  token: string | null | undefined,
  playerId: string
): Promise<{ ok: boolean; following?: boolean; followers_count?: number; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/players/${playerId}/follow`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Obtener estado de seguimiento.
 */
export async function fetchFollowStatus(
  token: string | null | undefined,
  playerId: string
): Promise<{ ok: boolean; is_following: boolean; is_followed_by: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/players/${playerId}/follow-status`, {
      headers: getHeaders(token),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, is_following: false, is_followed_by: false, error: (err as Error).message };
  }
}

/**
 * Obtener contadores del usuario actual.
 */
export async function fetchFollowCounts(
  token: string | null | undefined
): Promise<{ ok: boolean; followers_count: number; following_count: number; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/players/me/follow-counts`, {
      headers: getHeaders(token),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, followers_count: 0, following_count: 0, error: (err as Error).message };
  }
}

/**
 * Obtener seguidores de un jugador.
 */
export async function fetchFollowers(
  token: string | null | undefined,
  playerId: string,
  cursor?: string
): Promise<{ ok: boolean; followers: FollowerPlayer[]; next_cursor: string | null; error?: string }> {
  try {
    const url = new URL(`${API_URL}/players/${playerId}/followers`);
    if (cursor) url.searchParams.append('cursor', cursor);
    const res = await fetch(url.toString(), {
      headers: getHeaders(token),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, followers: [], next_cursor: null, error: (err as Error).message };
  }
}

/**
 * Obtener personas seguidas por un jugador.
 */
export async function fetchFollowing(
  token: string | null | undefined,
  playerId: string,
  cursor?: string
): Promise<{ ok: boolean; following: FollowerPlayer[]; next_cursor: string | null; error?: string }> {
  try {
    const url = new URL(`${API_URL}/players/${playerId}/following`);
    if (cursor) url.searchParams.append('cursor', cursor);
    const res = await fetch(url.toString(), {
      headers: getHeaders(token),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, following: [], next_cursor: null, error: (err as Error).message };
  }
}
