import { API_URL } from '../config';

export type ZoneTrends = {
  popularTimeSlot: string | null;
  topClub: string | null;
  activePlayersToday: number | null;
  nextTournament: string | null;
};

export async function fetchZoneTrends(token?: string | null): Promise<ZoneTrends> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_URL}/home/zone-trends`, { headers });
    if (!res.ok) throw new Error('Zone trends fetch failed');
    const json = await res.json();
    return {
      popularTimeSlot: json.popularTimeSlot ?? null,
      topClub: json.topClub ?? null,
      activePlayersToday: json.activePlayersToday ?? null,
      nextTournament: json.nextTournament ?? null,
    };
  } catch {
    return {
      popularTimeSlot: null,
      topClub: null,
      activePlayersToday: null,
      nextTournament: null,
    };
  }
}

export type HomeStats = {
  courtsFree: number;
  playersLooking: number;
  classesToday: number;
  tournaments: number;
};

async function fetchCount<T>(
  url: string,
  key: keyof T,
  headers: Record<string, string>
): Promise<number> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return 0;
    const json = (await res.json()) as T;
    const arr = json[key];
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

export async function fetchHomeStats(token?: string | null): Promise<HomeStats> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const [courtsFree, playersLooking] = await Promise.all([
    fetchCount<{ courts?: unknown[] }>(`${API_URL}/courts`, 'courts', headers),
    fetchCount<{ players?: unknown[] }>(`${API_URL}/players`, 'players', headers),
  ]);

  return {
    courtsFree,
    playersLooking,
    classesToday: 0,
    tournaments: 0,
  };
}
