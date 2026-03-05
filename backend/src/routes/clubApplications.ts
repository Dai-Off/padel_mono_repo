import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (JPEG, PNG, WebP, GIF)'));
  },
});

const BUCKET = 'Club Images';

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No se envió ningún archivo' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return res.status(200).json({ ok: true, url: publicUrl });
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
    return res.status(201).json({ ok: true, id: data?.id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
