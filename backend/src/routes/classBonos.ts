import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireAuthUser } from '../middleware/requireAuthUser';
import { canAccessClub } from '../lib/clubAccess';

const router = Router();
router.use(attachAuthContext);
router.use(requireAuthUser);

/**
 * @openapi
 * /class-bonos/purchase:
 *   post:
 *     tags: [Escuela]
 *     summary: Registrar pack de clases para un jugador (recepción / premio)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, player_id, total_classes]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               player_id: { type: string, format: uuid }
 *               total_classes: { type: integer, minimum: 1 }
 *               price_cents: { type: integer, description: "Importe cobrado (0 si premio)" }
 *               payment_method: { type: string, enum: [cash, card, prize] }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Creado }
 *       400: { description: Validación }
 *       403: { description: Sin acceso }
 */
router.post('/purchase', async (req: Request, res: Response) => {
  const { club_id, player_id, total_classes, price_cents, payment_method, notes } = req.body ?? {};
  if (!club_id || !player_id || total_classes == null) {
    return res.status(400).json({ ok: false, error: 'club_id, player_id y total_classes son obligatorios' });
  }
  const nClasses = Math.max(1, Math.trunc(Number(total_classes)));
  if (!Number.isFinite(nClasses) || nClasses < 1) {
    return res.status(400).json({ ok: false, error: 'total_classes inválido' });
  }
  if (!canAccessClub(req, String(club_id), 'finanzas') && !canAccessClub(req, String(club_id), 'grilla')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  const method = payment_method === 'prize' || payment_method === 'card' || payment_method === 'cash'
    ? payment_method
    : 'cash';
  const price = method === 'prize' ? 0 : Math.max(0, Math.trunc(Number(price_cents ?? 0)));

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('class_bonos')
      .insert({
        player_id: String(player_id),
        club_id: String(club_id),
        total_classes: nClasses,
        remaining_classes: nClasses,
        price_cents: price,
        currency: 'EUR',
        expires_at: null,
        status: 'active',
      })
      .select('id, player_id, club_id, total_classes, remaining_classes, price_cents, status, purchased_at')
      .single();

    if (error) {
      if (error.message.includes('does not exist')) {
        return res.status(503).json({ ok: false, error: 'Tabla class_bonos no disponible. Aplica migraciones de escuela.' });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(201).json({ ok: true, class_bono: data, payment_method: method, notes: notes ?? null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
