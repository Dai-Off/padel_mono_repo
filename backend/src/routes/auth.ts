import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

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

    const { error: playerError } = await supabase
      .from('players')
      .insert([
        {
          first_name: firstName,
          last_name: lastName,
          email: emailStr,
          status: 'active',
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

export default router;
