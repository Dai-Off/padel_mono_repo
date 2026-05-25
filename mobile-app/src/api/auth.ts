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
  identifier: string,
  password: string
): Promise<AuthResponse> {
  const trimmed = identifier.trim();
  const body =
    trimmed.includes('@')
      ? { email: trimmed.toLowerCase(), password }
      : { identifier: trimmed.toLowerCase(), password };
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function register(
  email: string,
  password: string,
  username: string,
  name?: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      username: username.trim().toLowerCase(),
      name: name || undefined,
      source: 'mobile',
    }),
  });
  return res.json();
}

export async function checkUsernameAvailable(
  q: string,
  excludePlayerId?: string,
): Promise<{ ok: true; available: boolean } | { ok: false; error: string }> {
  try {
    const url = new URL(`${API_URL}/players/username/check`);
    url.searchParams.set('q', q.trim().toLowerCase());
    if (excludePlayerId) url.searchParams.set('exclude_player_id', excludePlayerId);
    const res = await fetch(url.toString());
    const json = (await res.json()) as { ok?: boolean; available?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudo comprobar el usuario' };
    }
    return { ok: true, available: json.available === true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
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

export type ChangePasswordResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

/** Cambia la contraseña del usuario con sesión activa. */
export async function changePassword(
  accessToken: string,
  refreshToken: string,
  password: string,
): Promise<ChangePasswordResponse & { httpStatus: number }> {
  try {
    const res = await fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        password,
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
    });
    const json = (await res.json()) as ChangePasswordResponse;
    return { ...json, httpStatus: res.status };
  } catch {
    return { ok: false, httpStatus: 0, error: 'Error de conexión' };
  }
}

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
