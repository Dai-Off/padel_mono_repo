import { apiFetch } from './api';
import type { ApiListResponse, Player } from '../types/api';

export async function listPlayers(query?: string): Promise<Player[]> {
    const params = new URLSearchParams();
    if (query?.trim()) params.set('q', query.trim());
    const qs = params.toString();
    const path = qs ? `/players?${qs}` : '/players';
    const response = await apiFetch<ApiListResponse<'players', Player>>(path);
    return response.players ?? [];
}
