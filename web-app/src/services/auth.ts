import { apiFetch } from './api';
import type { AuthResponse } from '../types/auth';

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

    saveSession: (session: any) => {
        localStorage.setItem('padel_session', JSON.stringify(session));
    },

    getSession: () => {
        const session = localStorage.getItem('padel_session');
        return session ? JSON.parse(session) : null;
    },

    logout: () => {
        localStorage.removeItem('padel_session');
    }
};
