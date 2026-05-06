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

/**
 * @openapi
 * /bonuses/{id}/gift-to-player:
 *   post:
 *     tags: [Bonos]
 *     summary: Regalar bono a un jugador (monedero y/o pack clases)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [player_id]
 *             properties:
 *               player_id: { type: string, format: uuid }
 *               class_sessions: { type: integer, minimum: 1, description: Solo si category=clases }
 *           examples:
 *             wallet:
 *               value: { player_id: "00000000-0000-4000-8000-000000000001" }
 *             clases:
 *               value: { player_id: "00000000-0000-4000-8000-000000000001", class_sessions: 5 }
 *     responses:
 *       201: { description: Creado (wallet y/o class_bono) }
 *       400: { description: Falta player_id }
 *       403: { description: Sin acceso al club del bono }
 *       404: { description: Bono no encontrado }
 */
// ─── POST /bonuses/:id/gift-to-player ─────────────────────────────────────────
// Regala el bono a un jugador (crédito monedero y/o pack de clases).
router.post('/:id/gift-to-player', requireAuthUser, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { player_id, class_sessions } = req.body ?? {};
    if (!player_id) return res.status(400).json({ ok: false, error: 'player_id es obligatorio' });

    try {
        const supabase = getSupabaseServiceRoleClient();
        const { data: bonus, error: readErr } = await supabase
            .from('bonuses')
            .select(FIELDS)
            .eq('id', id)
            .maybeSingle();
        if (readErr || !bonus) return res.status(404).json({ ok: false, error: 'Bono no encontrado' });
        const cid = (bonus as { club_id: string }).club_id;
        if (!canAccessClub(req, cid, 'grilla')) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este bono' });
        }

        const balanceToAdd = Number((bonus as { balance_to_add?: number }).balance_to_add ?? 0);
        const category = String((bonus as { category?: string }).category ?? 'monedero');
        const name = String((bonus as { name?: string }).name ?? 'Bono');

        const out: { wallet?: unknown; class_bono?: unknown } = {};

        if (balanceToAdd > 0) {
            const { data: tx, error: txErr } = await supabase
                .from('wallet_transactions')
                .insert({
                    player_id: String(player_id),
                    club_id: cid,
                    amount_cents: balanceToAdd,
                    concept: `Bono regalo: ${name}`,
                    type: 'credit',
                    notes: `bonus_id=${id}`,
                })
                .select()
                .single();
            if (txErr) return res.status(500).json({ ok: false, error: txErr.message });
            out.wallet = tx;
        }

        if (category === 'clases') {
            const sessions = Math.max(1, Math.trunc(Number(class_sessions ?? 1)));
            if (Number.isFinite(sessions)) {
                const { data: cb, error: cbErr } = await supabase
                    .from('class_bonos')
                    .insert({
                        player_id: String(player_id),
                        club_id: cid,
                        total_classes: sessions,
                        remaining_classes: sessions,
                        price_cents: 0,
                        currency: 'EUR',
                        status: 'active',
                    })
                    .select()
                    .single();
                if (!cbErr) out.class_bono = cb;
            }
        }

        return res.status(201).json({ ok: true, ...out });
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
