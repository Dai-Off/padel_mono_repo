import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireAuthUser } from '../middleware/requireAuthUser';
import { canAccessClub } from '../lib/clubAccess';

const router = Router();
router.use(attachAuthContext);
router.use(requireAuthUser);

const SLUGS = ['standard', 'staff', 'admin', 'vip', 'sponsor', 'coach'] as const;

/**
 * @openapi
 * /club-player-segments:
 *   put:
 *     tags: [Club CRM]
 *     summary: Asignar tipo de cliente y descuento % en el club
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, player_id]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               player_id: { type: string, format: uuid }
 *               segment_slug: { type: string, example: staff }
 *               discount_percent: { type: integer, minimum: 0, maximum: 100 }
 *     responses:
 *       200: { description: OK }
 */
router.put('/', async (req: Request, res: Response) => {
  const { club_id, player_id, segment_slug, discount_percent } = req.body ?? {};
  if (!club_id || !player_id) {
    return res.status(400).json({ ok: false, error: 'club_id y player_id son obligatorios' });
  }
  if (!canAccessClub(req, String(club_id), 'clientes') && !canAccessClub(req, String(club_id), 'finanzas')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  const slugRaw = segment_slug != null && String(segment_slug).trim() ? String(segment_slug).trim().toLowerCase() : 'standard';
  const slug = (SLUGS as readonly string[]).includes(slugRaw) ? slugRaw : 'standard';
  const dp = Math.min(100, Math.max(0, Math.trunc(Number(discount_percent ?? 0))));

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_player_segments')
      .upsert(
        {
          club_id: String(club_id),
          player_id: String(player_id),
          segment_slug: slug,
          discount_percent: dp,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'club_id,player_id' },
      )
      .select()
      .single();

    if (error) {
      if (error.message.includes('does not exist')) {
        return res.status(503).json({ ok: false, error: 'Tabla club_player_segments no existe. Aplica migración 054.' });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.json({ ok: true, segment: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
