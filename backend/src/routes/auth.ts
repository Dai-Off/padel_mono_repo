import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { hashInviteToken } from '../lib/inviteToken';

const router = Router();

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: 'email y password son obligatorios',
    });
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

    const { data, error } = await supabase.auth.signUp({
      email: emailStr,
      password: passwordStr,
      options: {
        data: name ? { full_name: String(name).trim() } : undefined,
      },
    });

    if (error) {
      const msg = error.message;
      if (msg.includes('already registered') || msg.includes('already exists')) {
        return res.status(409).json({ ok: false, error: 'El email ya está registrado' });
      }
      return res.status(400).json({ ok: false, error: msg });
    }

    if (!data.session && data.user?.identities?.length === 0) {
      return res.status(409).json({ ok: false, error: 'El email ya está registrado' });
    }

    // Crear registro en players vinculado al usuario de auth
    const fullName = (name ? String(name).trim() : '') || '';
    const nameParts = fullName ? fullName.split(/\s+/) : [];
    const firstName = nameParts[0] || 'Usuario';
    const lastName = nameParts.slice(1).join(' ') || '';

    const authUserId = data.user?.id ?? null;
    const { error: playerError } = await supabase
      .from('players')
      .insert([
        {
          first_name: firstName,
          last_name: lastName,
          email: emailStr,
          status: 'active',
          auth_user_id: authUserId,
        },
      ]);

    if (playerError) {
      // Si falla por email duplicado, el usuario ya existe - no bloqueamos el registro de auth
      if (playerError.code !== '23505') {
        console.error('Error creando player en registro:', playerError.message);
      }
    }

    return res.status(201).json({
      ok: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        user_metadata: data.user?.user_metadata,
      },
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: 'email y password son obligatorios',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: String(password),
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('invalid login') || msg.includes('invalid_credentials')) {
        return res.status(401).json({ ok: false, error: 'Email o contraseña incorrectos' });
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

    return res.json({
      ok: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        user_metadata: data.user?.user_metadata,
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
    const roles: { player_id?: string; club_owner_id?: string; admin_id?: string } = {};
    const { data: player } = await supabase.from('players').select('id').eq('auth_user_id', user.id).maybeSingle();
    if (player) roles.player_id = player.id;
    const { data: owner } = await supabase.from('club_owners').select('id').eq('auth_user_id', user.id).maybeSingle();
    if (owner) roles.club_owner_id = owner.id;
    const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).maybeSingle();
    if (admin) roles.admin_id = admin.id;
    let clubs: unknown[] = [];
    if (owner) {
      const { data: clubsData } = await supabase.from('clubs').select('id, name, city').eq('owner_id', owner.id);
      clubs = clubsData ?? [];
    }
    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, user_metadata: user.user_metadata },
      roles,
      clubs,
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
    if (invite.used_at) return res.status(400).json({ ok: false, error: 'Este enlace ya fue utilizado' });
    if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ ok: false, error: 'El enlace ha expirado' });

    const { data: app, error: appErr } = await supabase.from('club_applications').select('*').eq('id', application_id).eq('status', 'approved').maybeSingle();
    if (appErr || !app) return res.status(400).json({ ok: false, error: 'Solicitud no válida' });

    const emailStr = String(app.email).trim().toLowerCase();
    const { data: authData, error: signUpErr } = await supabase.auth.signUp({
      email: emailStr,
      password: passwordStr,
      options: { data: { full_name: `${app.responsible_first_name} ${app.responsible_last_name}`.trim() } },
    });
    if (signUpErr) {
      if (signUpErr.message.includes('already registered') || signUpErr.message.includes('already exists')) {
        return res.status(409).json({ ok: false, error: 'Este email ya tiene una cuenta. Usa Iniciar sesión.' });
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
      await supabase.from('courts').insert(rows);
    } else {
      const n = Math.max(1, parseInt(String(app.court_count), 10) || 1);
      for (let i = 0; i < n; i++) {
        await supabase.from('courts').insert({ club_id: clubId, name: `Pista ${i + 1}` });
      }
    }

    await supabase.from('club_application_invites').update({ used_at: new Date().toISOString() }).eq('id', invite.id);
    await supabase.from('club_applications').update({ club_owner_id: ownerId, club_id: clubId }).eq('id', application_id);

    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: emailStr, password: passwordStr });
    const session = signInErr ? null : signInData.session ? {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_at: signInData.session.expires_at,
    } : null;

    return res.status(201).json({
      ok: true,
      user: { id: authData.user?.id, email: authData.user?.email },
      roles: { club_owner_id: ownerId },
      club_id: clubId,
      session,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
