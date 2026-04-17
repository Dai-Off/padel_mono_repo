import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';

const router = Router();
router.use(attachAuthContext);
router.use(requireClubOwnerOrAdmin);

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

function parsePrice(input: unknown): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

// ----------------- DEFAULTS (must precede /:id) -----------------

router.get('/defaults', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_tariff_defaults')
    .select('*')
    .eq('club_id', club_id)
    .maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, defaults: data ?? { club_id, weekday_tariff_id: null, weekend_tariff_id: null } });
});

router.put('/defaults', async (req: Request, res: Response) => {
  const { club_id, weekday_tariff_id, weekend_tariff_id } = req.body ?? {};
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, String(club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_tariff_defaults')
    .upsert(
      {
        club_id,
        weekday_tariff_id: weekday_tariff_id ?? null,
        weekend_tariff_id: weekend_tariff_id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'club_id' },
    )
    .select()
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, defaults: data });
});

// ----------------- DAY OVERRIDES (must precede /:id) -----------------

router.get('/overrides', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const supabase = getSupabaseServiceRoleClient();
  let q = supabase
    .from('club_day_overrides')
    .select('*')
    .eq('club_id', club_id)
    .order('date', { ascending: true });
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);

  const { data, error } = await q;
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, overrides: data ?? [] });
});

router.put('/overrides', async (req: Request, res: Response) => {
  const { club_id, date, tariff_id, label, source } = req.body ?? {};
  if (!club_id || !date || !tariff_id) {
    return res.status(400).json({ ok: false, error: 'club_id, date y tariff_id son obligatorios' });
  }
  if (!canAccessClub(req, String(club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const srcValue = source === 'holiday' ? 'holiday' : 'manual';

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_day_overrides')
    .upsert(
      {
        club_id,
        date,
        tariff_id,
        label: label ?? null,
        source: srcValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'club_id,date' },
    )
    .select()
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, override: data });
});

router.delete('/overrides', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  const date = req.query.date as string | undefined;
  if (!club_id || !date) return res.status(400).json({ ok: false, error: 'club_id y date son obligatorios' });
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('club_day_overrides')
    .delete()
    .eq('club_id', club_id)
    .eq('date', date);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true });
});

router.post('/overrides/bulk-holidays', async (req: Request, res: Response) => {
  const { club_id, tariff_id, dates } = req.body ?? {};
  if (!club_id || !tariff_id || !Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ ok: false, error: 'club_id, tariff_id y dates son obligatorios' });
  }
  if (!canAccessClub(req, String(club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const rows = dates
    .map((d: unknown) => {
      if (typeof d === 'string') return { date: d, label: null };
      if (d && typeof d === 'object' && 'date' in d) {
        const obj = d as { date: string; label?: string | null };
        return { date: obj.date, label: obj.label ?? null };
      }
      return null;
    })
    .filter((x): x is { date: string; label: string | null } => !!x && !!x.date)
    .map((r) => ({
      club_id,
      date: r.date,
      tariff_id,
      label: r.label,
      source: 'holiday',
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return res.status(400).json({ ok: false, error: 'dates vacío o inválido' });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_day_overrides')
    .upsert(rows, { onConflict: 'club_id,date' })
    .select();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(201).json({ ok: true, inserted: data?.length ?? 0 });
});

// ----------------- RESOLVED CALENDAR -----------------
// GET /tariffs/calendar?club_id=X&year=YYYY&month=MM (1-12)

router.get('/calendar', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  const yearStr = req.query.year as string | undefined;
  const monthStr = req.query.month as string | undefined;
  if (!club_id || !yearStr || !monthStr) {
    return res.status(400).json({ ok: false, error: 'club_id, year y month son obligatorios' });
  }
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return res.status(400).json({ ok: false, error: 'year/month inválidos' });
  }

  const supabase = getSupabaseServiceRoleClient();

  const [{ data: tariffs, error: tErr }, { data: defaults, error: dErr }] = await Promise.all([
    supabase.from('club_tariffs').select('*').eq('club_id', club_id),
    supabase.from('club_tariff_defaults').select('*').eq('club_id', club_id).maybeSingle(),
  ]);
  if (tErr) return res.status(500).json({ ok: false, error: tErr.message });
  if (dErr) return res.status(500).json({ ok: false, error: dErr.message });

  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const last = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const { data: overrides, error: oErr } = await supabase
    .from('club_day_overrides').select('*').eq('club_id', club_id).gte('date', first).lte('date', last);
  if (oErr) return res.status(500).json({ ok: false, error: oErr.message });

  // Build a Set of YYYY-MM-DD strings for has_schedule.
  // Try the RPC (SELECT DISTINCT — efficient, no row-limit issues).
  // Fall back to the direct query if the function doesn't exist yet.
  const scheduledDatesSet = new Set<string>();
  const rpcResult = await supabase.rpc('get_scheduled_dates', { p_club_id: club_id, p_first: first, p_last: last });
  if (!rpcResult.error && rpcResult.data) {
    (rpcResult.data as { scheduled_date: string }[]).forEach((r) => {
      scheduledDatesSet.add(String(r.scheduled_date).substring(0, 10));
    });
  } else {
    // Fallback: direct query with high limit and date normalization
    const { data: scheduleDates } = await supabase
      .from('club_day_schedule')
      .select('date')
      .eq('club_id', club_id)
      .gte('date', first)
      .lte('date', last)
      .limit(5000);
    (scheduleDates ?? []).forEach((r: any) => {
      scheduledDatesSet.add(String(r.date).substring(0, 10));
    });
  }


  const tariffMap = new Map<string, any>((tariffs ?? []).map((t: any) => [t.id, t]));
  const overrideMap = new Map<string, any>((overrides ?? []).map((o: any) => [o.date, o]));
  const weekdayTariff = defaults?.weekday_tariff_id ? tariffMap.get(defaults.weekday_tariff_id) : null;
  const weekendTariff = defaults?.weekend_tariff_id ? tariffMap.get(defaults.weekend_tariff_id) : null;

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;

    const override = overrideMap.get(dateStr);
    let tariff: any = null;
    let origin: 'override' | 'default' | 'none' = 'none';
    if (override) {
      tariff = tariffMap.get(override.tariff_id) ?? null;
      origin = 'override';
    } else if (isWeekend && weekendTariff) {
      tariff = weekendTariff;
      origin = 'default';
    } else if (!isWeekend && weekdayTariff) {
      tariff = weekdayTariff;
      origin = 'default';
    }

    days.push({
      date: dateStr,
      dow,
      is_weekend: isWeekend,
      tariff_id: tariff?.id ?? null,
      tariff_name: tariff?.name ?? null,
      price_cents: tariff?.price_cents ?? null,
      is_blocking: tariff?.is_blocking ?? false,
      origin,
      override_id: override?.id ?? null,
      label: override?.label ?? null,
      source: override?.source ?? null,
      has_schedule: scheduledDatesSet.has(dateStr),
    });
  }

  return res.json({ ok: true, year, month, days, tariffs: tariffs ?? [], defaults: defaults ?? null });
});

// ----------------- DAY SCHEDULE (court \xd7 slot \u2192 tariff) -----------------

// GET /tariffs/schedule?club_id=X&date=YYYY-MM-DD
router.get('/schedule', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  const date    = req.query.date    as string | undefined;
  if (!club_id || !date) return res.status(400).json({ ok: false, error: 'club_id y date son obligatorios' });
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_day_schedule')
    .select('court_id, slot, tariff_id')
    .eq('club_id', club_id)
    .eq('date', date)
    .order('slot', { ascending: true });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, slots: data ?? [] });
});

// PUT /tariffs/schedule — replace all slots for a date (delete-then-insert)
router.put('/schedule', async (req: Request, res: Response) => {
  const { club_id, date, slots } = req.body ?? {};
  if (!club_id || !date) return res.status(400).json({ ok: false, error: 'club_id y date son obligatorios' });
  if (!canAccessClub(req, String(club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  if (!Array.isArray(slots)) return res.status(400).json({ ok: false, error: 'slots debe ser un array' });

  const supabase = getSupabaseServiceRoleClient();

  // Delete current schedule for that day
  const { error: delErr } = await supabase
    .from('club_day_schedule')
    .delete()
    .eq('club_id', club_id)
    .eq('date', date);
  if (delErr) return res.status(500).json({ ok: false, error: delErr.message });

  if (slots.length === 0) return res.json({ ok: true, saved: 0 });

  const rows = (slots as { court_id: string; slot: string; tariff_id: string }[])
    .filter(s => s.court_id && s.slot && s.tariff_id)
    .map(s => ({
      club_id,
      date,
      court_id: s.court_id,
      slot: s.slot,
      tariff_id: s.tariff_id,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return res.json({ ok: true, saved: 0 });

  const { data, error: insErr } = await supabase
    .from('club_day_schedule')
    .insert(rows)
    .select('id');
  if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
  return res.json({ ok: true, saved: data?.length ?? 0 });
});

// POST /tariffs/schedule/repeat — copy source_date schedule to target_dates
router.post('/schedule/repeat', async (req: Request, res: Response) => {
  const { club_id, source_date, target_dates } = req.body ?? {};
  if (!club_id || !source_date || !Array.isArray(target_dates) || target_dates.length === 0) {
    return res.status(400).json({ ok: false, error: 'club_id, source_date y target_dates son obligatorios' });
  }
  if (!canAccessClub(req, String(club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const supabase = getSupabaseServiceRoleClient();

  // Fetch source schedule
  const { data: source, error: srcErr } = await supabase
    .from('club_day_schedule')
    .select('court_id, slot, tariff_id')
    .eq('club_id', club_id)
    .eq('date', source_date);
  if (srcErr) return res.status(500).json({ ok: false, error: srcErr.message });
  if (!source || source.length === 0) {
    return res.json({ ok: true, applied: 0, message: 'El día origen no tiene franjas configuradas' });
  }

  const validDates = (target_dates as unknown[]).filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) as string[];
  if (validDates.length === 0) return res.status(400).json({ ok: false, error: 'target_dates inválidos' });

  // Enforce same year-month as source_date (repeat only within the same month)
  const sourceYM = source_date.substring(0, 7); // "YYYY-MM"
  const crossMonth = validDates.filter(d => d.substring(0, 7) !== sourceYM);
  if (crossMonth.length > 0) {
    return res.status(400).json({
      ok: false,
      error: `Los días destino deben pertenecer al mismo mes que el origen (${sourceYM})`,
    });
  }

  // Delete existing schedule for all target dates
  const { error: delErr } = await supabase
    .from('club_day_schedule')
    .delete()
    .eq('club_id', club_id)
    .in('date', validDates);
  if (delErr) return res.status(500).json({ ok: false, error: delErr.message });

  // Build rows for every target date × every source slot
  const rows: object[] = [];
  const now = new Date().toISOString();
  for (const date of validDates) {
    for (const s of source) {
      rows.push({ club_id, date, court_id: s.court_id, slot: s.slot, tariff_id: s.tariff_id, updated_at: now });
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('club_day_schedule')
    .insert(rows)
    .select('id');
  if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

  return res.json({ ok: true, applied: validDates.length, rows_saved: inserted?.length ?? 0 });
});

// DELETE /tariffs/schedule/month?club_id=X&year=YYYY&month=M — reset full month
router.delete('/schedule/month', async (req: Request, res: Response) => {
  const club_id  = req.query.club_id  as string | undefined;
  const yearStr  = req.query.year     as string | undefined;
  const monthStr = req.query.month    as string | undefined;
  if (!club_id || !yearStr || !monthStr) {
    return res.status(400).json({ ok: false, error: 'club_id, year y month son obligatorios' });
  }
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const year  = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return res.status(400).json({ ok: false, error: 'year/month inválidos' });
  }

  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const last  = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const supabase = getSupabaseServiceRoleClient();

  const [{ error: sErr, count: sCount }, { error: oErr, count: oCount }] = await Promise.all([
    supabase.from('club_day_schedule').delete({ count: 'exact' })
      .eq('club_id', club_id).gte('date', first).lte('date', last),
    supabase.from('club_day_overrides').delete({ count: 'exact' })
      .eq('club_id', club_id).gte('date', first).lte('date', last),
  ]);

  if (sErr) return res.status(500).json({ ok: false, error: `Error en schedule: ${sErr.message}` });
  if (oErr) return res.status(500).json({ ok: false, error: `Error en overrides: ${oErr.message}` });

  return res.json({ ok: true, deleted_slots: sCount ?? 0, deleted_overrides: oCount ?? 0 });
});

// ----------------- TARIFFS CRUD -----------------



router.get('/', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_tariffs')
    .select('*')
    .eq('club_id', club_id)
    .order('name', { ascending: true });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, tariffs: data ?? [] });
});

router.post('/', async (req: Request, res: Response) => {
  const { club_id, name, price_cents, is_blocking } = req.body ?? {};
  if (!club_id || !name) return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  if (!canAccessClub(req, String(club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const price = parsePrice(price_cents);
  if (price === null) return res.status(400).json({ ok: false, error: 'price_cents inválido' });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_tariffs')
    .insert({
      club_id,
      name: String(name).trim(),
      price_cents: price,
      is_blocking: Boolean(is_blocking),
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe una tarifa con ese nombre' });
    return res.status(500).json({ ok: false, error: error.message });
  }
  return res.status(201).json({ ok: true, tariff: data });
});

router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, price_cents, is_blocking } = req.body ?? {};

  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: exErr } = await supabase
    .from('club_tariffs')
    .select('club_id')
    .eq('id', id)
    .single();
  if (exErr || !existing) return res.status(404).json({ ok: false, error: 'Tarifa no encontrada' });
  if (!canAccessClub(req, existing.club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = String(name).trim();
  if (price_cents !== undefined) {
    const p = parsePrice(price_cents);
    if (p === null) return res.status(400).json({ ok: false, error: 'price_cents inválido' });
    patch.price_cents = p;
  }
  if (is_blocking !== undefined) patch.is_blocking = Boolean(is_blocking);

  const { data, error } = await supabase.from('club_tariffs').update(patch).eq('id', id).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe una tarifa con ese nombre' });
    return res.status(500).json({ ok: false, error: error.message });
  }
  return res.json({ ok: true, tariff: data });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: exErr } = await supabase
    .from('club_tariffs')
    .select('club_id')
    .eq('id', id)
    .single();
  if (exErr || !existing) return res.status(404).json({ ok: false, error: 'Tarifa no encontrada' });
  if (!canAccessClub(req, existing.club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const { error } = await supabase.from('club_tariffs').delete().eq('id', id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true });
});

export default router;
