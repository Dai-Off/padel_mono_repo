/** Fuerza redirect_to en el action_link (si no está en Redirect URLs de Supabase, cae al Site URL). */
export function applyRedirectToActionLink(actionLink: string, redirectTo: string): string {
  try {
    const u = new URL(actionLink);
    u.searchParams.set('redirect_to', redirectTo);
    return u.toString();
  } catch {
    return actionLink;
  }
}
