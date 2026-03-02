import { apiFetch } from './api';
import type { Player, ApiResponse } from '../types/api';

export const playerService = {
    getAll: async (): Promise<Player[]> => {
        const response = await apiFetch<ApiResponse<{ players: Player[] }>>('/players');
        return response.players || [];
    },

    getById: async (id: string): Promise<Player> => {
        const response = await apiFetch<ApiResponse<{ player: Player }>>(`/players/${id}`);
        return response.player;
    },

    create: async (data: Partial<Player>): Promise<Player> => {
        const response = await apiFetch<ApiResponse<{ player: Player }>>('/players', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return response.player;
    },

    update: async (id: string, data: Partial<Player>): Promise<Player> => {
        const response = await apiFetch<ApiResponse<{ player: Player }>>(`/players/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return response.player;
    },

    delete: async (id: string): Promise<void> => {
        await apiFetch<ApiResponse<any>>(`/players/${id}`, {
            method: 'DELETE',
        });
    },
};
