import { apiFetch } from './api';
import type { Court } from '../types/court';

export const courtService = {
    getAll: async (clubId: string): Promise<Court[]> => {
        return apiFetch<Court[]>(`/courts/club/${clubId}`);
    },

    getById: async (id: string): Promise<Court> => {
        return apiFetch<Court>(`/courts/${id}`);
    },

    create: async (data: Partial<Court>): Promise<Court> => {
        return apiFetch<Court>('/courts', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Court>): Promise<Court> => {
        return apiFetch<Court>(`/courts/${id}`, {
            method: 'PUT', // O PATCH según tu backend
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<void> => {
        return apiFetch<void>(`/courts/${id}`, {
            method: 'DELETE',
        });
    },
};
