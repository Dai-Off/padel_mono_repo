import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { fetchAllowOnlineByType } from '../lib/reservationAllowOnline';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdminOrPortalStaff } from '../middleware/requireClubOwnerOrAdminOrPortalStaff';
import { canAccessClub } from '../lib/clubAccess';

const router = Router();
router.use(attachAuthContext);
router.use(requireClubOwnerOrAdminOrPortalStaff);

const SYSTEM_TYPES = [
  { reservation_type: 'standard', display_name: 'Pista privada', color: '#005bc5', sort_order: 10, default_online: true },
  { reservation_type: 'open_match', display_name: 'Partido abierto', color: '#7c3aed', sort_order: 20, default_online: true },
  { reservation_type: 'pozo', display_name: 'Americanas', color: '#ea580c', sort_order: 30, default_online: false },
  { reservation_type: 'fixed_recurring', display_name: 'Turno fijo', color: '#166534', sort_order: 40, default_online: false },
  { reservation_type: 'school_group', display_name: 'Escuela grupo', color: '#fdf2f8', sort_order: 50, default_online: false },
  { reservation_type: 'school_individual', display_name: 'Clase particular', color: '#fdf2f8', sort_order: 60, default_online: false },
  { reservation_type: 'flat_rate', display_name: 'Tarifa plana', color: '#be185d', sort_order: 70, default_online: false },
  { reservation_type: 'tournament', display_name: 'Torneo', color: '#b45309', sort_order: 80, default_online: false },
  { reservation_type: 'blocked', display_name: 'Bloqueo administrativo', color: '#4b5563', sort_order: 90, default_online: false },
];

async function getMergedPrices(supabase: any, clubId: string): Promise<Record<string, any>> {
  const { data: rows, error } = await supabase
    .from('reservation_type_prices')
    .select('reservation_type, price_per_hour_cents, currency, color, allow_online, display_name, is_system, sort_order')
    .eq('club_id', clubId);

  if (error) throw error;

  const byType: Record<string, any> = {};

  // 1. Seed system types
  for (const s of SYSTEM_TYPES) {
    byType[s.reservation_type] = {
      price_per_hour_cents: 0,
      currency: 'EUR',
      color: s.color,
      allow_online: s.default_online,
      display_name: s.display_name,
      is_system: true,
      sort_order: s.sort_order,
    };
  }

  // 2. Merge database rows
  for (const r of rows ?? []) {
    const rt = r.reservation_type;
    const sys = SYSTEM_TYPES.find(s => s.reservation_type === rt);
    byType[rt] = {
      price_per_hour_cents: Number(r.price_per_hour_cents) || 0,
      currency: r.currency ?? 'EUR',
      color: r.color ?? (sys ? sys.color : '#6b7280'),
      allow_online: typeof r.allow_online === 'boolean' ? r.allow_online : (sys ? sys.default_online : false),
      display_name: r.display_name ?? (sys ? sys.display_name : rt),
      is_system: typeof r.is_system === 'boolean' ? r.is_system : (sys ? true : false),
      sort_order: Number(r.sort_order) || (sys ? sys.sort_order : 100),
    };
  }

  return byType;
}

router.get('/', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  if (!club_id?.trim()) {
    return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  }
  if (!canAccessClub(req, club_id.trim(), 'finanzas')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const prices = await getMergedPrices(supabase, club_id.trim());
    return res.json({ ok: true, prices });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/', async (req: Request, res: Response) => {
  const { club_id, prices, colors, allow_online } = req.body ?? {};
  if (!club_id?.trim()) {
    return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  }
  if (!canAccessClub(req, String(club_id).trim(), 'finanzas')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  if (!prices || typeof prices !== 'object') {
    return res.status(400).json({ ok: false, error: 'prices es obligatorio y debe ser un objeto' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const clubId = String(club_id).trim();
    const now = new Date().toISOString();

    // Fetch existing configured rows to make sure we don't drop metadata
    const { data: existingRows } = await supabase
      .from('reservation_type_prices')
      .select('reservation_type, is_system, display_name, sort_order')
      .eq('club_id', clubId);

    const typesToUpdate = new Set<string>();
    for (const r of existingRows ?? []) {
      typesToUpdate.add(r.reservation_type);
    }
    for (const s of SYSTEM_TYPES) {
      typesToUpdate.add(s.reservation_type);
    }

    for (const type of typesToUpdate) {
      // Only modify prices/colors/online check if they are explicitly passed
      const rawPrice = prices[type];
      const cents = rawPrice != null ? Math.max(0, Math.round(Number(rawPrice))) : undefined;

      const colorVal = colors?.[type];
      const colorHex = typeof colorVal === 'string' && /^#[0-9a-fA-F]{6}$/.test(colorVal) ? colorVal : undefined;

      const aoRaw = allow_online?.[type];
      const allowOnlineVal = typeof aoRaw === 'boolean' ? aoRaw : undefined;

      const sys = SYSTEM_TYPES.find(s => s.reservation_type === type);
      const existing = existingRows?.find(r => r.reservation_type === type);

      const isSystem = existing ? existing.is_system : (sys ? true : false);
      const displayName = existing ? existing.display_name : (sys ? sys.display_name : type);
      const sortOrder = existing ? existing.sort_order : (sys ? sys.sort_order : 100);

      const upsertBody: any = {
        club_id: clubId,
        reservation_type: type,
        currency: 'EUR',
        updated_at: now,
        is_system: isSystem,
        display_name: displayName,
        sort_order: sortOrder,
      };

      if (cents !== undefined) upsertBody.price_per_hour_cents = cents;
      if (colorHex !== undefined) upsertBody.color = colorHex;
      if (allowOnlineVal !== undefined) upsertBody.allow_online = allowOnlineVal;

      const { error: upsertErr } = await supabase
        .from('reservation_type_prices')
        .upsert(upsertBody, { onConflict: 'club_id,reservation_type' });

      if (upsertErr) return res.status(500).json({ ok: false, error: upsertErr.message });
    }

    const updatedPrices = await getMergedPrices(supabase, clubId);
    return res.json({ ok: true, prices: updatedPrices });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// Create custom reservation type
router.post('/custom', async (req: Request, res: Response) => {
  const { club_id, display_name, color, price_per_hour_cents } = req.body ?? {};
  if (!club_id?.trim()) {
    return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  }
  if (!canAccessClub(req, String(club_id).trim(), 'finanzas')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  if (!display_name?.trim()) {
    return res.status(400).json({ ok: false, error: 'display_name es obligatorio' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const clubId = String(club_id).trim();
    const name = String(display_name).trim();

    // 1. Generate unique clean slug starting with 'custom_'
    const rawSlug = 'custom_' + name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const slug = rawSlug.substring(0, 50);

    if (!slug || slug === 'custom') {
      return res.status(400).json({ ok: false, error: 'Nombre de tipo no válido' });
    }

    // 2. Validate custom types limit (< 20)
    const { data: existingRows, error: fetchErr } = await supabase
      .from('reservation_type_prices')
      .select('reservation_type, display_name, is_system')
      .eq('club_id', clubId);

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });

    const customTypes = (existingRows ?? []).filter(r => !r.is_system);
    if (customTypes.length >= 20) {
      return res.status(400).json({ ok: false, error: 'Has alcanzado el límite máximo de 20 tipos personalizados por club' });
    }

    // 3. Validate unique slug/display_name for this club
    const normalizedNewName = name.toLowerCase();
    const isDuplicate = (existingRows ?? []).some(
      r => r.reservation_type === slug || r.display_name?.toLowerCase() === normalizedNewName
    );

    if (isDuplicate) {
      return res.status(400).json({ ok: false, error: 'Ya existe un tipo de reserva con este nombre' });
    }

    // 4. Validate color
    const colorHex = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#6b7280';

    // 5. Insert
    const cents = price_per_hour_cents != null ? Math.max(0, Math.round(Number(price_per_hour_cents))) : 0;
    const now = new Date().toISOString();

    const { error: insertErr } = await supabase
      .from('reservation_type_prices')
      .insert({
        club_id: clubId,
        reservation_type: slug,
        display_name: name,
        price_per_hour_cents: cents,
        currency: 'EUR',
        color: colorHex,
        allow_online: false, // Per user input: do not allow online reservation by default
        is_system: false,
        sort_order: 100 + customTypes.length,
        updated_at: now,
      });

    if (insertErr) return res.status(500).json({ ok: false, error: insertErr.message });

    const updatedPrices = await getMergedPrices(supabase, clubId);
    return res.json({ ok: true, prices: updatedPrices });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// Delete custom reservation type
router.delete('/custom/:type', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  const { type } = req.params;

  if (!club_id?.trim()) {
    return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  }
  if (!canAccessClub(req, club_id.trim(), 'finanzas')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  if (!type?.trim()) {
    return res.status(400).json({ ok: false, error: 'Tipo es obligatorio' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const clubId = club_id.trim();

    // 1. Confirm type is NOT system
    const { data: row, error: fetchErr } = await supabase
      .from('reservation_type_prices')
      .select('is_system')
      .eq('club_id', clubId)
      .eq('reservation_type', type)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Tipo de reserva no encontrado' });
    }
    if (row.is_system) {
      return res.status(400).json({ ok: false, error: 'No se pueden eliminar tipos de reserva del sistema' });
    }

    // 2. Validate that no active bookings use this reservation type
    const { data: clubCourts, error: courtsErr } = await supabase
      .from('courts')
      .select('id')
      .eq('club_id', clubId);

    if (courtsErr) return res.status(500).json({ ok: false, error: courtsErr.message });
    const courtIds = (clubCourts ?? []).map((c: { id: string }) => c.id);

    let count = 0;
    if (courtIds.length > 0) {
      const { count: bookingCount, error: countErr } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('court_id', courtIds)
        .eq('reservation_type', type)
        .is('deleted_at', null);

      if (countErr) return res.status(500).json({ ok: false, error: countErr.message });
      count = bookingCount ?? 0;
    }

    if (count > 0) {
      return res.status(400).json({
        ok: false,
        error: `No se puede eliminar porque hay ${count} reserva(s) activa(s) usando este tipo. Por favor, reasigna o elimina esas reservas primero.`,
      });
    }

    // 3. Delete
    const { error: deleteErr } = await supabase
      .from('reservation_type_prices')
      .delete()
      .eq('club_id', clubId)
      .eq('reservation_type', type)
      .eq('is_system', false);

    if (deleteErr) return res.status(500).json({ ok: false, error: deleteErr.message });

    const updatedPrices = await getMergedPrices(supabase, clubId);
    return res.json({ ok: true, prices: updatedPrices });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;

