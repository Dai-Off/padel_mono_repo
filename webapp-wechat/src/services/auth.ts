import { apiFetch, apiFetchWithAuth } from './api';
import type { AuthResponse, MobileAdminMeResponse } from '../types/auth';
import { SESSION_STORAGE_KEY } from '../lib/session';

let meCache: { value: MobileAdminMeResponse; expiresAtMs: number } | null = null;
let meInFlight: Promise<MobileAdminMeResponse> | null = null;
const ME_CACHE_TTL_MS = 60_000;

export const authService = {
    login: async (email: string, password: string): Promise<AuthResponse> => {
        return apiFetch<AuthResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },

    getMe: async (): Promise<MobileAdminMeResponse> => {
        const now = Date.now();
        if (meCache && now < meCache.expiresAtMs) return meCache.value;
        if (meInFlight) return meInFlight;

        meInFlight = (async () => {
            const res = await apiFetchWithAuth<MobileAdminMeResponse>('/mobile-admin/auth/me');
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
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    },

    getSession: () => {
        try {
            const raw = localStorage.getItem(SESSION_STORAGE_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            return session && typeof session.access_token === 'string' ? session : null;
        } catch {
            return null;
        }
    },

    logout: () => {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        meCache = null;
        meInFlight = null;
    },

    clearMeCache: () => {
        meCache = null;
        meInFlight = null;
    },
};
