import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireAuthUser } from '../middleware/requireAuthUser';
import { canAccessClub } from '../lib/clubAccess';

const router = Router();
router.use(attachAuthContext);

const FIELDS = 'id, club_id, name, description, category, price_to_pay, balance_to_add, physical_item, validity_days, is_active, created_at, updated_at';

// ─── GET /bonuses?club_id= ───────────────────────────────────────────────────
// Lista todos los bonos de un club (activos e inactivos para el admin).
router.get('/', requireAuthUser, async (req: Request, res: Response) => {
    const { club_id } = req.query as Record<string, string>;
    if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es requerido' });
    if (!canAccessClub(req, club_id, 'grilla')) {
        return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    try {
        const supabase = getSupabaseServiceRoleClient();
        const { data, error } = await supabase
            .from('bonuses')
            .select(FIELDS)
            .eq('club_id', club_id)
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ ok: false, error: error.message });
        return res.json({ ok: true, data: data ?? [] });
    } catch (err) {
        return res.status(500).json({ ok: false, error: (err as Error).message });
    }
});

// ─── POST /bonuses ────────────────────────────────────────────────────────────
// Crea un nuevo bono.
router.post('/', requireAuthUser, async (req: Request, res: Response) => {
    const { club_id, name, description, category, price_to_pay, balance_to_add, physical_item, validity_days } = req.body ?? {};

    if (!club_id || !name || price_to_pay === undefined || balance_to_add === undefined) {
        return res.status(400).json({ ok: false, error: 'club_id, name, price_to_pay y balance_to_add son requeridos' });
    }
    if (!canAccessClub(req, String(club_id), 'grilla')) {
        return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    if (typeof price_to_pay !== 'number' || typeof balance_to_add !== 'number') {
        return res.status(400).json({ ok: false, error: 'price_to_pay y balance_to_add deben ser números' });
    }

    if (balance_to_add < price_to_pay) {
        return res.status(400).json({ ok: false, error: 'balance_to_add debe ser >= price_to_pay' });
    }

    try {
        const supabase = getSupabaseServiceRoleClient();
        const { data, error } = await supabase
            .from('bonuses')
            .insert({
                club_id,
                name: name.trim(),
                description: description?.trim() || null,
                category: category || 'monedero',
                price_to_pay,
                balance_to_add,
                physical_item: physical_item?.trim() || null,
                validity_days: validity_days ?? null,
            })
            .select(FIELDS)
            .single();

        if (error) return res.status(500).json({ ok: false, error: error.message });
        return res.status(201).json({ ok: true, data });
    } catch (err) {
        return res.status(500).json({ ok: false, error: (err as Error).message });
    }
});

// ─── PUT /bonuses/:id ─────────────────────────────────────────────────────────
// Actualiza un bono existente.
router.put('/:id', requireAuthUser, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, category, price_to_pay, balance_to_add, physical_item, validity_days, is_active } = req.body ?? {};

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (category !== undefined) updates.category = category;
    if (price_to_pay !== undefined) updates.price_to_pay = price_to_pay;
    if (balance_to_add !== undefined) updates.balance_to_add = balance_to_add;
    if (physical_item !== undefined) updates.physical_item = physical_item?.trim() || null;
    if (validity_days !== undefined) updates.validity_days = validity_days;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
    }

    // Validate balance >= price if both are being set
    const finalPrice = updates.price_to_pay;
    const finalBalance = updates.balance_to_add;
    if (finalPrice !== undefined && finalBalance !== undefined && finalBalance < finalPrice) {
        return res.status(400).json({ ok: false, error: 'balance_to_add debe ser >= price_to_pay' });
    }

    try {
        const supabase = getSupabaseServiceRoleClient();
        const { data: existing } = await supabase.from('bonuses').select('club_id').eq('id', id).maybeSingle();
        const cid = (existing as { club_id?: string } | null)?.club_id;
        if (!cid || !canAccessClub(req, cid, 'grilla')) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este bono' });
        }
        const { data, error } = await supabase
            .from('bonuses')
            .update(updates)
            .eq('id', id)
            .select(FIELDS)
            .single();

        if (error) return res.status(500).json({ ok: false, error: error.message });
        return res.json({ ok: true, data });
    } catch (err) {
        return res.status(500).json({ ok: false, error: (err as Error).message });
    }
});

// ─── PATCH /bonuses/:id/toggle ────────────────────────────────────────────────
// Toggle rápido de is_active (baja/alta lógica).
router.patch('/:id/toggle', requireAuthUser, async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const supabase = getSupabaseServiceRoleClient();
        const { data: bonusRow } = await supabase.from('bonuses').select('club_id').eq('id', id).maybeSingle();
        const bcid = (bonusRow as { club_id?: string } | null)?.club_id;
        if (!bcid || !canAccessClub(req, bcid, 'grilla')) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este bono' });
        }

        // Leer estado actual
        const { data: current, error: readErr } = await supabase
            .from('bonuses')
            .select('is_active')
            .eq('id', id)
            .single();

        if (readErr || !current) return res.status(404).json({ ok: false, error: 'Bono no encontrado' });

        const { data, error } = await supabase
            .from('bonuses')
            .update({ is_active: !current.is_active })
            .eq('id', id)
            .select(FIELDS)
            .single();

        if (error) return res.status(500).json({ ok: false, error: error.message });
        return res.json({ ok: true, data });
    } catch (err) {
        return res.status(500).json({ ok: false, error: (err as Error).message });
    }
});

export default router;
