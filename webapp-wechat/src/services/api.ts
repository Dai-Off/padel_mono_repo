import { getSupabaseClient } from '../lib/supabase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '');

export function getApiBase(): string {
  return API_BASE_URL;
}

export class HttpError extends Error {
    status: number;
    code?: string;
    data?: Record<string, unknown>;
    constructor(message: string, status: number, code?: string, data?: Record<string, unknown>) {
        super(message);
        this.status = status;
        this.code = code;
        this.data = data;
    }
}

type StoredSession = {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
};

function getStoredSession(): StoredSession | null {
    try {
        const raw = localStorage.getItem('padel_session');
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (!session || typeof session.access_token !== 'string') return null;
        return session as StoredSession;
    } catch {
        return null;
    }
}

function saveStoredSession(session: StoredSession): void {
    localStorage.setItem('padel_session', JSON.stringify(session));
}

function isTokenExpiringSoon(expiresAt?: number): boolean {
    if (!expiresAt) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return expiresAt - nowSec <= 60;
}

async function refreshSessionTokenIfPossible(): Promise<StoredSession | null> {
    const current = getStoredSession();
    if (!current?.refresh_token) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: current.refresh_token });
    if (error || !data.session?.access_token) return null;
    const next: StoredSession = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token ?? current.refresh_token,
        expires_at: data.session.expires_at,
    };
    saveStoredSession(next);
    return next;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new HttpError(
            (errorData as { error?: string; message?: string }).error ||
                (errorData as { message?: string }).message ||
                'API Request failed',
            response.status,
            typeof (errorData as { code?: unknown }).code === 'string'
                ? (errorData as { code: string }).code
                : undefined,
            errorData as Record<string, unknown>
        );
    }
    return response.json();
}

export async function apiFetchWithAuth<T>(path: string, options: RequestInit = {}): Promise<T> {
    let session = getStoredSession();
    if (session && isTokenExpiringSoon(session.expires_at)) {
        session = (await refreshSessionTokenIfPossible()) ?? session;
    }
    const token = session?.access_token ?? null;
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    let response = await fetch(url, { ...options, headers });

    if (response.status === 401 && session?.refresh_token) {
        const refreshed = await refreshSessionTokenIfPossible();
        if (refreshed?.access_token) {
            const retryHeaders = new Headers(options.headers || {});
            if (!retryHeaders.has('Content-Type')) retryHeaders.set('Content-Type', 'application/json');
            retryHeaders.set('Authorization', `Bearer ${refreshed.access_token}`);
            response = await fetch(url, { ...options, headers: retryHeaders });
        }
    }

    if (!response.ok) {
        if (response.status === 401 && session?.access_token) {
            try { localStorage.removeItem('padel_session'); } catch { /* ignore */ }
            sessionStorage.setItem('padel_session_expired', '1');
            window.location.assign('/login');
        }
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new HttpError(
            (errorData as { error?: string; message?: string }).error ||
                (errorData as { message?: string }).message ||
                'API Request failed',
            response.status,
            typeof (errorData as { code?: unknown }).code === 'string'
                ? (errorData as { code: string }).code
                : undefined,
            errorData as Record<string, unknown>
        );
    }
    return response.json();
}
