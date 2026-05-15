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

export type ForgotPasswordResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  error_code?: string;
};

/** Solicita correo de recuperación; el enlace abre /reset-password en la web-app (web y móvil). */
export async function forgotPassword(
  email: string,
  options?: { client?: 'mobile' | 'web' }
): Promise<ForgotPasswordResponse & { httpStatus: number }> {
  try {
    const res = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        client: options?.client === 'web' ? 'web' : 'mobile',
      }),
    });
    const json = (await res.json()) as ForgotPasswordResponse;
    return { ...json, httpStatus: res.status };
  } catch {
    return { ok: false, httpStatus: 0, error: 'network' };
  }
}

export type ApplyRecoveryPasswordResponse = {
  ok: boolean;
  message?: string;
  error?: string;
};

export async function applyRecoveryPassword(params: {
  password: string;
  access_token?: string;
  refresh_token?: string;
  token_hash?: string;
}): Promise<ApplyRecoveryPasswordResponse & { httpStatus: number }> {
  try {
    const res = await fetch(`${API_URL}/auth/recovery/apply-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: params.password,
        access_token: params.access_token,
        refresh_token: params.refresh_token,
        token_hash: params.token_hash,
      }),
    });
    const json = (await res.json()) as ApplyRecoveryPasswordResponse;
    return { ...json, httpStatus: res.status };
  } catch {
    return { ok: false, httpStatus: 0, error: 'network' };
  }
}
