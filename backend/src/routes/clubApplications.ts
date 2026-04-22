import express, { Router, Request, Response } from 'express';
import multer from 'multer';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { generateInviteToken, hashInviteToken, getInviteExpiresAt } from '../lib/inviteToken';
import { requireAdmin } from '../middleware/requireAdmin';
import { sendInviteEmail, sendClubApplicationConfirmationEmail, sendClubApprovedEmail } from '../lib/mailer';
import { getFrontendUrl } from '../lib/env';

const router = Router();
const APPLICATIONS_SELECT = 'id, created_at, responsible_first_name, responsible_last_name, club_name, city, country, phone, email, court_count, sport, status, approved_at, rejected_at, rejection_reason, club_owner_id, club_id, invitation_sent_at, official_name, full_address, description, tax_id, fiscal_address, courts, open_time, close_time, slot_duration_min, pricing';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (JPEG, PNG, WebP, GIF)'));
  },
});

const BUCKET = 'club-images';

router.post('/upload', (req: Request, res: Response, next: express.NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir';
      const isLimit = err && typeof err === 'object' && 'code' in err && err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ ok: false, error: isLimit ? 'El archivo supera el límite de 5 MB' : msg });
    }
    next();
  });
}, async (req: Request, res: Response, next: express.NextFunction) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No se envió ningún archivo. Usa el campo "file" en form-data.' });
  }
  const buffer = req.file.buffer ?? (req.file as unknown as { buffer?: Buffer }).buffer;
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return res.status(500).json({ ok: false, error: 'No se pudo leer el archivo (buffer inválido).' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });
    if (error) {
      console.error('Supabase storage upload error:', error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }
    const expiresIn = 60 * 60 * 24 * 7; // 7 días (evita 400 de la URL pública)
    const { data: signedData, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
    if (signedError) {
      console.error('createSignedUrl error:', signedError.message);
      return res.status(500).json({ ok: false, error: signedError.message });
    }
    const url = (signedData as { signedUrl?: string; signedURL?: string })?.signedUrl ?? (signedData as { signedURL?: string })?.signedURL;
    if (!url) return res.status(500).json({ ok: false, error: 'No se pudo generar la URL de la imagen' });
    return res.status(200).json({ ok: true, url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Upload error:', msg);
    return res.status(500).json({ ok: false, error: msg });
  }
});

router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase.from('club_applications').select(APPLICATIONS_SELECT).order('created_at', { ascending: false }).limit(100);
    if (status && ['pending', 'contacted', 'approved', 'rejected'].includes(status)) {
      q = q.eq('status', status);
    }
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, applications: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/:id/validate-invite', async (req: Request, res: Response) => {
  const { id } = req.params;
  const token = (req.query.token as string)?.trim();
  if (!token) return res.status(400).json({ ok: false, error: 'Falta el token' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const tokenHash = hashInviteToken(token);
    const { data: invite, error: inviteError } = await supabase
      .from('club_application_invites')
      .select('id, application_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .eq('application_id', id)
      .maybeSingle();
    if (inviteError || !invite) return res.status(400).json({ ok: false, error: 'Enlace inválido' });
    if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ ok: false, error: 'El enlace ha expirado' });
    const { data: app, error: appError } = await supabase.from('club_applications').select('id, email, responsible_first_name, responsible_last_name, club_name, status, club_owner_id').eq('id', id).maybeSingle();
    if (appError || !app || app.status !== 'approved') return res.status(400).json({ ok: false, error: 'Solicitud no válida' });
    if (invite.used_at) {
      return res.json({
        ok: true,
        already_completed: true,
        application_id: app.id,
        email: app.email,
        responsible_name: [app.responsible_first_name, app.responsible_last_name].filter(Boolean).join(' '),
        club_name: app.club_name,
      });
    }
    return res.json({
      ok: true,
      application_id: app.id,
      email: app.email,
      responsible_name: [app.responsible_first_name, app.responsible_last_name].filter(Boolean).join(' '),
      club_name: app.club_name,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/:id', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase.from('club_applications').select(APPLICATIONS_SELECT).eq('id', id).maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    return res.json({ ok: true, application: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: app, error: fetchErr } = await supabase.from('club_applications').select('id, status, email, club_name, responsible_first_name').eq('id', id).maybeSingle();
    if (fetchErr || !app) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    if (app.status !== 'pending' && app.status !== 'contacted') return res.status(400).json({ ok: false, error: 'Solo se puede aprobar una solicitud en estado pending o contacted' });
    await supabase.from('club_application_invites').delete().eq('application_id', id);
    const { token, tokenHash } = generateInviteToken();
    const expiresAt = getInviteExpiresAt();
    const { error: inviteErr } = await supabase.from('club_application_invites').insert({
      application_id: id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });
    if (inviteErr) return res.status(500).json({ ok: false, error: inviteErr.message });
    const { error: updateErr } = await supabase
      .from('club_applications')
      .update({ status: 'approved', approved_at: new Date().toISOString(), invitation_sent_at: new Date().toISOString() })
      .eq('id', id);
    if (updateErr) return res.status(500).json({ ok: false, error: updateErr.message });
    const inviteUrl = `${getFrontendUrl()}/registro-club?application_id=${id}&token=${token}`;
    const clubName = (app as { club_name?: string }).club_name ?? 'Tu club';
    const managerName = (app as { responsible_first_name?: string }).responsible_first_name ?? 'Gestor';
    const emailResult = await sendClubApprovedEmail(app.email, managerName, clubName, inviteUrl);
    return res.json({
      ok: true,
      message: emailResult.sent
        ? 'Solicitud aprobada. Se ha enviado el enlace por email al responsable.'
        : 'Solicitud aprobada. Envía el enlace por email al responsable (no se pudo enviar el correo automático).',
      invite_url: inviteUrl,
      email_sent: emailResult.sent,
      email_error: emailResult.error,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /club-applications/:id/resend-invite — regenerar token y reenviar email (solo approved, sin registro completado).
 */
router.post('/:id/resend-invite', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: app, error: fetchErr } = await supabase
      .from('club_applications')
      .select('id, status, email, club_name, club_owner_id, responsible_first_name')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr || !app) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    if (app.status !== 'approved') {
      return res.status(400).json({ ok: false, error: 'Solo solicitudes aprobadas pueden regenerar la invitación' });
    }
    if (app.club_owner_id) {
      return res.status(400).json({
        ok: false,
        error: 'El club ya completó el registro. La invitación ya no aplica.',
      });
    }
    await supabase.from('club_application_invites').delete().eq('application_id', id);
    const { token, tokenHash } = generateInviteToken();
    const expiresAt = getInviteExpiresAt();
    const { error: inviteErr } = await supabase.from('club_application_invites').insert({
      application_id: id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });
    if (inviteErr) return res.status(500).json({ ok: false, error: inviteErr.message });
    await supabase
      .from('club_applications')
      .update({ invitation_sent_at: new Date().toISOString() })
      .eq('id', id);
    const inviteUrl = `${getFrontendUrl()}/registro-club?application_id=${id}&token=${token}`;
    const clubName = (app as { club_name?: string }).club_name ?? 'Tu club';
    const managerName = (app as { responsible_first_name?: string }).responsible_first_name ?? 'Gestor';
    const emailResult = await sendClubApprovedEmail((app as { email: string }).email, managerName, clubName, inviteUrl);
    return res.json({
      ok: true,
      message: emailResult.sent
        ? 'Invitación regenerada y enviada por email.'
        : 'Invitación regenerada. Reenvía el enlace manualmente si el correo automático falló.',
      invite_url: inviteUrl,
      email_sent: emailResult.sent,
      email_error: emailResult.error,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/:id/reject', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body ?? {};
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: app, error: fetchErr } = await supabase.from('club_applications').select('id, status').eq('id', id).maybeSingle();
    if (fetchErr || !app) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
    if (app.status !== 'pending' && app.status !== 'contacted') return res.status(400).json({ ok: false, error: 'Solo se puede rechazar una solicitud en estado pending o contacted' });
    const { error } = await supabase
      .from('club_applications')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: reason != null ? String(reason).trim() : null,
      })
      .eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, message: 'Solicitud rechazada' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
}

function validPhone(s: string): boolean {
  return /^[\d\s+()-]{8,20}$/.test((s || '').replace(/\s/g, ''));
}

router.post('/', async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const {
    responsible_first_name,
    responsible_last_name,
    club_name,
    city,
    country,
    phone,
    email,
    court_count,
    sport,
    sports,
    official_name,
    full_address,
    description,
    logo_url,
    photo_urls,
    courts,
    open_time,
    close_time,
    slot_duration_min,
    pricing,
    booking_window,
    cancellation_policy,
    tax_id,
    fiscal_address,
    stripe_connected,
    selected_plan,
  } = body;

  const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  if (!trim(responsible_first_name) || trim(responsible_first_name).length < 2) {
    return res.status(400).json({ ok: false, error: 'Nombre del responsable obligatorio (mín. 2 caracteres)' });
  }
  if (!trim(responsible_last_name) || trim(responsible_last_name).length < 2) {
    return res.status(400).json({ ok: false, error: 'Apellidos del responsable obligatorios (mín. 2 caracteres)' });
  }
  if (!trim(club_name) || trim(club_name).length < 2) {
    return res.status(400).json({ ok: false, error: 'Nombre del club obligatorio (mín. 2 caracteres)' });
  }
  if (!trim(city) || trim(city).length < 2) {
    return res.status(400).json({ ok: false, error: 'Ciudad obligatoria (mín. 2 caracteres)' });
  }
  if (!trim(country) || trim(country).length < 2) {
    return res.status(400).json({ ok: false, error: 'País obligatorio (mín. 2 caracteres)' });
  }
  if (!trim(phone)) {
    return res.status(400).json({ ok: false, error: 'Teléfono obligatorio' });
  }
  if (!validPhone(trim(phone))) {
    return res.status(400).json({ ok: false, error: 'Teléfono no válido' });
  }
  if (!trim(email)) {
    return res.status(400).json({ ok: false, error: 'Email obligatorio' });
  }
  if (!validEmail(trim(email))) {
    return res.status(400).json({ ok: false, error: 'Email no válido' });
  }
  const courtCount = Math.max(1, parseInt(String(court_count), 10) || 1);
  if (courtCount > 99) {
    return res.status(400).json({ ok: false, error: 'Número de pistas no válido' });
  }
  const sportStr = trim(sport) || 'padel';
  if (sportStr.length > 50) {
    return res.status(400).json({ ok: false, error: 'Deporte no válido' });
  }

  const row: Record<string, unknown> = {
    responsible_first_name: trim(responsible_first_name),
    responsible_last_name: trim(responsible_last_name),
    club_name: trim(club_name),
    city: trim(city),
    country: trim(country),
    phone: trim(phone),
    email: trim(email).toLowerCase(),
    court_count: courtCount,
    sport: sportStr,
  };

  if (official_name != null && trim(String(official_name))) row.official_name = trim(String(official_name));
  if (full_address != null && trim(String(full_address))) row.full_address = trim(String(full_address));
  if (description != null && trim(String(description))) row.description = trim(String(description));
  if (logo_url != null && trim(String(logo_url))) row.logo_url = trim(String(logo_url));
  if (Array.isArray(photo_urls)) row.photo_urls = photo_urls.filter((u: unknown) => typeof u === 'string' && u.trim());
  if (Array.isArray(courts)) row.courts = courts;
  if (open_time != null && /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(open_time).trim())) row.open_time = String(open_time).trim();
  if (close_time != null && /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(close_time).trim())) row.close_time = String(close_time).trim();
  const slotMin = slot_duration_min != null ? parseInt(String(slot_duration_min), 10) : null;
  if (slotMin === 60 || slotMin === 90 || slotMin === 120) row.slot_duration_min = slotMin;
  if (Array.isArray(pricing)) row.pricing = pricing;
  if (booking_window != null && trim(String(booking_window))) row.booking_window = trim(String(booking_window));
  if (cancellation_policy != null && trim(String(cancellation_policy))) row.cancellation_policy = trim(String(cancellation_policy));
  if (tax_id != null && trim(String(tax_id))) row.tax_id = trim(String(tax_id));
  if (fiscal_address != null && trim(String(fiscal_address))) row.fiscal_address = trim(String(fiscal_address));
  row.stripe_connected = Boolean(stripe_connected);
  const plan = selected_plan != null ? String(selected_plan).trim().toLowerCase() : null;
  if (plan && ['standard', 'professional', 'champion', 'master'].includes(plan)) row.selected_plan = plan;
  if (Array.isArray(sports)) row.sports = sports.filter((s: unknown) => typeof s === 'string' && s.trim());

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_applications')
      .insert(row)
      .select('id')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });

    // Enviar correo de confirmación al responsable del club
    await sendClubApplicationConfirmationEmail(trim(email).toLowerCase(), trim(club_name));

    return res.status(201).json({ ok: true, id: data?.id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
