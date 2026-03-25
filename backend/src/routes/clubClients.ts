import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { getClubClientPlayerIds } from '../lib/clubClientPlayers';
import { sendClubCrmEmail } from '../lib/mailer';

const router = Router();
router.use(attachAuthContext);

const PLAYER_LIST_FIELDS =
  'id, created_at, first_name, last_name, email, phone, elo_rating, status, auth_user_id';

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @openapi
 * /club-clients:
 *   get:
 *     tags: [Club CRM]
 *     summary: Listar clientes (jugadores) del club
 *     description: |
 *       Jugadores que han aparecido en reservas de pistas del club o dados de alta manualmente desde el CRM.
 *       Requiere JWT de admin o dueño con acceso al club.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Buscar por nombre o email (opcional)
 *     responses:
 *       200:
 *         description: Lista de jugadores
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               players: [{ id: "uuid", first_name: "Ana", last_name: "López", email: "a@b.com", phone: "+34…", elo_rating: 1200, status: "active" }]
 *       400: { description: Falta club_id }
 *       401: { description: Sin token }
 *       403: { description: Sin acceso al club }
 */
router.get('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const ids = await getClubClientPlayerIds(supabase, club_id);
    if (ids.length === 0) return res.json({ ok: true, players: [] });

    let query = supabase
      .from('players')
      .select(PLAYER_LIST_FIELDS)
      .in('id', ids)
      .order('created_at', { ascending: false });

    if (q) {
      const esc = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(
        `first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%`
      );
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, players: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-clients/export:
 *   get:
 *     tags: [Club CRM]
 *     summary: Exportar clientes del club (CSV)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Archivo CSV (UTF-8 con BOM)
 *         content:
 *           text/csv: {}
 *       400: { description: Falta club_id }
 *       403: { description: Sin acceso }
 */
router.get('/export', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const ids = await getClubClientPlayerIds(supabase, club_id);
    if (ids.length === 0) {
      const bom = '\uFEFF';
      const header = 'id,first_name,last_name,email,phone,elo_rating,status,created_at\n';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="clientes-club.csv"');
      return res.send(bom + header);
    }

    let query = supabase.from('players').select(PLAYER_LIST_FIELDS).in('id', ids).order('last_name', { ascending: true });
    if (q) {
      const esc = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(
        `first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%`
      );
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const rows = data ?? [];
    const bom = '\uFEFF';
    const header = 'id,first_name,last_name,email,phone,elo_rating,status,created_at\n';
    const body = rows
      .map((p: Record<string, unknown>) =>
        [
          csvEscape(p.id as string),
          csvEscape(p.first_name as string),
          csvEscape(p.last_name as string),
          csvEscape((p.email as string | null) ?? ''),
          csvEscape((p.phone as string | null) ?? ''),
          csvEscape(p.elo_rating as number),
          csvEscape(p.status as string),
          csvEscape(p.created_at as string),
        ].join(',')
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes-club.csv"');
    return res.send(bom + header + body + (body ? '\n' : ''));
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-clients/manual:
 *   post:
 *     tags: [Club CRM]
 *     summary: Alta manual de cliente en el club
 *     description: Crea el jugador (si no existe) y lo asocia al CRM del club.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, first_name, last_name, phone]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               phone: { type: string }
 *               email: { type: string, nullable: true }
 *           example:
 *             club_id: "uuid-club"
 *             first_name: "Luis"
 *             last_name: "García"
 *             phone: "+34600111222"
 *             email: "luis@example.com"
 *     responses:
 *       201:
 *         description: Jugador creado
 *         content:
 *           application/json:
 *             example: { ok: true, player: { id: "uuid", first_name: "Luis" } }
 *       400: { description: Validación }
 *       403: { description: Sin acceso al club }
 *       409: { description: Teléfono o email duplicado }
 */
router.post('/manual', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { club_id, first_name, last_name, phone, email } = req.body ?? {};
  const clubId = typeof club_id === 'string' ? club_id.trim() : '';
  const firstName = typeof first_name === 'string' ? first_name.trim() : '';
  const lastName = typeof last_name === 'string' ? last_name.trim() : '';
  const phoneStr = typeof phone === 'string' ? phone.trim() : '';

  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  if (!firstName || !lastName || !phoneStr) {
    return res.status(400).json({ ok: false, error: 'first_name, last_name y phone son obligatorios' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: existingByPhone } = await supabase
      .from('players')
      .select('id')
      .eq('phone', phoneStr)
      .neq('status', 'deleted')
      .maybeSingle();
    if (existingByPhone) {
      return res.status(409).json({ ok: false, error: 'Ya existe un usuario con este teléfono' });
    }

    const emailStr = typeof email === 'string' ? email.trim().toLowerCase() : null;
    if (emailStr) {
      const { data: existingByEmail } = await supabase
        .from('players')
        .select('id')
        .eq('email', emailStr)
        .neq('status', 'deleted')
        .maybeSingle();
      if (existingByEmail) {
        return res.status(409).json({ ok: false, error: 'Ya existe un usuario con este correo' });
      }
    }

    const { data: created, error } = await supabase
      .from('players')
      .insert([
        {
          first_name: firstName,
          last_name: lastName,
          phone: phoneStr,
          email: emailStr,
          auth_user_id: null,
        },
      ])
      .select(PLAYER_LIST_FIELDS)
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ ok: false, error: 'Ya existe un usuario con este teléfono o correo' });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }
    if (!created) return res.status(500).json({ ok: false, error: 'No se pudo crear el jugador' });

    const { error: linkErr } = await supabase.from('club_player_contacts').upsert(
      { club_id: clubId, player_id: created.id },
      { onConflict: 'club_id,player_id' }
    );
    if (linkErr) {
      const m = linkErr.message.toLowerCase();
      if (!(m.includes('does not exist') || m.includes('schema cache'))) {
        return res.status(500).json({ ok: false, error: linkErr.message });
      }
    }

    return res.status(201).json({ ok: true, player: created });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-clients/send-email:
 *   post:
 *     tags: [Club CRM]
 *     summary: Enviar correo a clientes seleccionados o a todos con email
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, subject, body_html, mode]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               subject: { type: string }
 *               body_html: { type: string, description: Contenido HTML del mensaje }
 *               mode: { type: string, enum: [selected, all] }
 *               player_ids:
 *                 type: array
 *                 items: { type: string, format: uuid }
 *                 description: Obligatorio si mode es selected
 *           examples:
 *             todos:
 *               value:
 *                 club_id: "uuid"
 *                 subject: "Novedades en el club"
 *                 body_html: "<p>Hola,</p><p>Te informamos…</p>"
 *                 mode: all
 *             seleccion:
 *               value:
 *                 club_id: "uuid"
 *                 subject: "Recordatorio"
 *                 body_html: "<p>Hola {{nombre}},</p>"
 *                 mode: selected
 *                 player_ids: ["uuid-1", "uuid-2"]
 *     responses:
 *       200:
 *         description: Resultado por destinatario (puede incluir fallos parciales)
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               sent_count: 2
 *               failed_count: 0
 *               results: [{ to: "a@b.com", ok: true }]
 *       400: { description: Validación }
 *       403: { description: Sin acceso }
 *       502: { description: Servicio de correo no configurado o error masivo }
 */
router.post('/send-email', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { club_id, subject, body_html, mode, player_ids } = req.body ?? {};
  const clubId = typeof club_id === 'string' ? club_id.trim() : '';
  const subjectStr = typeof subject === 'string' ? subject.trim() : '';
  const html = typeof body_html === 'string' ? body_html : '';
  const modeStr = mode === 'all' || mode === 'selected' ? mode : '';

  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  if (!subjectStr || !html.trim()) {
    return res.status(400).json({ ok: false, error: 'subject y body_html son obligatorios' });
  }
  if (!modeStr) {
    return res.status(400).json({ ok: false, error: 'mode debe ser "selected" o "all"' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const allowedIds = new Set(await getClubClientPlayerIds(supabase, clubId));

    let targetIds: string[] = [];
    if (modeStr === 'all') {
      targetIds = [...allowedIds];
    } else {
      if (!Array.isArray(player_ids) || player_ids.length === 0) {
        return res.status(400).json({ ok: false, error: 'player_ids es obligatorio cuando mode es selected' });
      }
      targetIds = player_ids.map((x: unknown) => String(x)).filter(Boolean);
      if (!targetIds.every((id) => allowedIds.has(id))) {
        return res.status(400).json({ ok: false, error: 'Algún jugador no pertenece a los clientes de este club' });
      }
    }

    if (targetIds.length > 500) {
      return res.status(400).json({ ok: false, error: 'Máximo 500 destinatarios por envío' });
    }

    const { data: players, error: pErr } = await supabase
      .from('players')
      .select('id, first_name, last_name, email, status')
      .in('id', targetIds);
    if (pErr) return res.status(500).json({ ok: false, error: pErr.message });

    const withEmail = (players ?? []).filter(
      (p: { email: string | null; status: string }) => p.status !== 'deleted' && p.email && String(p.email).includes('@')
    );

    const results: { to: string; ok: boolean; error?: string; player_id?: string }[] = [];
    for (const p of withEmail) {
      const row = p as { id: string; first_name: string; last_name: string; email: string };
      const personalized = html
        .replace(/\{\{nombre\}\}/gi, escapeHtmlSnippet(row.first_name))
        .replace(/\{\{apellidos\}\}/gi, escapeHtmlSnippet(row.last_name));
      const wrapped = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${personalized}</div>`;
      const r = await sendClubCrmEmail(row.email.trim().toLowerCase(), subjectStr, wrapped);
      results.push({ to: row.email, ok: r.sent, error: r.error, player_id: row.id });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const sent_count = results.filter((x) => x.ok).length;
    const failed_count = results.filter((x) => !x.ok).length;
    return res.json({ ok: true, sent_count, failed_count, results });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

function escapeHtmlSnippet(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @openapi
 * /club-clients/{playerId}:
 *   put:
 *     tags: [Club CRM]
 *     summary: Actualizar datos de un cliente del club
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               email: { type: string, nullable: true }
 *               phone: { type: string, nullable: true }
 *               elo_rating: { type: integer }
 *               status: { type: string, enum: [active, blocked, deleted] }
 *     responses:
 *       200: { description: Jugador actualizado }
 *       400: { description: Sin campos o jugador ajeno al club }
 *       403: { description: Sin acceso al club }
 *       404: { description: Jugador no encontrado }
 */
router.put('/:playerId', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { playerId } = req.params;
  const { club_id, first_name, last_name, email, phone, elo_rating, status } = req.body ?? {};
  const clubId = typeof club_id === 'string' ? club_id.trim() : '';

  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio en el body' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  const update: Record<string, unknown> = {};
  if (first_name !== undefined) update.first_name = first_name;
  if (last_name !== undefined) update.last_name = last_name;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (elo_rating !== undefined) update.elo_rating = elo_rating;
  if (status !== undefined) update.status = status;
  update.updated_at = new Date().toISOString();

  if (Object.keys(update).length === 1) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const allowedIds = new Set(await getClubClientPlayerIds(supabase, clubId));
    if (!allowedIds.has(playerId)) {
      return res.status(400).json({ ok: false, error: 'Este jugador no está en la cartera de clientes de este club' });
    }

    const { data, error } = await supabase
      .from('players')
      .update(update)
      .eq('id', playerId)
      .select(PLAYER_LIST_FIELDS)
      .maybeSingle();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Player not found' });
    return res.json({ ok: true, player: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
