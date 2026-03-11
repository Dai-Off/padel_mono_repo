import { apiFetch, apiFetchWithAuth } from './api';
import type { AuthResponse, MeResponse } from '../types/auth';

export const authService = {
    login: async (email: string, password: string): Promise<AuthResponse> => {
        return apiFetch<AuthResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },

    register: async (email: string, password: string, name?: string): Promise<AuthResponse> => {
        return apiFetch<AuthResponse>('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
        });
    },

    getMe: async (): Promise<MeResponse> => {
        return apiFetchWithAuth<MeResponse>('/auth/me');
    },

    saveSession: (session: { access_token: string; refresh_token?: string; expires_at?: number }) => {
        localStorage.setItem('padel_session', JSON.stringify(session));
    },

    getSession: () => {
        try {
            const raw = localStorage.getItem('padel_session');
            if (!raw) return null;
            const session = JSON.parse(raw);
            return session && typeof session.access_token === 'string' ? session : null;
        } catch {
            return null;
        }
    },

    logout: () => {
        localStorage.removeItem('padel_session');
    },
};
