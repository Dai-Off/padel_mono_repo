import { getSupabaseServiceRoleClient } from './supabase';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function invokeEdgeFunction(name: string, body: Record<string, unknown>): Promise<{ sent: boolean; error?: string }> {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      console.error(`Edge Function ${name} error:`, error.message ?? error);
      return { sent: false, error: typeof error === 'string' ? error : (error as Error).message ?? 'Error al invocar Edge Function' };
    }
    const ok = data && typeof data === 'object' && (data as { ok?: boolean }).ok === true;
    const errMsg = data && typeof data === 'object' ? (data as { error?: string }).error : undefined;
    if (!ok && errMsg) {
      console.error(`Edge Function ${name} response error:`, errMsg);
      return { sent: false, error: errMsg };
    }
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`invokeEdgeFunction ${name} error:`, msg);
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
