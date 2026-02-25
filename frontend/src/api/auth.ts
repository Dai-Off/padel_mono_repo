import { API_URL } from '../config';

type AuthResponse = {
  ok: boolean;
  user?: { id: string; email: string; user_metadata?: { full_name?: string } };
  session?: { access_token: string; refresh_token: string; expires_at?: number } | null;
  error?: string;
  error_code?: string;
};

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
    body: JSON.stringify({ email, password, name: name || undefined }),
  });
  return res.json();
}
