import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';

const router = Router();
router.use(attachAuthContext);
router.use(requireClubOwnerOrAdmin);

const SELECT_LIST =
  'id, created_at, owner_id, fiscal_tax_id, fiscal_legal_name, name, description, address, city, postal_code, lat, lng, base_currency';
const SELECT_ONE =
  'id, created_at, updated_at, owner_id, fiscal_tax_id, fiscal_legal_name, name, description, address, city, postal_code, lat, lng, base_currency, weekly_schedule, schedule_exceptions';

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

router.get('/', async (req: Request, res: Response) => {
  const owner_id = req.query.owner_id as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('clubs')
      .select(SELECT_LIST)
      .order('created_at', { ascending: false })
      .limit(50);
    if (req.authContext?.adminId) {
      if (owner_id) q = q.eq('owner_id', owner_id);
    } else {
      q = q.in('id', req.authContext?.allowedClubIds ?? []);
    }
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, clubs: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('clubs')
      .select(SELECT_ONE)
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Club not found' });
    if (!canAccessClub(req, id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    return res.json({ ok: true, club: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const {
    owner_id,
    fiscal_tax_id,
    fiscal_legal_name,
    name,
    description,
    address,
    city,
    postal_code,
    lat,
    lng,
    base_currency,
    weekly_schedule,
    schedule_exceptions,
  } = req.body ?? {};
  if (!owner_id || !fiscal_tax_id || !fiscal_legal_name || !name || !address || !city || !postal_code) {
    return res.status(400).json({
      ok: false,
      error: 'owner_id, fiscal_tax_id, fiscal_legal_name, name, address, city, postal_code son obligatorios',
    });
  }
  if (!req.authContext?.adminId && req.authContext?.clubOwnerId !== owner_id) {
    return res.status(403).json({ ok: false, error: 'Solo puedes crear clubs con tu owner_id' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('clubs')
      .insert([
        {
          owner_id,
          fiscal_tax_id,
          fiscal_legal_name,
          name,
          description: description ?? null,
          address,
          city,
          postal_code,
          lat: lat != null ? Number(lat) : null,
          lng: lng != null ? Number(lng) : null,
          base_currency: base_currency ?? 'EUR',
          weekly_schedule: weekly_schedule ?? {},
          schedule_exceptions: schedule_exceptions ?? [],
        },
      ])
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, club: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!canAccessClub(req, id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  const body = req.body ?? {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowed = [
    'fiscal_tax_id', 'fiscal_legal_name', 'name', 'description',
    'address', 'city', 'postal_code', 'lat', 'lng', 'base_currency',
    'weekly_schedule', 'schedule_exceptions',
  ];
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (Object.keys(update).length === 1) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('clubs')
      .update(update)
      .eq('id', id)
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Club not found' });
    return res.json({ ok: true, club: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!canAccessClub(req, id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.from('clubs').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
