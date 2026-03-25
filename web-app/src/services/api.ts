// padel_fe/src/services/api.ts
import { getSupabaseClient } from '../lib/supabase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '');

export function getApiBase(): string {
  return API_BASE_URL;
}

export class HttpError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

function getStoredToken(): string | null {
    const session = getStoredSession();
    return session?.access_token ?? null;
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

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new HttpError(errorData.error || errorData.message || 'API Request failed', response.status);
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

    // If access token expired/invalid, try one refresh + retry before forcing logout.
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
        if (response.status === 401 && getStoredToken()) {
            try { localStorage.removeItem('padel_session'); } catch { /* ignore */ }
            sessionStorage.setItem('padel_session_expired', '1');
            window.location.assign('/login');
        }
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new HttpError(errorData.error || errorData.message || 'API Request failed', response.status);
    }
    return response.json();
}

export async function apiFetchBlobWithAuth(path: string): Promise<Blob> {
    let session = getStoredSession();
    if (session && isTokenExpiringSoon(session.expires_at)) {
        session = (await refreshSessionTokenIfPossible()) ?? session;
    }
    const token = session?.access_token ?? null;
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    let response = await fetch(url, { method: 'GET', headers });
    if (response.status === 401 && session?.refresh_token) {
        const refreshed = await refreshSessionTokenIfPossible();
        if (refreshed?.access_token) {
            const retryHeaders = new Headers();
            retryHeaders.set('Authorization', `Bearer ${refreshed.access_token}`);
            response = await fetch(url, { method: 'GET', headers: retryHeaders });
        }
    }
    if (!response.ok) {
        if (response.status === 401 && getStoredToken()) {
            try { localStorage.removeItem('padel_session'); } catch { /* ignore */ }
            sessionStorage.setItem('padel_session_expired', '1');
            window.location.assign('/login');
        }
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new HttpError(errorData.error || errorData.message || 'API Request failed', response.status);
    }
    return response.blob();
}

export class ApiService {
    protected async get<T>(path: string): Promise<T> {
        return apiFetch<T>(path, { method: 'GET' });
    }

    protected async post<T>(path: string, data: any): Promise<T> {
        return apiFetch<T>(path, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    protected async put<T>(path: string, data: any): Promise<T> {
        return apiFetch<T>(path, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    protected async deleteRequest<T>(path: string): Promise<T> {
        return apiFetch<T>(path, { method: 'DELETE' });
    }
}

export class ApiServiceWithAuth extends ApiService {
    protected override async get<T>(path: string): Promise<T> {
        return apiFetchWithAuth<T>(path, { method: 'GET' });
    }

    protected override async post<T>(path: string, data: any): Promise<T> {
        return apiFetchWithAuth<T>(path, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    protected override async put<T>(path: string, data: any): Promise<T> {
        return apiFetchWithAuth<T>(path, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    protected override async deleteRequest<T>(path: string): Promise<T> {
        return apiFetchWithAuth<T>(path, { method: 'DELETE' });
    }
}
