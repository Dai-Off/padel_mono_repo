function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const EDGE_INVOKE_SECRET = (process.env.EDGE_INVOKE_SECRET || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

/**
 * Invoca la Edge Function por HTTP (sin JWT: la función debe tener verify_jwt = false).
 * Opcional: EDGE_INVOKE_SECRET en backend y en la función para autorizar solo este servidor.
 */
async function invokeEdgeFunction(name: string, body: Record<string, unknown>): Promise<{ sent: boolean; error?: string }> {
  if (!SUPABASE_URL) {
    return { sent: false, error: 'Falta SUPABASE_URL' };
  }
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (EDGE_INVOKE_SECRET) headers['x-edge-invoke-secret'] = EDGE_INVOKE_SECRET;
  if (SUPABASE_SERVICE_ROLE_KEY) headers['Authorization'] = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let data: Record<string, unknown> | null = null;
    try {
      if (raw) data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (!res.ok) return { sent: false, error: raw || `HTTP ${res.status}` };
    }
    const errMsg = data && typeof data.error === 'string' ? data.error : data && typeof (data as { error?: { message?: string } }).error?.message === 'string' ? (data as { error: { message: string } }).error.message : null;
    if (data && data.ok === false && typeof data.error === 'string') {
      console.error('Edge Function', name, 'error:', data.error);
      return { sent: false, error: data.error };
    }
    if (errMsg) {
      console.error('Edge Function', name, 'error:', errMsg);
      return { sent: false, error: errMsg };
    }
    if (!res.ok) {
      const msg =
        (data && typeof data.error === 'string' ? data.error : null) ||
        (data && typeof (data as { message?: string }).message === 'string' ? (data as { message: string }).message : null) ||
        raw ||
        `HTTP ${res.status}`;
      return { sent: false, error: msg };
    }
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Edge Function', name, 'invoke error:', msg);
    return { sent: false, error: msg };
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<{ sent: boolean; error?: string }> {
  const subject = 'Restablecer contraseña';
  const html = `
    <p>Hola,</p>
    <p>Has solicitado restablecer tu contraseña. Haz clic en el enlace para elegir una nueva (válido 1 hora):</p>
    <p><a href="${escapeHtml(resetUrl)}" style="color: #E31E24; font-weight: bold;">Restablecer contraseña</a></p>
    <p>Si no pediste esto, ignora el correo.</p>
    <p>Saludos.</p>
  `;
  return invokeEdgeFunction('send-email', { to, subject, html });
}

export async function sendInviteEmail(to: string, inviteUrl: string, clubName: string): Promise<{ sent: boolean; error?: string }> {
  return invokeEdgeFunction('send-invitation-email', { to, inviteUrl, clubName });
}
