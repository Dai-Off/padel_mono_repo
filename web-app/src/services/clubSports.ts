import { apiFetchWithAuth } from './api';
import type { ClubSport } from '../types/clubSports';
import type { ApiResponse } from '../types/api';

export const clubSportsService = {
    getAll: async (clubId: string): Promise<ClubSport[]> => {
        const response = await apiFetchWithAuth<ApiResponse<{ sports: ClubSport[] }>>(`/club-sports?club_id=${clubId}`);
        return response.sports ?? [];
    },
    create: async (payload: { club_id: string; name: string; allows_singles: boolean; is_active?: boolean }): Promise<ClubSport> => {
        const response = await apiFetchWithAuth<ApiResponse<{ sport: ClubSport }>>('/club-sports', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return response.sport;
    },
    update: async (id: string, payload: Partial<Pick<ClubSport, 'name' | 'slug' | 'allows_singles' | 'is_active'>>): Promise<ClubSport> => {
        const response = await apiFetchWithAuth<ApiResponse<{ sport: ClubSport }>>(`/club-sports/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        return response.sport;
    },
    delete: async (id: string): Promise<void> => {
        await apiFetchWithAuth(`/club-sports/${id}`, { method: 'DELETE' });
    },
};
