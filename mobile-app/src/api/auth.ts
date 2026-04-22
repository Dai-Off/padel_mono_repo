import { API_URL } from '../config';

type AuthResponse = {
  ok: boolean;
  user?: { id: string; email: string; user_metadata?: { full_name?: string } };
  session?: { access_token: string; refresh_token: string; expires_at?: number } | null;
  error?: string;
  error_code?: string;
};

export type RefreshSessionResult = AuthResponse & { httpStatus: number };

/** Renueva access_token; httpStatus 401 si el refresh ya no es válido; 0 si falló la red. */
export async function refreshSession(refreshToken: string): Promise<RefreshSessionResult> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const json = (await res.json()) as AuthResponse;
    return { ...json, httpStatus: res.status };
  } catch {
    return { ok: false, httpStatus: 0, error: 'network' };
  }
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function register(
  email: string,
  password: string,
  name?: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: name || undefined, source: 'mobile' }),
  });
  return res.json();
}
