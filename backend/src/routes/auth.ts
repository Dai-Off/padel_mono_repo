import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { hashInviteToken } from '../lib/inviteToken';
import { sendPasswordResetEmail, sendRegistrationConfirmationEmail, syncPlayerVector } from '../lib/mailer';
import { getFrontendUrl, getPasswordResetRedirectUrl } from '../lib/env';
import { applyRedirectToActionLink } from '../lib/recoveryMobileBridge';
import { ensureDefaultPricingRuleForCourt } from '../lib/pricingRulesDefaults';
import { assignActiveMatchmakingSeasonIfNull } from '../services/matchmakingSeasonService';
import { assertUsernameAvailable, normalizeUsername } from '../lib/playerUsername';

const router = Router();

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, name, username, source, is_mobile } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: 'email y password son obligatorios',
    });
  }

  const usernameNorm = normalizeUsername(username);
  if (!usernameNorm.ok) {
    return res.status(400).json({ ok: false, error: usernameNorm.error });
  }

  const emailStr = String(email).trim().toLowerCase();
  const passwordStr = String(password);

  if (passwordStr.length < 6) {
    return res.status(400).json({
      ok: false,
      error: 'La contraseña debe tener al menos 6 caracteres',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const avail = await assertUsernameAvailable(supabase, usernameNorm.value);
    if (!avail.ok) {
      return res.status(avail.status).json({ ok: false, error: avail.error });
    }
    const baseUrl = getFrontendUrl();
    const redirectTo = `${baseUrl}/email-confirmed`;

    // Usamos admin.createUser para evitar que Supabase envíe su correo automático por defecto.
    // Esto nos permite enviar exclusivamente nuestro correo personalizado con Resend.
    const { data, error } = await supabase.auth.admin.createUser({
      email: emailStr,
      password: passwordStr,
      email_confirm: false,
      user_metadata: name ? { full_name: String(name).trim() } : undefined,
    });

    if (!error && data.user && !data.user.email_confirmed_at) {
      // Envío manual de correo con diseño WeMatch vía Resend
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'signup',
        email: emailStr,
        password: passwordStr,
        options: { redirectTo }
      });
      
      const confirmationUrl = linkData?.properties?.action_link || (linkData as any)?.action_link;
      if (confirmationUrl) {
        const { sent, error: mailError } = await sendRegistrationConfirmationEmail(
          emailStr,
          name ? String(name).trim() : 'Jugador',
          confirmationUrl
        );
        if (!sent) {
          console.error(`[AuthRegistration] Error enviando email de confirmación a ${emailStr}:`, mailError);
        } else {
          console.log(`[AuthRegistration] Email de confirmación enviado exitosamente a ${emailStr}`);
        }
      }
    }

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists')) {
        return res.status(409).json({ ok: false, error: 'El email ya está registrado' });
      }
      if (msg.includes('rate limit')) {
        return res.status(429).json({
          ok: false,
          error: 'Has solicitado demasiados correos en poco tiempo. Espera unos minutos e inténtalo de nuevo.',
          error_code: 'EMAIL_RATE_LIMIT',
        });
      }
      return res.status(400).json({ ok: false, error: error.message });
    }

    // Con admin.createUser no obtenemos sesión, y si el usuario ya existiera,
    // el error se habría capturado arriba.

    const fullName = (name ? String(name).trim() : '') || '';
    const nameParts = fullName ? fullName.split(/\s+/) : [];
    const firstName = nameParts[0] || 'Usuario';
    const lastName = nameParts.slice(1).join(' ') || '';
    const authUserId = data.user?.id ?? null;

    let playerIdForVector: string | null = null;

    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id, auth_user_id')
      .eq('email', emailStr)
      .neq('status', 'deleted')
      .maybeSingle();

    if (existingPlayer) {
      if (existingPlayer.auth_user_id) {
        return res.status(409).json({ ok: false, error: 'El email ya está registrado' });
      }
      const { error: updateErr } = await supabase
        .from('players')
        .update({
          auth_user_id: authUserId,
          email: emailStr,
          username: usernameNorm.value,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPlayer.id);
      if (updateErr) console.error('Error vinculando player en registro:', updateErr.message);
      else {
        await assignActiveMatchmakingSeasonIfNull(supabase, existingPlayer.id);
        playerIdForVector = existingPlayer.id;
      }
    } else {
      const { data: createdPlayer, error: playerError } = await supabase
        .from('players')
        .insert([
          {
            first_name: firstName,
            last_name: lastName,
            email: emailStr,
            username: usernameNorm.value,
            status: 'active',
            auth_user_id: authUserId,
          },
        ])
        .select('id')
        .maybeSingle();
      if (playerError && playerError.code !== '23505') {
        console.error('Error creando player en registro:', playerError.message);
      } else if (createdPlayer?.id) {
        await assignActiveMatchmakingSeasonIfNull(supabase, createdPlayer.id as string);
        playerIdForVector = createdPlayer.id as string;
      }
    }

    if (playerIdForVector) {
      const syncRes = await syncPlayerVector(playerIdForVector);
      if (!syncRes.sent) {
        console.error('[auth/register] sync-player-vector failed:', syncRes.error ?? 'unknown');
      }
    }

    return res.status(201).json({
      ok: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        user_metadata: data.user?.user_metadata,
      },
      session: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

async function resolveLoginEmail(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  identifier: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string; status: number }> {
  const raw = identifier.trim();
  if (!raw) {
    return { ok: false, error: 'email o usuario y password son obligatorios', status: 400 };
  }
  if (raw.includes('@')) {
    return { ok: true, email: raw.toLowerCase() };
  }
  const un = normalizeUsername(raw);
  if (!un.ok) {
    return { ok: false, error: 'Credenciales incorrectas', status: 401 };
  }
  const { data: player, error } = await supabase
    .from('players')
    .select('email')
    .eq('username', un.value)
    .neq('status', 'deleted')
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  const playerEmail = (player as { email?: string | null } | null)?.email;
  if (!playerEmail) {
    return { ok: false, error: 'Credenciales incorrectas', status: 401 };
  }
  return { ok: true, email: String(playerEmail).trim().toLowerCase() };
}

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password, identifier } = req.body ?? {};
  const loginId = identifier ?? email;

  if (!loginId || !password) {
    return res.status(400).json({
      ok: false,
      error: 'email o usuario y password son obligatorios',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const resolved = await resolveLoginEmail(supabase, String(loginId));
    if (!resolved.ok) {
      return res.status(resolved.status).json({ ok: false, error: resolved.error });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolved.email,
      password: String(password),
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('invalid login') || msg.includes('invalid_credentials')) {
        return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
      }
      if (msg.includes('email not confirmed')) {
        return res.status(403).json({
          ok: false,
          error: 'Confirma tu email antes de iniciar sesión. Revisa tu bandeja de entrada y la carpeta de spam.',
          error_code: 'EMAIL_NOT_CONFIRMED',
        });
      }
      return res.status(400).json({ ok: false, error: error.message });
    }

    if (!data.session) {
      return res.status(401).json({ ok: false, error: 'No se pudo iniciar sesión' });
    }

    // Fallback: si el usuario no tiene fila en players (registro fuera del flujo normal), crearla.
    const authUser = data.user!;
    const emailStr2 = String(authUser.email ?? '').trim().toLowerCase();
    if (emailStr2) {
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('id')
        .or(`auth_user_id.eq.${authUser.id},email.eq.${emailStr2}`)
        .neq('status', 'deleted')
        .maybeSingle();

      if (!existingPlayer) {
        const fullName = String(authUser.user_metadata?.full_name ?? '').trim();
        const nameParts = fullName ? fullName.split(/\s+/) : [];
        const { data: created } = await supabase
          .from('players')
          .insert([{
            first_name: nameParts[0] || 'Usuario',
            last_name: nameParts.slice(1).join(' ') || '',
            email: emailStr2,
            status: 'active',
            auth_user_id: authUser.id,
          }])
          .select('id')
          .maybeSingle();
        if (created?.id) {
          await assignActiveMatchmakingSeasonIfNull(supabase, created.id as string);
          syncPlayerVector(created.id as string).catch((e) =>
            console.error('[login] sync-player-vector failed:', e),
          );
          console.log('[login] Player row created for auth user without player:', authUser.id);
        }
      }
    }

    return res.json({
      ok: true,
      user: {
        id: authUser.id,
        email: authUser.email,
        user_metadata: authUser.user_metadata,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

// POST /auth/refresh — renueva access_token con refresh_token (app móvil sin SDK de Supabase en cliente).
router.post('/refresh', async (req: Request, res: Response) => {
  const refresh_token = req.body?.refresh_token;
  if (!refresh_token || typeof refresh_token !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'refresh_token es obligatorio',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error || !data.session || !data.user) {
      return res.status(401).json({
        ok: false,
        error: 'Sesión inválida o expirada. Inicia sesión de nuevo.',
      });
    }

    return res.json({
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        user_metadata: data.user.user_metadata,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

// POST /auth/forgot-password — envía enlace para restablecer contraseña por email
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email, client } = req.body ?? {};
  const emailStr = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!emailStr) {
    return res.status(400).json({ ok: false, error: 'Email es obligatorio' });
  }

  const clientNorm = typeof client === 'string' ? client.trim().toLowerCase() : '';

  try {
    const supabase = getSupabaseServiceRoleClient();
    const redirectTo = getPasswordResetRedirectUrl();
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: emailStr,
      options: { redirectTo },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('user not found') || msg.includes('not been registered') || msg.includes('email not found')) {
        return res.json({
          ok: true,
          message: 'Si el correo existe, recibirás un enlace para restablecer la contraseña',
        });
      }
      if (msg.includes('rate limit')) {
        return res.status(429).json({
          ok: false,
          error: 'Has solicitado demasiados correos en poco tiempo. Espera unos minutos e inténtalo de nuevo.',
          error_code: 'EMAIL_RATE_LIMIT',
        });
      }
      return res.status(400).json({ ok: false, error: error.message });
    }

    const actionLinkRaw =
      (data as { properties?: { action_link?: string }; action_link?: string })?.properties?.action_link ??
      (data as { action_link?: string })?.action_link;
    if (!actionLinkRaw) {
      return res.status(500).json({ ok: false, error: 'No se pudo generar el enlace' });
    }

    const actionLink = applyRedirectToActionLink(actionLinkRaw, redirectTo);
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[auth/forgot-password] client=${clientNorm || 'web'} redirectTo=${redirectTo}`,
      );
    }

    const { sent, error: mailError } = await sendPasswordResetEmail(emailStr, actionLink);
    if (!sent && mailError) {
      return res.status(500).json({ ok: false, error: mailError });
    }

    return res.json({ ok: true, message: 'Si el correo existe, recibirás un enlace para restablecer la contraseña' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

// POST /auth/recovery/apply-password — establece nueva contraseña con tokens del enlace de recovery (app móvil sin SDK Supabase).
router.post('/recovery/apply-password', async (req: Request, res: Response) => {
  const { access_token, refresh_token, password, token_hash } = req.body ?? {};
  const accessStr = typeof access_token === 'string' ? access_token.trim() : '';
  const refreshStr = typeof refresh_token === 'string' ? refresh_token.trim() : '';
  const tokenHashStr = typeof token_hash === 'string' ? token_hash.trim() : '';
  const passwordStr = typeof password === 'string' ? password : '';

  if (!accessStr && !tokenHashStr) {
    return res.status(400).json({
      ok: false,
      error: 'Se requiere access_token y refresh_token, o bien token_hash del enlace de recuperación',
    });
  }
  if (passwordStr.length < 6) {
    return res.status(400).json({
      ok: false,
      error: 'La contraseña debe tener al menos 6 caracteres',
    });
  }

  const url = (process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) {
    return res.status(500).json({ ok: false, error: 'Configuración de auth incompleta en el servidor' });
  }

  try {
    const client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (tokenHashStr && !accessStr) {
      const { data: otpData, error: otpError } = await client.auth.verifyOtp({
        token_hash: tokenHashStr,
        type: 'recovery',
      });
      if (otpError || !otpData.session) {
        return res.status(401).json({
          ok: false,
          error: 'Enlace inválido o expirado. Solicita un nuevo correo de recuperación.',
        });
      }
    } else {
      const { data: sessionData, error: sessionError } = await client.auth.setSession({
        access_token: accessStr,
        refresh_token: refreshStr,
      });

      if (sessionError || !sessionData.session) {
        return res.status(401).json({
          ok: false,
          error: 'Enlace inválido o expirado. Solicita un nuevo correo de recuperación.',
        });
      }
    }

    const { error: updateError } = await client.auth.updateUser({ password: passwordStr });
    if (updateError) {
      return res.status(400).json({ ok: false, error: updateError.message });
    }

    return res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

// GET /auth/me — usuario actual y roles (player_id, club_owner_id, clubs). Requiere Authorization: Bearer <access_token>.
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization ?? req.headers['Authorization'];
  const raw = typeof authHeader === 'string' ? authHeader : '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim() || null;
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'Falta el header Authorization con valor "Bearer <access_token>" (el token lo devuelve el login en session.access_token)',
    });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o token expirado. Haz login de nuevo.', error_detail: error?.message });
    }
    const roles: { player_id?: string; player_username?: string | null; club_owner_id?: string; admin_id?: string } = {};
    const { data: player } = await supabase
      .from('players')
      .select('id, username')
      .eq('auth_user_id', user.id)
      .neq('status', 'deleted')
      .maybeSingle();
    if (player) {
      roles.player_id = player.id;
      roles.player_username = (player as { username?: string | null }).username ?? null;
    }
    const { data: owner } = await supabase.from('club_owners').select('id').eq('auth_user_id', user.id).maybeSingle();
    if (owner) roles.club_owner_id = owner.id;
    const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).maybeSingle();
    if (admin) roles.admin_id = admin.id;
    const clubMap = new Map<string, Record<string, unknown>>();
    if (owner) {
      const { data: clubsData } = await supabase
        .from('clubs')
        .select('id, name, city, logo_url')
        .eq('owner_id', owner.id);
      for (const c of clubsData ?? []) {
        const row = c as Record<string, unknown>;
        if (row.id) clubMap.set(String(row.id), row);
      }
    }

    const portal_memberships: {
      club_id: string;
      club_portal_role_id: string;
      role_name: string;
      role_slug: string;
      permissions: string[];
    }[] = [];

    const { data: portalMemberRows, error: pmErr } = await supabase
      .from('club_portal_members')
      .select('club_id, club_portal_role_id')
      .eq('auth_user_id', user.id);
    if (pmErr && !pmErr.message.includes('does not exist')) {
      console.error('[auth/me] club_portal_members:', pmErr.message);
    }
    const portalMembersList =
      pmErr?.message?.includes('does not exist') ? [] : ((portalMemberRows ?? []) as { club_id: string; club_portal_role_id: string }[]);
    if (portalMembersList.length > 0) {
      const members = portalMembersList;
      const roleIds = [...new Set(members.map((m) => m.club_portal_role_id))];
      const [{ data: roleRows }, { data: permRows }] = await Promise.all([
        supabase.from('club_portal_roles').select('id, name, slug').in('id', roleIds),
        supabase.from('club_portal_role_permissions').select('role_id, permission_key').in('role_id', roleIds),
      ]);
      const roleById = new Map(
        ((roleRows ?? []) as { id: string; name: string; slug: string }[]).map((r) => [r.id, r])
      );
      const permsByRole = new Map<string, string[]>();
      for (const p of (permRows ?? []) as { role_id: string; permission_key: string }[]) {
        const list = permsByRole.get(p.role_id) ?? [];
        list.push(p.permission_key);
        permsByRole.set(p.role_id, list);
      }
      for (const m of members) {
        const role = roleById.get(m.club_portal_role_id);
        portal_memberships.push({
          club_id: m.club_id,
          club_portal_role_id: m.club_portal_role_id,
          role_name: role?.name ?? 'Rol',
          role_slug: role?.slug ?? '',
          permissions: permsByRole.get(m.club_portal_role_id) ?? [],
        });
      }
      const portalClubIds = [...new Set(members.map((m) => m.club_id))];
      const missing = portalClubIds.filter((id) => !clubMap.has(id));
      if (missing.length) {
        const { data: extraClubs } = await supabase
          .from('clubs')
          .select('id, name, city, logo_url')
          .in('id', missing);
        for (const c of extraClubs ?? []) {
          const row = c as Record<string, unknown>;
          if (row.id) clubMap.set(String(row.id), row);
        }
      }
    }

    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, user_metadata: user.user_metadata },
      roles,
      clubs: [...clubMap.values()],
      portal_memberships,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /auth/accept-club-portal-invite — vincular cuenta autenticada a club (email debe coincidir con la invitación).
router.post('/accept-club-portal-invite', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization ?? req.headers['Authorization'];
  const raw = typeof authHeader === 'string' ? authHeader : '';
  const tokenAuth = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim() || null;
  const { token } = req.body ?? {};
  const inviteToken = String(token ?? '').trim();
  if (!tokenAuth) {
    return res.status(401).json({ ok: false, error: 'Inicia sesión y envía Authorization: Bearer <access_token>.' });
  }
  if (!inviteToken) return res.status(400).json({ ok: false, error: 'token es obligatorio' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error: uErr } = await supabase.auth.getUser(tokenAuth);
    if (uErr || !user?.id || !user.email) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida. Vuelve a iniciar sesión.' });
    }
    const emailUser = String(user.email).trim().toLowerCase();
    const tokenHash = hashInviteToken(inviteToken);
    const { data: inv, error: invErr } = await supabase
      .from('club_portal_invites')
      .select('id, club_id, email, club_portal_role_id, expires_at, accepted_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (invErr?.message?.includes('does not exist')) {
      return res.status(503).json({ ok: false, error: 'Migración de portal no aplicada en la base de datos.' });
    }
    if (invErr) return res.status(500).json({ ok: false, error: invErr.message });
    if (!inv) return res.status(400).json({ ok: false, error: 'Enlace inválido' });
    const row = inv as {
      id: string;
      club_id: string;
      email: string;
      club_portal_role_id: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    };
    if (row.revoked_at) return res.status(400).json({ ok: false, error: 'Invitación revocada' });
    if (row.accepted_at) return res.status(400).json({ ok: false, error: 'Invitación ya utilizada' });
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ ok: false, error: 'El enlace ha expirado' });
    if (String(row.email).trim().toLowerCase() !== emailUser) {
      return res.status(403).json({
        ok: false,
        error: 'Debes iniciar sesión con el mismo email al que se envió la invitación.',
      });
    }
    const { data: clubRow } = await supabase.from('clubs').select('id, owner_id').eq('id', row.club_id).maybeSingle();
    if (!clubRow) return res.status(400).json({ ok: false, error: 'Club no encontrado' });
    const ownerId = (clubRow as { owner_id?: string }).owner_id;
    let ownerAuthId: string | null = null;
    if (ownerId) {
      const { data: co } = await supabase.from('club_owners').select('auth_user_id').eq('id', ownerId).maybeSingle();
      ownerAuthId = (co as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;
    }
    if (ownerAuthId && ownerAuthId === user.id) {
      return res.status(400).json({ ok: false, error: 'Como dueño del club ya tienes acceso completo; no necesitas aceptar esta invitación.' });
    }
    const { error: upsertErr } = await supabase.from('club_portal_members').upsert(
      {
        club_id: row.club_id,
        auth_user_id: user.id,
        club_portal_role_id: row.club_portal_role_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'club_id,auth_user_id' }
    );
    if (upsertErr) return res.status(500).json({ ok: false, error: upsertErr.message });
    await supabase.from('club_portal_invites').update({ accepted_at: new Date().toISOString() }).eq('id', row.id);
    return res.json({ ok: true, club_id: row.club_id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /auth/register-from-club-portal-invite — crea cuenta (email invitado), inicia sesión y acepta invitación.
router.post('/register-from-club-portal-invite', async (req: Request, res: Response) => {
  const { token, password, name } = req.body ?? {};
  const inviteToken = String(token ?? '').trim();
  const passwordStr = String(password ?? '');
  const displayName = String(name ?? '').trim();
  if (!inviteToken || !passwordStr) {
    return res.status(400).json({ ok: false, error: 'token y password son obligatorios' });
  }
  if (passwordStr.length < 6) {
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const tokenHash = hashInviteToken(inviteToken);
    const { data: inv, error: invErr } = await supabase
      .from('club_portal_invites')
      .select('id, club_id, email, club_portal_role_id, expires_at, accepted_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (invErr?.message?.includes('does not exist')) {
      return res.status(503).json({ ok: false, error: 'Migración de portal no aplicada en la base de datos.' });
    }
    if (invErr) return res.status(500).json({ ok: false, error: invErr.message });
    if (!inv) return res.status(400).json({ ok: false, error: 'Enlace inválido' });
    const row = inv as {
      id: string;
      club_id: string;
      email: string;
      club_portal_role_id: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    };
    if (row.revoked_at) return res.status(400).json({ ok: false, error: 'Invitación revocada' });
    if (row.accepted_at) return res.status(400).json({ ok: false, error: 'Invitación ya utilizada' });
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ ok: false, error: 'El enlace ha expirado' });

    const emailStr = String(row.email).trim().toLowerCase();
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: emailStr,
      password: passwordStr,
      email_confirm: true,
      user_metadata: displayName ? { full_name: displayName } : undefined,
    });
    if (createErr) {
      const msg = createErr.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists')) {
        return res.status(409).json({
          ok: false,
          error: 'Este email ya tiene cuenta. Inicia sesión y acepta la invitación.',
        });
      }
      return res.status(400).json({ ok: false, error: createErr.message });
    }
    const authUserId = created.user?.id;
    if (!authUserId) return res.status(500).json({ ok: false, error: 'No se pudo crear el usuario.' });

    const { error: upsertErr } = await supabase.from('club_portal_members').upsert(
      {
        club_id: row.club_id,
        auth_user_id: authUserId,
        club_portal_role_id: row.club_portal_role_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'club_id,auth_user_id' }
    );
    if (upsertErr) return res.status(500).json({ ok: false, error: upsertErr.message });
    await supabase.from('club_portal_invites').update({ accepted_at: new Date().toISOString() }).eq('id', row.id);

    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
      email: emailStr,
      password: passwordStr,
    });
    if (loginErr || !loginData.session || !loginData.user) {
      return res.status(201).json({
        ok: true,
        user: created.user
          ? { id: created.user.id, email: created.user.email, user_metadata: created.user.user_metadata }
          : null,
        session: null,
        club_id: row.club_id,
      });
    }
    return res.status(201).json({
      ok: true,
      user: {
        id: loginData.user.id,
        email: loginData.user.email,
        user_metadata: loginData.user.user_metadata,
      },
      session: {
        access_token: loginData.session.access_token,
        refresh_token: loginData.session.refresh_token,
        expires_at: loginData.session.expires_at,
      },
      club_id: row.club_id,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /auth/register-club-owner — completar registro desde invite (crea Auth user, club_owner, club, courts).
router.post('/register-club-owner', async (req: Request, res: Response) => {
  const { application_id, token, password } = req.body ?? {};
  if (!application_id || !token || !password) {
    return res.status(400).json({ ok: false, error: 'application_id, token y password son obligatorios' });
  }
  const passwordStr = String(password);
  if (passwordStr.length < 6) return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const tokenHash = hashInviteToken(String(token).trim());
    const { data: invite, error: inviteErr } = await supabase
      .from('club_application_invites')
      .select('id, application_id, used_at, expires_at')
      .eq('application_id', application_id)
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (inviteErr || !invite) return res.status(400).json({ ok: false, error: 'Enlace inválido' });
    if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ ok: false, error: 'El enlace ha expirado' });

    const { data: app, error: appErr } = await supabase.from('club_applications').select('*').eq('id', application_id).eq('status', 'approved').maybeSingle();
    if (appErr || !app) return res.status(400).json({ ok: false, error: 'Solicitud no válida' });
    if (app.club_owner_id || invite.used_at) {
      return res.status(200).json({
        ok: true,
        already_registered: true,
        message: 'Ya completaste el registro. Inicia sesión con tu email y contraseña.',
      });
    }

    const emailStr = String(app.email).trim().toLowerCase();
    const redirectTo = `${getFrontendUrl()}/login`;
    const { data: authData, error: signUpErr } = await supabase.auth.signUp({
      email: emailStr,
      password: passwordStr,
      options: {
        data: { full_name: `${app.responsible_first_name} ${app.responsible_last_name}`.trim() },
        emailRedirectTo: redirectTo,
      },
    });
    if (signUpErr) {
      const msg = signUpErr.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists')) {
        return res.status(409).json({ ok: false, error: 'Este email ya tiene una cuenta. Usa Iniciar sesión.' });
      }
      if (msg.includes('rate limit')) {
        return res.status(429).json({
          ok: false,
          error: 'Has solicitado demasiados correos en poco tiempo. Espera unos minutos e inténtalo de nuevo.',
          error_code: 'EMAIL_RATE_LIMIT',
        });
      }
      return res.status(400).json({ ok: false, error: signUpErr.message });
    }
    const authUserId = authData.user?.id;
    if (!authUserId) return res.status(500).json({ ok: false, error: 'Error al crear usuario' });

    const ownerName = `${app.responsible_first_name} ${app.responsible_last_name}`.trim();
    const { data: newOwner, error: ownerErr } = await supabase
      .from('club_owners')
      .insert({
        name: ownerName,
        email: emailStr,
        phone: app.phone ?? null,
        stripe_connect_account_id: null,
        auth_user_id: authUserId,
      })
      .select('id')
      .single();
    if (ownerErr) return res.status(500).json({ ok: false, error: ownerErr.message });
    const ownerId = newOwner.id;

    const fiscalName = app.official_name?.trim() || app.club_name?.trim() || ownerName;
    const fiscalTaxId = app.tax_id?.trim() || 'PENDING';
    const address = app.full_address?.trim() || `${app.city}, ${app.country}`;
    const postalCode = (app.full_address && /\d{5}/.test(app.full_address)) ? app.full_address.match(/\d{5}/)?.[0] : '00000';
    const { data: newClub, error: clubErr } = await supabase
      .from('clubs')
      .insert({
        owner_id: ownerId,
        fiscal_tax_id: fiscalTaxId,
        fiscal_legal_name: fiscalName,
        name: app.club_name?.trim(),
        description: app.description?.trim() ?? null,
        address,
        city: app.city?.trim(),
        postal_code: postalCode,
        logo_url: app.logo_url?.trim() || null,
      })
      .select('id')
      .single();
    if (clubErr) return res.status(500).json({ ok: false, error: clubErr.message });
    const clubId = newClub.id;

    const courtsPayload = Array.isArray(app.courts) ? app.courts : [];
    if (courtsPayload.length > 0) {
      const rows = courtsPayload.slice(0, 50).map((c: { name?: string; type?: string; covered?: boolean } | unknown) => {
        const co = (c && typeof c === 'object') ? c as Record<string, unknown> : {};
        return {
          club_id: clubId,
          name: (co.name && String(co.name).trim()) || 'Pista',
          indoor: Boolean(co.covered),
          glass_type: co.type === 'panoramic' ? 'panoramic' : 'normal',
        };
      });
      const { data: insertedCourts, error: courtsErr } = await supabase
        .from('courts')
        .insert(rows)
        .select('id');
      if (courtsErr) return res.status(500).json({ ok: false, error: courtsErr.message });

      // Seed default pricing rules so availability returns time slots immediately.
      for (const c of insertedCourts ?? []) {
        const r = await ensureDefaultPricingRuleForCourt(supabase as any, (c as { id: string }).id);
        if (r.error) console.error('[register-club-owner] pricing rule seed failed:', r.error);
      }
    } else {
      const n = Math.max(1, parseInt(String(app.court_count), 10) || 1);
      for (let i = 0; i < n; i++) {
        const { data: insertedCourt, error: courtErr } = await supabase
          .from('courts')
          .insert({ club_id: clubId, name: `Pista ${i + 1}` })
          .select('id')
          .single();
        if (courtErr) return res.status(500).json({ ok: false, error: courtErr.message });
        const r = await ensureDefaultPricingRuleForCourt(supabase as any, insertedCourt.id);
        if (r.error) console.error('[register-club-owner] pricing rule seed failed:', r.error);
      }
    }

    await supabase.from('club_application_invites').update({ used_at: new Date().toISOString() }).eq('id', invite.id);
    await supabase.from('club_applications').update({ club_owner_id: ownerId, club_id: clubId }).eq('id', application_id);

    return res.status(201).json({
      ok: true,
      user: { id: authData.user?.id, email: authData.user?.email },
      roles: { club_owner_id: ownerId },
      club_id: clubId,
      email_confirmation_required: !authData.user?.email_confirmed_at,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
