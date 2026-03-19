// padel_fe/src/services/api.ts
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
    try {
        const raw = localStorage.getItem('padel_session');
        if (!raw) return null;
        const session = JSON.parse(raw);
        return session?.access_token ?? null;
    } catch {
        return null;
    }
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
    const token = getStoredToken();
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        if (response.status === 401 && token) {
            try {
                localStorage.removeItem('padel_session');
            } catch {
                /* ignore */
            }
            sessionStorage.setItem('padel_session_expired', '1');
            window.location.assign('/login');
        }
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new HttpError(errorData.error || errorData.message || 'API Request failed', response.status);
    }
    return response.json();
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
