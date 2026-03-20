import { apiFetch, apiFetchWithAuth } from './api';
import type { AuthResponse, MeResponse } from '../types/auth';

let meCache: { value: MeResponse; expiresAtMs: number } | null = null;
let meInFlight: Promise<MeResponse> | null = null;
const ME_CACHE_TTL_MS = 60_000; // 1 minute

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

    forgotPassword: async (email: string): Promise<{ ok: boolean; error?: string; message?: string }> => {
        return apiFetch<{ ok: boolean; error?: string; message?: string }>('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
        });
    },

    getMe: async (): Promise<MeResponse> => {
        const now = Date.now();
        if (meCache && now < meCache.expiresAtMs) return meCache.value;
        if (meInFlight) return meInFlight;

        meInFlight = (async () => {
            const res = await apiFetchWithAuth<MeResponse>('/auth/me');
            meCache = { value: res, expiresAtMs: Date.now() + ME_CACHE_TTL_MS };
            return res;
        })();

        try {
            return await meInFlight;
        } finally {
            meInFlight = null;
        }
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
        meCache = null;
        meInFlight = null;
    },
};
