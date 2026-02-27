import { apiFetch } from './api';
import type { Booking, ApiResponse } from '../types/api';

export const bookingService = {
    getAll: async (filters: { court_id?: string; organizer_player_id?: string } = {}): Promise<Booking[]> => {
        const params = new URLSearchParams();
        if (filters.court_id) params.append('court_id', filters.court_id);
        if (filters.organizer_player_id) params.append('organizer_player_id', filters.organizer_player_id);

        const response = await apiFetch<ApiResponse<{ bookings: Booking[] }>>(`/bookings?${params.toString()}`);
        return response.bookings || [];
    },

    getById: async (id: string): Promise<Booking> => {
        const response = await apiFetch<ApiResponse<{ booking: Booking }>>(`/bookings/${id}`);
        return response.booking;
    },

    create: async (data: Partial<Booking>): Promise<Booking> => {
        const response = await apiFetch<ApiResponse<{ booking: Booking }>>('/bookings', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return response.booking;
    },

    update: async (id: string, data: Partial<Booking>): Promise<Booking> => {
        const response = await apiFetch<ApiResponse<{ booking: Booking }>>(`/bookings/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return response.booking;
    },

    cancel: async (id: string): Promise<void> => {
        await apiFetch<ApiResponse<any>>(`/bookings/${id}`, {
            method: 'DELETE',
        });
    },
};
