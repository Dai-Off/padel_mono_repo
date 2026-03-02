import { apiFetch } from './api';
import type { Court } from '../types/court';
import type { ApiResponse } from '../types/api';

export const courtService = {
    getAll: async (clubId?: string): Promise<Court[]> => {
        const path = clubId ? `/courts?club_id=${clubId}` : '/courts';
        const response = await apiFetch<ApiResponse<{ courts: Court[] }>>(path);
        return response.courts || [];
    },

    getById: async (id: string): Promise<Court> => {
        const response = await apiFetch<ApiResponse<{ court: Court }>>(`/courts/${id}`);
        return response.court;
    },

    create: async (data: Partial<Court>): Promise<Court> => {
        const response = await apiFetch<ApiResponse<{ court: Court }>>('/courts', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return response.court;
    },

    update: async (id: string, data: Partial<Court>): Promise<Court> => {
        const response = await apiFetch<ApiResponse<{ court: Court }>>(`/courts/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return response.court;
    },

    delete: async (id: string): Promise<void> => {
        await apiFetch<ApiResponse<any>>(`/courts/${id}`, {
            method: 'DELETE',
        });
    },
};
