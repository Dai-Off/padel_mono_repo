import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdminOrPortalStaff } from '../middleware/requireClubOwnerOrAdminOrPortalStaff';
import { getClubClientPlayerIds, invalidateClubClientPlayerIdsCache } from '../lib/clubClientPlayers';
import { sendClubCrmEmail } from '../lib/mailer';
import { getPlayerClubDebt } from '../lib/players/playerDebt';
import { canAccessClub } from '../lib/clubAccess';

const router = Router();
router.use(attachAuthContext);

const PLAYER_LIST_FIELDS =
  'id, created_at, first_name, last_name, email, phone, elo_rating, status, auth_user_id';

type Tier = 'vip' | 'premium' | 'standard' | 'basic';

function parseIsoDateParam(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseIntParam(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseBoolParam(v: unknown): boolean | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (t === '1' || t === 'true' || t === 'yes' || t === 'y') return true;
  if (t === '0' || t === 'false' || t === 'no' || t === 'n') return false;
  return null;
}

async function getClubPlayerSegmentsMap(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  clubId: string,
  playerIds: string[],
): Promise<Map<string, { segment_slug: string; discount_percent: number }>> {
  const out = new Map<string, { segment_slug: string; discount_percent: number }>();
  if (playerIds.length === 0) return out;
  for (const batch of chunk(playerIds, 500)) {
    const { data, error } = await supabase
      .from('club_player_segments')
      .select('player_id, segment_slug, discount_percent')
      .eq('club_id', clubId)
      .in('player_id', batch)
      .limit(5000);
    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      const code = String((error as { code?: string }).code ?? '');
      if (code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')) {
        return new Map();
      }
      throw error;
    }
    for (const row of data ?? []) {
      const pid = String((row as { player_id?: string }).player_id ?? '');
      if (!pid) continue;
      out.set(pid, {
        segment_slug: String((row as { segment_slug?: string }).segment_slug ?? 'standard'),
        discount_percent: Math.trunc(Number((row as { discount_percent?: number }).discount_percent ?? 0)),
      });
    }
  }
  return out;
}

async function getWalletBalanceByPlayer(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  clubId: string,
  playerIds: string[],
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  if (playerIds.length === 0) return balances;
  for (const pid of playerIds) balances.set(pid, 0);
  for (const batch of chunk(playerIds, 500)) {
    const { data: txs, error: txErr } = await supabase
      .from('wallet_transactions')
      .select('player_id, amount_cents')
      .eq('club_id', clubId)
      .in('player_id', batch)
      .limit(50000);
    if (txErr) {
      const msg = String(txErr.message ?? '').toLowerCase();
      const code = String((txErr as { code?: string }).code ?? '');
      if (code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')) {
        continue;
      }
      throw txErr;
    }
    for (const tx of txs ?? []) {
      const pid = String((tx as { player_id?: string }).player_id ?? '');
      const amount = Number((tx as { amount_cents?: number }).amount_cents ?? 0);
      if (!pid || !Number.isFinite(amount)) continue;
      balances.set(pid, (balances.get(pid) ?? 0) + Math.trunc(amount));
    }
  }
  return balances;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Devuelve los player_ids con al menos una reserva en curso o futura (no cancelada) en el club. */
async function getPlayersWithCurrentBooking(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  clubId: string,
  playerIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (playerIds.length === 0) return out;
  const nowIso = new Date().toISOString();
  const { data: courts, error: cErr } = await supabase.from('courts').select('id').eq('club_id', clubId).limit(2000);
  if (cErr) throw cErr;
  const courtIds = (courts ?? []).map((c) => String((c as { id: string }).id)).filter(Boolean);
  if (courtIds.length === 0) return out;

  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id')
    .in('court_id', courtIds)
    .gte('end_at', nowIso)
    .neq('status', 'cancelled')
    .is('deleted_at', null)
    .limit(20000);
  if (bErr) throw bErr;
  const bookingIds = (bookings ?? []).map((b) => String((b as { id: string }).id)).filter(Boolean);
  if (bookingIds.length === 0) return out;

  for (const bookingBatch of chunk(bookingIds, 300)) {
    for (const playerBatch of chunk(playerIds, 500)) {
      const { data: parts, error: pErr } = await supabase
        .from('booking_participants')
        .select('player_id')
        .in('booking_id', bookingBatch)
        .in('player_id', playerBatch)
        .limit(20000);
      if (pErr) throw pErr;
      for (const row of parts ?? []) {
        const pid = String((row as { player_id: string | null }).player_id ?? '');
        if (pid) out.add(pid);
      }
    }
  }
  return out;
}

/** Devuelve los player_ids inscritos en algún torneo activo (no cancelado/expirado) del club. */
async function getPlayersWithActiveTournament(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  clubId: string,
  playerIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (playerIds.length === 0) return out;
  const { data: tournaments, error: tErr } = await supabase.from('tournaments').select('id').eq('club_id', clubId).limit(2000);
  if (tErr) {
    const msg = String(tErr.message ?? '').toLowerCase();
    const code = String((tErr as { code?: string }).code ?? '');
    if (code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')) return out;
    throw tErr;
  }
  const tournamentIds = (tournaments ?? []).map((t) => String((t as { id: string }).id)).filter(Boolean);
  if (tournamentIds.length === 0) return out;

  for (const tournamentBatch of chunk(tournamentIds, 300)) {
    for (const playerBatch of chunk(playerIds, 500)) {
      const { data: inscriptions, error: iErr } = await supabase
        .from('tournament_inscriptions')
        .select('player_id_1, player_id_2, status')
        .in('tournament_id', tournamentBatch)
        .not('status', 'in', '("cancelled","expired")')
        .limit(20000);
      if (iErr) {
        const msg = String(iErr.message ?? '').toLowerCase();
        const code = String((iErr as { code?: string }).code ?? '');
        if (code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')) return out;
        throw iErr;
      }
      const playerSet = new Set(playerBatch);
      for (const row of inscriptions ?? []) {
        const p1 = String((row as { player_id_1?: string | null }).player_id_1 ?? '');
        const p2 = String((row as { player_id_2?: string | null }).player_id_2 ?? '');
        if (p1 && playerSet.has(p1)) out.add(p1);
        if (p2 && playerSet.has(p2)) out.add(p2);
      }
    }
  }
  return out;
}

function tierToEloRange(tier: Tier): { elo_min: number; elo_max: number | null } {
  if (tier === 'vip') return { elo_min: 1750, elo_max: null };
  if (tier === 'premium') return { elo_min: 1550, elo_max: 1749 };
  if (tier === 'standard') return { elo_min: 1300, elo_max: 1549 };
  return { elo_min: -999999, elo_max: 1299 };
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
 *         description: Buscar por nombre o teléfono (opcional; no por email)
 *       - in: query
 *         name: balance_min_cents
 *         schema: { type: integer }
 *         description: Filtra clientes con saldo de monedero >= a este valor (céntimos).
 *       - in: query
 *         name: balance_max_cents
 *         schema: { type: integer }
 *         description: Filtra clientes con saldo de monedero <= a este valor (céntimos).
 *       - in: query
 *         name: has_current_booking
 *         schema: { type: boolean }
 *         description: Si es true, solo clientes con una reserva en curso o futura no cancelada en el club.
 *       - in: query
 *         name: has_tournament
 *         schema: { type: boolean }
 *         description: Si es true, solo clientes inscritos en algún torneo activo del club.
 *     responses:
 *       200:
 *         description: Lista de jugadores
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               players:
 *                 - id: "uuid"
 *                   first_name: "Ana"
 *                   last_name: "López"
 *                   email: "a@b.com"
 *                   phone: "+34…"
 *                   elo_rating: 1200
 *                   status: "active"
 *                   wallet_balance_cents: 0
 *                   segment_slug: "standard"
 *                   discount_percent: 0
 *       400: { description: Falta club_id }
 *       401: { description: Sin token }
 *       403: { description: Sin acceso al club }
 */
router.get('/', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const tier = (typeof req.query.tier === 'string' ? req.query.tier.trim() : '') as Tier | '';
  const elo_min = parseIntParam(req.query.elo_min);
  const elo_max = parseIntParam(req.query.elo_max);
  const created_from = parseIsoDateParam(req.query.created_from);
  const created_to = parseIsoDateParam(req.query.created_to);
  const has_wallet = parseBoolParam(req.query.has_wallet);
  const has_wallet_balance = parseBoolParam(req.query.has_wallet_balance);
  const balance_min_cents = parseIntParam(req.query.balance_min_cents);
  const balance_max_cents = parseIntParam(req.query.balance_max_cents);
  const has_school = parseBoolParam(req.query.has_school);
  const bookings_min = parseIntParam(req.query.bookings_min);
  const bookings_max = parseIntParam(req.query.bookings_max);
  const bookings_from = parseIsoDateParam(req.query.bookings_from);
  const bookings_to = parseIsoDateParam(req.query.bookings_to);
  const has_current_booking = parseBoolParam(req.query.has_current_booking);
  const has_tournament = parseBoolParam(req.query.has_tournament);
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id, 'clientes')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const ids = await getClubClientPlayerIds(supabase, club_id);
    if (ids.length === 0) return res.json({ ok: true, players: [] });

    let query = supabase
      .from('players')
      .select(PLAYER_LIST_FIELDS)
      .in('id', ids)
      .order('created_at', { ascending: false });

    if (created_from) query = query.gte('created_at', created_from);
    if (created_to) query = query.lte('created_at', created_to);

    if (tier && (tier === 'vip' || tier === 'premium' || tier === 'standard' || tier === 'basic')) {
      const r = tierToEloRange(tier);
      query = query.gte('elo_rating', r.elo_min);
      if (r.elo_max != null) query = query.lte('elo_rating', r.elo_max);
    }
    if (elo_min !== null) query = query.gte('elo_rating', elo_min);
    if (elo_max !== null) query = query.lte('elo_rating', elo_max);

    if (q) {
      const esc = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(`first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,phone.ilike.%${esc}%`);
      query = query.limit(60);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    let players = (data ?? []) as Array<Record<string, unknown>>;
    const playerIds = players.map((p) => String(p.id));

    if ((has_wallet !== null || has_school !== null || bookings_min !== null || bookings_max !== null) && playerIds.length > 0) {
      // wallet filter
      if (has_wallet !== null) {
        const withTx = new Set<string>();
        for (const batch of chunk(playerIds, 500)) {
          const { data: txs, error: txErr } = await supabase
            .from('wallet_transactions')
            .select('player_id')
            .eq('club_id', club_id)
            .in('player_id', batch)
            .limit(20000);
          // If wallet table doesn't exist yet, treat as no wallet activity
          if (txErr) {
            const msg = String(txErr.message ?? '').toLowerCase();
            const code = String((txErr as { code?: string }).code ?? '');
            if (code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')) {
              // empty set, handled below
            } else {
              return res.status(500).json({ ok: false, error: txErr.message });
            }
          }
          for (const row of txs ?? []) {
            const pid = String((row as { player_id: string }).player_id);
            if (pid) withTx.add(pid);
          }
        }
        players = players.filter((p) => {
          const pid = String(p.id);
          const has = withTx.has(pid);
          return has_wallet ? has : !has;
        });
      }

      // school enrollment filter (player enrolled in any school course of this club)
      if (has_school !== null && players.length > 0) {
        const currentIds = players.map((p) => String(p.id));
        const enrolled = new Set<string>();
        // Course ids for this club
        const { data: courses, error: cErr } = await supabase.from('club_school_courses').select('id').eq('club_id', club_id).limit(5000);
        if (cErr) {
          const msg = String(cErr.message ?? '').toLowerCase();
          const code = String((cErr as { code?: string }).code ?? '');
          // If school tables don't exist yet, treat as no enrollments
          if (!(code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache'))) {
            return res.status(500).json({ ok: false, error: cErr.message });
          }
        }
        const courseIds = (courses ?? []).map((c) => String((c as { id: string }).id)).filter(Boolean);
        if (courseIds.length > 0) {
          for (const courseBatch of chunk(courseIds, 250)) {
            for (const playerBatch of chunk(currentIds, 500)) {
              const { data: enr, error: eErr } = await supabase
                .from('club_school_course_enrollments')
                .select('player_id')
                .in('course_id', courseBatch)
                .in('player_id', playerBatch)
                .neq('status', 'cancelled')
                .limit(20000);
              if (eErr) {
                const msg = String(eErr.message ?? '').toLowerCase();
                const code = String((eErr as { code?: string }).code ?? '');
                if (code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')) {
                  // ignore (no enrollments)
                } else {
                  return res.status(500).json({ ok: false, error: eErr.message });
                }
              }
              for (const row of enr ?? []) {
                const pid = String((row as { player_id: string | null }).player_id ?? '');
                if (pid) enrolled.add(pid);
              }
            }
          }
        }
        players = players.filter((p) => {
          const pid = String(p.id);
          const has = enrolled.has(pid);
          return has_school ? has : !has;
        });
      }

      // bookings filter (count of bookings where player participates)
      if ((bookings_min !== null || bookings_max !== null) && players.length > 0) {
        const currentIds = players.map((p) => String(p.id));
        const fromIso =
          bookings_from ??
          (() => {
            const d = new Date();
            d.setDate(d.getDate() - 365);
            return d.toISOString();
          })();
        const toIso = bookings_to ?? new Date().toISOString();

        const { data: bookings, error: bErr } = await supabase
          .from('bookings')
          .select('id')
          .eq('club_id', club_id)
          .gte('start_at', fromIso)
          .lte('start_at', toIso)
          .neq('status', 'cancelled')
          .limit(20000);
        if (bErr) return res.status(500).json({ ok: false, error: bErr.message });
        const bookingIds = (bookings ?? []).map((b) => String((b as { id: string }).id)).filter(Boolean);

        const counts = new Map<string, number>();
        for (const pid of currentIds) counts.set(pid, 0);

        for (const bookingBatch of chunk(bookingIds, 300)) {
          for (const playerBatch of chunk(currentIds, 500)) {
            const { data: parts, error: pErr } = await supabase
              .from('booking_participants')
              .select('booking_id, player_id')
              .in('booking_id', bookingBatch)
              .in('player_id', playerBatch)
              .limit(20000);
            if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
            const seen = new Set<string>();
            for (const row of parts ?? []) {
              const pid = String((row as { player_id: string }).player_id);
              const bid = String((row as { booking_id: string }).booking_id);
              if (!pid || !bid) continue;
              const key = `${pid}:${bid}`;
              if (seen.has(key)) continue;
              seen.add(key);
              counts.set(pid, (counts.get(pid) ?? 0) + 1);
            }
          }
        }

        players = players.filter((p) => {
          const pid = String(p.id);
          const c = counts.get(pid) ?? 0;
          if (bookings_min !== null && c < bookings_min) return false;
          if (bookings_max !== null && c > bookings_max) return false;
          return true;
        });
      }
    }

    if (playerIds.length > 0) {
      const currentIds = players.map((p) => String(p.id));
      const walletBalances = await getWalletBalanceByPlayer(supabase, club_id, currentIds);
      let segmentMap = new Map<string, { segment_slug: string; discount_percent: number }>();
      try {
        segmentMap = await getClubPlayerSegmentsMap(supabase, club_id, currentIds);
      } catch {
        segmentMap = new Map();
      }
      players = players
        .filter((p) => {
          const bal = walletBalances.get(String(p.id)) ?? 0;
          if (has_wallet_balance !== null && (has_wallet_balance ? !(bal > 0) : !(bal <= 0))) return false;
          if (balance_min_cents !== null && bal < balance_min_cents) return false;
          if (balance_max_cents !== null && bal > balance_max_cents) return false;
          return true;
        })
        .map((p) => {
          const pid = String(p.id);
          const seg = segmentMap.get(pid);
          return {
            ...p,
            wallet_balance_cents: walletBalances.get(pid) ?? 0,
            ...(seg
              ? { segment_slug: seg.segment_slug, discount_percent: seg.discount_percent }
              : { segment_slug: 'standard', discount_percent: 0 }),
          };
        });
    }

    if (has_current_booking !== null && players.length > 0) {
      const currentIds = players.map((p) => String(p.id));
      const withBooking = await getPlayersWithCurrentBooking(supabase, club_id, currentIds);
      players = players.filter((p) => {
        const has = withBooking.has(String(p.id));
        return has_current_booking ? has : !has;
      });
    }

    if (has_tournament !== null && players.length > 0) {
      const currentIds = players.map((p) => String(p.id));
      const withTournament = await getPlayersWithActiveTournament(supabase, club_id, currentIds);
      players = players.filter((p) => {
        const has = withTournament.has(String(p.id));
        return has_tournament ? has : !has;
      });
    }

    return res.json({ ok: true, players });
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
router.get('/export', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const tier = (typeof req.query.tier === 'string' ? req.query.tier.trim() : '') as Tier | '';
  const elo_min = parseIntParam(req.query.elo_min);
  const elo_max = parseIntParam(req.query.elo_max);
  const created_from = parseIsoDateParam(req.query.created_from);
  const created_to = parseIsoDateParam(req.query.created_to);
  const has_wallet = parseBoolParam(req.query.has_wallet);
  const has_wallet_balance = parseBoolParam(req.query.has_wallet_balance);
  const has_school = parseBoolParam(req.query.has_school);
  const bookings_min = parseIntParam(req.query.bookings_min);
  const bookings_max = parseIntParam(req.query.bookings_max);
  const bookings_from = parseIsoDateParam(req.query.bookings_from);
  const bookings_to = parseIsoDateParam(req.query.bookings_to);
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id, 'clientes')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

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
    if (created_from) query = query.gte('created_at', created_from);
    if (created_to) query = query.lte('created_at', created_to);
    if (tier && (tier === 'vip' || tier === 'premium' || tier === 'standard' || tier === 'basic')) {
      const r = tierToEloRange(tier);
      query = query.gte('elo_rating', r.elo_min);
      if (r.elo_max != null) query = query.lte('elo_rating', r.elo_max);
    }
    if (elo_min !== null) query = query.gte('elo_rating', elo_min);
    if (elo_max !== null) query = query.lte('elo_rating', elo_max);
    if (q) {
      const esc = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(`first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,phone.ilike.%${esc}%`);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    let rows = (data ?? []) as Array<Record<string, unknown>>;
    const playerIds = rows.map((p) => String(p.id));

    // Apply same advanced filters as list (wallet/school/bookings)
    if ((has_wallet !== null || has_school !== null || bookings_min !== null || bookings_max !== null) && playerIds.length > 0) {
      if (has_wallet !== null) {
        const withTx = new Set<string>();
        for (const batch of chunk(playerIds, 500)) {
          const { data: txs, error: txErr } = await supabase
            .from('wallet_transactions')
            .select('player_id')
            .eq('club_id', club_id)
            .in('player_id', batch)
            .limit(20000);
          if (txErr) {
            const msg = String(txErr.message ?? '').toLowerCase();
            const code = String((txErr as { code?: string }).code ?? '');
            if (!(code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache'))) {
              return res.status(500).json({ ok: false, error: txErr.message });
            }
          }
          for (const row of txs ?? []) {
            const pid = String((row as { player_id: string }).player_id);
            if (pid) withTx.add(pid);
          }
        }
        rows = rows.filter((p) => {
          const pid = String(p.id);
          const has = withTx.has(pid);
          return has_wallet ? has : !has;
        });
      }

      if (has_school !== null && rows.length > 0) {
        const currentIds = rows.map((p) => String(p.id));
        const enrolled = new Set<string>();
        const { data: courses, error: cErr } = await supabase.from('club_school_courses').select('id').eq('club_id', club_id).limit(5000);
        if (cErr) {
          const msg = String(cErr.message ?? '').toLowerCase();
          const code = String((cErr as { code?: string }).code ?? '');
          if (!(code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache'))) {
            return res.status(500).json({ ok: false, error: cErr.message });
          }
        }
        const courseIds = (courses ?? []).map((c) => String((c as { id: string }).id)).filter(Boolean);
        if (courseIds.length > 0) {
          for (const courseBatch of chunk(courseIds, 250)) {
            for (const playerBatch of chunk(currentIds, 500)) {
              const { data: enr, error: eErr } = await supabase
                .from('club_school_course_enrollments')
                .select('player_id')
                .in('course_id', courseBatch)
                .in('player_id', playerBatch)
                .neq('status', 'cancelled')
                .limit(20000);
              if (eErr) {
                const msg = String(eErr.message ?? '').toLowerCase();
                const code = String((eErr as { code?: string }).code ?? '');
                if (!(code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache'))) {
                  return res.status(500).json({ ok: false, error: eErr.message });
                }
              }
              for (const row of enr ?? []) {
                const pid = String((row as { player_id: string | null }).player_id ?? '');
                if (pid) enrolled.add(pid);
              }
            }
          }
        }
        rows = rows.filter((p) => {
          const pid = String(p.id);
          const has = enrolled.has(pid);
          return has_school ? has : !has;
        });
      }

      if ((bookings_min !== null || bookings_max !== null) && rows.length > 0) {
        const currentIds = rows.map((p) => String(p.id));
        const fromIso =
          bookings_from ??
          (() => {
            const d = new Date();
            d.setDate(d.getDate() - 365);
            return d.toISOString();
          })();
        const toIso = bookings_to ?? new Date().toISOString();

        const { data: bookings, error: bErr } = await supabase
          .from('bookings')
          .select('id')
          .eq('club_id', club_id)
          .gte('start_at', fromIso)
          .lte('start_at', toIso)
          .neq('status', 'cancelled')
          .limit(20000);
        if (bErr) return res.status(500).json({ ok: false, error: bErr.message });
        const bookingIds = (bookings ?? []).map((b) => String((b as { id: string }).id)).filter(Boolean);

        const counts = new Map<string, number>();
        for (const pid of currentIds) counts.set(pid, 0);

        for (const bookingBatch of chunk(bookingIds, 300)) {
          for (const playerBatch of chunk(currentIds, 500)) {
            const { data: parts, error: pErr } = await supabase
              .from('booking_participants')
              .select('booking_id, player_id')
              .in('booking_id', bookingBatch)
              .in('player_id', playerBatch)
              .limit(20000);
            if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
            const seen = new Set<string>();
            for (const row of parts ?? []) {
              const pid = String((row as { player_id: string }).player_id);
              const bid = String((row as { booking_id: string }).booking_id);
              if (!pid || !bid) continue;
              const key = `${pid}:${bid}`;
              if (seen.has(key)) continue;
              seen.add(key);
              counts.set(pid, (counts.get(pid) ?? 0) + 1);
            }
          }
        }

        rows = rows.filter((p) => {
          const pid = String(p.id);
          const c = counts.get(pid) ?? 0;
          if (bookings_min !== null && c < bookings_min) return false;
          if (bookings_max !== null && c > bookings_max) return false;
          return true;
        });
      }
    }

    if (rows.length > 0) {
      const currentIds = rows.map((p) => String(p.id));
      const walletBalances = await getWalletBalanceByPlayer(supabase, club_id, currentIds);
      rows = rows
        .filter((p) => {
          if (has_wallet_balance === null) return true;
          const bal = walletBalances.get(String(p.id)) ?? 0;
          return has_wallet_balance ? bal > 0 : bal <= 0;
        })
        .map((p) => ({
          ...p,
          wallet_balance_cents: walletBalances.get(String(p.id)) ?? 0,
        }));
    }

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
router.post('/manual', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { club_id, first_name, last_name, phone, email } = req.body ?? {};
  const clubId = typeof club_id === 'string' ? club_id.trim() : '';
  const firstName = typeof first_name === 'string' ? first_name.trim() : '';
  const lastName = typeof last_name === 'string' ? last_name.trim() : '';
  const phoneStr = typeof phone === 'string' ? phone.trim() : '';

  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId, 'clientes')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
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

    invalidateClubClientPlayerIdsCache(clubId);
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
router.post('/send-email', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { club_id, subject, body_html, mode, player_ids } = req.body ?? {};
  const clubId = typeof club_id === 'string' ? club_id.trim() : '';
  const subjectStr = typeof subject === 'string' ? subject.trim() : '';
  const html = typeof body_html === 'string' ? body_html : '';
  const modeStr = mode === 'all' || mode === 'selected' ? mode : '';

  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId, 'clientes')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
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
router.put('/:playerId', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { playerId } = req.params;
  const { club_id, first_name, last_name, email, phone, elo_rating, status } = req.body ?? {};
  const clubId = typeof club_id === 'string' ? club_id.trim() : '';

  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio en el body' });
  if (!canAccessClub(req, clubId, 'clientes')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

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

/**
 * @openapi
 * /club-clients/{playerId}/debt:
 *   get:
 *     tags: [Club CRM]
 *     summary: Obtener deuda de un jugador en el club (CU-4.3)
 *     description: |
 *       Devuelve el saldo neto, la deuda efectiva (max(0, -net)) y los cargos
 *       `organizer_debt` individuales. Si el jugador tiene saldo positivo que
 *       cubre los cargos, `debt_cents` es 0 y `has_debt` es false.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 */
router.get('/:playerId/debt', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const playerId = String(req.params.playerId ?? '').trim();
  const club_id = String(req.query.club_id ?? '').trim();
  if (!playerId || !club_id) {
    return res.status(400).json({ ok: false, error: 'playerId y club_id son obligatorios' });
  }
  if (!canAccessClub(req, club_id, 'clientes')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const ids = await getClubClientPlayerIds(supabase, club_id);
    if (!ids.includes(playerId)) {
      return res.status(404).json({ ok: false, error: 'Este jugador no está en la cartera de clientes de este club' });
    }
    const summary = await getPlayerClubDebt(playerId, club_id);
    return res.json({ ok: true, ...summary });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-clients/{playerId}/debt/settle:
 *   post:
 *     tags: [Club CRM]
 *     summary: Registrar pago de deuda en caja (CU-4.3)
 *     description: |
 *       Admin cobra al jugador (cash o card). Admite pagos parciales. El saldo
 *       pendiente (si lo hay) queda como deuda. El bloqueo se libera
 *       automáticamente cuando el balance neto ≥ 0.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, amount_cents, method]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               amount_cents: { type: integer, minimum: 1 }
 *               method: { type: string, enum: [cash, card] }
 *               notes: { type: string }
 */
router.post('/:playerId/debt/settle', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const playerId = String(req.params.playerId ?? '').trim();
  const { club_id, amount_cents, method, notes } = req.body ?? {};

  if (!playerId || !club_id) {
    return res.status(400).json({ ok: false, error: 'playerId y club_id son obligatorios' });
  }
  if (!canAccessClub(req, String(club_id), 'clientes')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  if (typeof amount_cents !== 'number' || !Number.isInteger(amount_cents) || amount_cents <= 0) {
    return res.status(400).json({ ok: false, error: 'amount_cents debe ser un entero positivo' });
  }
  const VALID_METHODS = ['cash', 'card'];
  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ ok: false, error: `method debe ser uno de: ${VALID_METHODS.join(', ')}` });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const ids = await getClubClientPlayerIds(supabase, String(club_id));
    if (!ids.includes(playerId)) {
      return res.status(404).json({ ok: false, error: 'Este jugador no está en la cartera de clientes de este club' });
    }

    const current = await getPlayerClubDebt(playerId, String(club_id));
    if (current.debt_cents <= 0) {
      return res.status(409).json({ ok: false, error: 'El jugador no tiene deuda en este club', ...current });
    }
    if (amount_cents > current.debt_cents) {
      return res.status(400).json({
        ok: false,
        error: `El monto excede la deuda actual (${current.debt_cents} cents)`,
        debt_cents: current.debt_cents,
      });
    }

    const methodLabel = method === 'cash' ? 'efectivo' : 'tarjeta';
    const { data: tx, error: txErr } = await supabase
      .from('wallet_transactions')
      .insert({
        player_id: playerId,
        club_id,
        amount_cents,
        type: 'debt_settlement',
        concept: `Pago de deuda en caja (${methodLabel})`,
        notes: notes ? `method=${method}; ${notes}` : `method=${method}`,
        created_by_auth_id: req.authContext?.userId ?? null,
      })
      .select()
      .single();

    if (txErr) return res.status(500).json({ ok: false, error: txErr.message });

    const after = await getPlayerClubDebt(playerId, String(club_id));
    return res.status(201).json({
      ok: true,
      transaction: tx,
      debt_before_cents: current.debt_cents,
      debt_after_cents: after.debt_cents,
      net_balance_cents: after.net_balance_cents,
      still_has_debt: after.has_debt,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
