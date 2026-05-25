import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkWalletBalances,
  computeBookingStatus,
  resolveBookingChargeCents,
  upsertManualPayments,
  type BookingChargeScope,
} from './bookingManualPayment';

export type InventorySaleLineInput = {
  item_id?: string;
  quantity?: number;
  name?: string;
  unit_price_cents?: number;
};

export type BookingChargeInput = { booking_id?: string; charge_scope?: string };

export type SaleBookingChargeMeta = {
  booking_id: string;
  charge_scope: BookingChargeScope;
  amount_cents: number;
  cash_cents: number;
  wallet_cents: number;
};

export type SaleMeta = {
  player_id: string;
  payment_method: string;
  wallet_amount_cents: number;
  link_booking_id: string | null;
  booking_charges: SaleBookingChargeMeta[];
  custom_lines: Array<{ name: string; unit_price_cents: number; quantity: number }>;
};

export type ParsedSaleMovement = {
  movement_id: string;
  item_id: string;
  quantity: number;
  name: string;
  amount_cents: number;
  payment_method: string;
  voided: boolean;
};

export type LoadedSale = {
  id: string;
  club_id: string;
  player_id: string;
  payment_method: string;
  wallet_amount_cents: number;
  link_booking_id: string | null;
  currency: string;
  total_cents: number;
  voided: boolean;
  movement_at: string | null;
  lines: Array<{
    movement_id?: string;
    item_id?: string;
    custom_name?: string;
    unit_price_cents: number;
    quantity: number;
  }>;
  booking_charges: Array<{
    booking_id: string;
    charge_scope: BookingChargeScope;
    amount_cents: number;
    label?: string;
  }>;
};

const META_PREFIX = 'cart_sale_meta|';

export function buildSaleReason(parts: {
  saleId: string;
  method: string;
  lineTotal: number;
  name: string;
  bookingId: string | null;
  playerId: string;
  walletCents: number;
}): string {
  return `SALE|${parts.saleId}|${parts.method}|${parts.lineTotal}|${parts.name.replace(/\|/g, ' ')}|booking:${parts.bookingId || 'none'}|player:${parts.playerId}|wallet:${parts.walletCents}`;
}

export function parseSaleReason(reason: string): {
  saleId: string;
  method: string;
  amountCents: number;
  name: string;
  bookingId: string | null;
  playerId: string | null;
  voided: boolean;
} | null {
  const raw = reason.startsWith('VOID|') ? reason.slice(5) : reason;
  if (!raw.startsWith('SALE|')) return null;
  const parts = raw.split('|');
  const saleId = String(parts[1] ?? '');
  if (!saleId) return null;
  let bookingId: string | null = null;
  let playerId: string | null = null;
  for (const extra of parts.slice(5)) {
    if (extra.startsWith('booking:')) bookingId = extra.slice('booking:'.length) || null;
    if (extra.startsWith('player:')) playerId = extra.slice('player:'.length) || null;
  }
  return {
    saleId,
    method: String(parts[2] ?? ''),
    amountCents: Math.trunc(Number(parts[3] ?? 0)),
    name: String(parts[4] ?? 'Producto').replace(/\|/g, ' '),
    bookingId: bookingId && bookingId !== 'none' ? bookingId : null,
    playerId,
    voided: reason.startsWith('VOID|'),
  };
}

export function saleIdFromReason(reason: string): string | null {
  return parseSaleReason(reason)?.saleId ?? null;
}

export async function insertSaleMeta(
  supabase: SupabaseClient,
  clubId: string,
  saleId: string,
  meta: SaleMeta,
): Promise<void> {
  const notes = `${META_PREFIX}${saleId}|${JSON.stringify(meta)}`;
  const { error } = await supabase.from('wallet_transactions').insert({
    player_id: meta.player_id,
    club_id: clubId,
    amount_cents: 0,
    concept: 'Registro venta carrito',
    type: 'adjustment',
    booking_id: meta.link_booking_id,
    notes,
  });
  if (error) console.error('[insertSaleMeta]', error.message);
}

export async function loadSaleMeta(
  supabase: SupabaseClient,
  clubId: string,
  saleId: string,
): Promise<SaleMeta | null> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('notes')
    .eq('club_id', clubId)
    .like('notes', `${META_PREFIX}${saleId}|%`)
    .limit(1);
  if (error || !data?.[0]) return null;
  const notes = String((data[0] as { notes?: string }).notes ?? '');
  const jsonStart = notes.indexOf('|', META_PREFIX.length);
  if (jsonStart < 0) return null;
  try {
    return JSON.parse(notes.slice(jsonStart + 1)) as SaleMeta;
  } catch {
    return null;
  }
}

export async function fetchSaleById(
  supabase: SupabaseClient,
  clubId: string,
  saleId: string,
): Promise<LoadedSale | null> {
  const meta = await loadSaleMeta(supabase, clubId, saleId);

  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('id, item_id, movement_type, quantity, reason, movement_at')
    .eq('club_id', clubId)
    .eq('movement_type', 'out')
    .like('reason', `%|${saleId}|%`)
    .limit(200);

  const parsedMovements: ParsedSaleMovement[] = [];
  let voided = false;
  let movementAt: string | null = null;
  for (const row of movements ?? []) {
    const reason = String((row as any).reason ?? '');
    const parsed = parseSaleReason(reason);
    if (!parsed || parsed.saleId !== saleId) continue;
    if (parsed.voided) voided = true;
    if (!movementAt && (row as any).movement_at) movementAt = String((row as any).movement_at);
    parsedMovements.push({
      movement_id: String((row as any).id),
      item_id: String((row as any).item_id),
      quantity: Math.trunc(Number((row as any).quantity ?? 0)),
      name: parsed.name,
      amount_cents: parsed.amountCents,
      payment_method: parsed.method,
      voided: parsed.voided,
    });
  }

  const { data: storeTxs } = await supabase
    .from('payment_transactions')
    .select('amount_cents, stripe_payment_intent_id, status')
    .like('stripe_payment_intent_id', `STORE_SALE_%_${saleId}`)
    .limit(20);

  for (const tx of storeTxs ?? []) {
    if (String((tx as any).status) === 'refunded') voided = true;
  }

  const productLines: LoadedSale['lines'] = parsedMovements
    .filter((m) => !m.voided)
    .map((m) => ({
      movement_id: m.movement_id,
      item_id: m.item_id,
      unit_price_cents: m.quantity > 0 ? Math.round(m.amount_cents / m.quantity) : m.amount_cents,
      quantity: m.quantity,
    }));

  const linesFromMeta = (meta?.custom_lines ?? []).map((line) => ({
    custom_name: line.name,
    unit_price_cents: line.unit_price_cents,
    quantity: line.quantity,
  }));

  const lines = [...productLines, ...linesFromMeta];

  const bookingCharges =
    meta?.booking_charges?.map((c) => ({
      booking_id: c.booking_id,
      charge_scope: c.charge_scope,
      amount_cents: c.amount_cents,
    })) ?? [];

  const productsCents = lines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);
  const bookingsCents = bookingCharges.reduce((s, c) => s + c.amount_cents, 0);
  const totalCents = productsCents + bookingsCents;

  let playerIdFromMovements: string | null = null;
  for (const row of movements ?? []) {
    const parsed = parseSaleReason(String((row as any).reason ?? ''));
    if (parsed?.saleId === saleId && parsed.playerId) {
      playerIdFromMovements = parsed.playerId;
      break;
    }
  }

  if (!meta && lines.length === 0 && bookingCharges.length === 0) return null;

  return {
    id: saleId,
    club_id: clubId,
    player_id: meta?.player_id ?? playerIdFromMovements ?? '',
    payment_method: meta?.payment_method ?? parsedMovements[0]?.payment_method ?? 'cash',
    wallet_amount_cents: meta?.wallet_amount_cents ?? 0,
    link_booking_id: meta?.link_booking_id ?? null,
    currency: 'EUR',
    total_cents: totalCents,
    voided,
    movement_at: movementAt,
    lines,
    booking_charges: bookingCharges,
  };
}

async function reverseBookingCharge(
  supabase: SupabaseClient,
  clubId: string,
  saleId: string,
  playerId: string,
  charge: SaleBookingChargeMeta,
): Promise<string | null> {
  const { data: bookingRow, error: bFetchErr } = await supabase
    .from('bookings')
    .select('id, organizer_player_id, total_price_cents, booking_participants(player_id, role, share_amount_cents, paid_amount_cents, wallet_amount_cents, payment_method)')
    .eq('id', charge.booking_id)
    .maybeSingle();
  if (bFetchErr || !bookingRow) return bFetchErr?.message ?? 'Turno no encontrado';

  const orgId = String((bookingRow as any).organizer_player_id ?? '');
  const parts = (bookingRow as any).booking_participants ?? [];
  const byPlayer = new Map<string, any>();
  for (const p of parts) {
    if (p?.player_id) byPlayer.set(String(p.player_id), { ...p });
  }
  if (orgId && !byPlayer.has(orgId)) {
    byPlayer.set(orgId, { player_id: orgId, role: 'organizer', share_amount_cents: 0, paid_amount_cents: 0, wallet_amount_cents: 0 });
  }

  const participantRows: Array<{
    player_id: string;
    paid_amount_cents: number;
    wallet_amount_cents: number;
    payment_method: string | null;
    share_amount_cents: number;
  }> = [];

  for (const [pid, p] of byPlayer) {
    let paid = Math.trunc(Number(p.paid_amount_cents ?? 0));
    let wallet = Math.trunc(Number(p.wallet_amount_cents ?? 0));
    let method: string | null = p.payment_method ?? null;
    if (pid === playerId) {
      paid = Math.max(0, paid - charge.cash_cents);
      wallet = Math.max(0, wallet - charge.wallet_cents);
      if (paid + wallet <= 0) method = null;
    }
    participantRows.push({
      player_id: pid,
      paid_amount_cents: paid,
      wallet_amount_cents: wallet,
      payment_method: method,
      share_amount_cents: Math.trunc(Number(p.share_amount_cents ?? 0)),
    });
  }

  await upsertManualPayments(supabase, charge.booking_id, participantRows);

  const bookingTotal = Math.trunc(Number((bookingRow as any).total_price_cents ?? 0));
  const newStatus = computeBookingStatus(bookingTotal, participantRows);
  await supabase.from('bookings').update({ status: newStatus }).eq('id', charge.booking_id);

  for (const p of participantRows) {
    const isOrganizer = p.player_id === orgId;
    const updatePayload = {
      share_amount_cents: p.share_amount_cents,
      paid_amount_cents: p.paid_amount_cents,
      wallet_amount_cents: p.wallet_amount_cents,
      payment_method: p.payment_method,
      payment_status: p.paid_amount_cents + p.wallet_amount_cents > 0 ? 'paid' : 'pending',
    };
    if (isOrganizer) {
      await supabase.from('booking_participants').update(updatePayload).eq('booking_id', charge.booking_id).eq('role', 'organizer');
    } else {
      await supabase.from('booking_participants').update(updatePayload).eq('booking_id', charge.booking_id).eq('player_id', p.player_id);
    }
  }

  if (charge.wallet_cents > 0) {
    const { error: walletErr } = await supabase.from('wallet_transactions').insert({
      player_id: playerId,
      club_id: clubId,
      amount_cents: charge.wallet_cents,
      concept: `Reembolso turno (anulación venta #${saleId.slice(-6)})`,
      type: 'refund',
      booking_id: charge.booking_id,
      notes: `void_cart_sale_id=${saleId}`,
    });
    if (walletErr) return walletErr.message;
  }

  return null;
}

export async function voidInventorySale(
  supabase: SupabaseClient,
  clubId: string,
  saleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const meta = await loadSaleMeta(supabase, clubId, saleId);

  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('id, item_id, quantity, reason, movement_type')
    .eq('club_id', clubId)
    .like('reason', `%|${saleId}|%`);

  for (const row of movements ?? []) {
    const reason = String((row as any).reason ?? '');
    if (reason.startsWith('VOID|')) continue;
    const parsed = parseSaleReason(reason);
    if (!parsed || parsed.saleId !== saleId) continue;

    await supabase
      .from('inventory_movements')
      .update({ reason: `VOID|${reason}` })
      .eq('id', (row as any).id);

    await supabase.from('inventory_movements').insert({
      club_id: clubId,
      item_id: (row as any).item_id,
      movement_type: 'in',
      quantity: (row as any).quantity,
      reason: `VOID_REVERSAL|${saleId}|${parsed.name}`,
      movement_at: new Date().toISOString(),
    });
  }

  const { data: storeTxs } = await supabase
    .from('payment_transactions')
    .select('id')
    .like('stripe_payment_intent_id', `STORE_SALE_%_${saleId}`);
  for (const tx of storeTxs ?? []) {
    await supabase.from('payment_transactions').update({ status: 'refunded' }).eq('id', (tx as any).id);
  }

  const { data: walletRows } = await supabase
    .from('wallet_transactions')
    .select('id, amount_cents, notes, booking_id, player_id')
    .eq('club_id', clubId)
    .or(`notes.eq.cart_sale_id=${saleId},notes.eq.store_sale_id=${saleId}`);

  const playerId = meta?.player_id ?? '';
  for (const row of walletRows ?? []) {
    const notes = String((row as any).notes ?? '');
    if (notes.startsWith(META_PREFIX)) continue;
    if (notes.includes('void_cart_sale_id')) continue;
    const amount = Math.trunc(Number((row as any).amount_cents ?? 0));
    if (amount < 0 && playerId) {
      await supabase.from('wallet_transactions').insert({
        player_id: playerId,
        club_id: clubId,
        amount_cents: -amount,
        concept: `Reembolso tienda (anulación venta #${saleId.slice(-6)})`,
        type: 'refund',
        booking_id: (row as any).booking_id ?? null,
        notes: `void_store_sale_id=${saleId}`,
      });
    }
  }

  if (meta?.booking_charges?.length && playerId) {
    for (const charge of meta.booking_charges) {
      const err = await reverseBookingCharge(supabase, clubId, saleId, playerId, charge);
      if (err) return { ok: false, error: err };
    }
  }

  if (meta) {
    const voidNotes = `VOID|${META_PREFIX}${saleId}|${JSON.stringify(meta)}`;
    await supabase
      .from('wallet_transactions')
      .update({ notes: voidNotes })
      .eq('club_id', clubId)
      .like('notes', `${META_PREFIX}${saleId}|%`);
  }

  return { ok: true };
}

export type CreateSaleResult = {
  id: string;
  total_cents: number;
  products_cents: number;
  bookings_cents: number;
  currency: string;
  wallet_amount_cents: number;
  payment_method: string;
};

export async function createInventorySale(
  supabase: SupabaseClient,
  params: {
    clubId: string;
    saleId?: string;
    bookingId?: string;
    playerId: string;
    paymentMethod: 'cash' | 'card' | 'wallet';
    walletAmountCents?: number;
    lines: InventorySaleLineInput[];
    bookingCharges: BookingChargeInput[];
  },
): Promise<{ ok: true; sale: CreateSaleResult } | { ok: false; error: string; status?: number }> {
  const clubIdStr = params.clubId;
  const playerIdStr = params.playerId;
  const methodStr = params.paymentMethod;
  const requestedWalletCents = Math.max(0, Math.trunc(Number(params.walletAmountCents ?? 0)));
  const saleLines = params.lines
    .map((line) => ({
      item_id: String(line.item_id ?? '').trim(),
      quantity: Math.trunc(Number(line.quantity ?? 0)),
      name: String(line.name ?? '').trim(),
      unit_price_cents: Math.trunc(Number(line.unit_price_cents ?? 0)),
    }))
    .filter((line) => line.quantity > 0 && (line.item_id || line.name));

  const bookingChargeInputs = params.bookingCharges
    .map((row) => ({
      booking_id: String(row.booking_id ?? '').trim(),
      charge_scope: String(row.charge_scope ?? 'player_share').trim() as BookingChargeScope,
    }))
    .filter((row) => row.booking_id);

  const seenBookingIds = new Set<string>();
  for (const row of bookingChargeInputs) {
    if (seenBookingIds.has(row.booking_id)) {
      return { ok: false, error: 'No repitas el mismo turno en el carrito', status: 400 };
    }
    seenBookingIds.add(row.booking_id);
    if (row.charge_scope !== 'full' && row.charge_scope !== 'player_share') {
      return { ok: false, error: 'charge_scope debe ser full o player_share', status: 400 };
    }
  }

  if (saleLines.length === 0 && bookingChargeInputs.length === 0) {
    return { ok: false, error: 'Añade productos o al menos un turno a cobrar', status: 400 };
  }

  const inventorySaleLines = saleLines.filter((line) => line.item_id);
  const customSaleLines = saleLines.filter((line) => !line.item_id);
  for (const line of customSaleLines) {
    if (!line.name) return { ok: false, error: 'Nombre obligatorio para venta excepcional', status: 400 };
    if (!Number.isFinite(line.unit_price_cents) || line.unit_price_cents <= 0) {
      return { ok: false, error: 'Precio inválido para venta excepcional', status: 400 };
    }
  }

  const linkBookingIdStr =
    String(params.bookingId ?? '').trim() ||
    bookingChargeInputs[0]?.booking_id ||
    '';

  const quantitiesByItem = new Map<string, number>();
  for (const line of inventorySaleLines) {
    quantitiesByItem.set(line.item_id, (quantitiesByItem.get(line.item_id) ?? 0) + line.quantity);
  }
  const itemIds = [...quantitiesByItem.keys()];

  let itemRows: any[] = [];
  if (itemIds.length > 0) {
    const { data, error: itemErr } = await supabase
      .from('inventory_items')
      .select('id, club_id, name, status, unit_price_cents, currency')
      .eq('club_id', clubIdStr)
      .in('id', itemIds);
    if (itemErr) return { ok: false, error: itemErr.message, status: 500 };
    itemRows = data ?? [];
  }
  if ((itemRows ?? []).length !== itemIds.length) {
    return { ok: false, error: 'Uno o más productos no existen', status: 404 };
  }

  const itemById = new Map((itemRows ?? []).map((item: any) => [String(item.id), item]));
  const inactive = [...itemById.values()].find((item: any) => item.status !== 'active');
  if (inactive) return { ok: false, error: `Producto inactivo: ${inactive.name}`, status: 400 };

  let movementRows: any[] = [];
  if (itemIds.length > 0) {
    const { data, error: movementErr } = await supabase
      .from('inventory_movements')
      .select('item_id, movement_type, quantity')
      .eq('club_id', clubIdStr)
      .in('item_id', itemIds);
    if (movementErr) return { ok: false, error: movementErr.message, status: 500 };
    movementRows = data ?? [];
  }

  const stockByItem = new Map<string, number>();
  for (const movement of movementRows ?? []) {
    const itemId = String((movement as any).item_id ?? '');
    const qty = Math.trunc(Number((movement as any).quantity ?? 0));
    if (!itemId || !Number.isFinite(qty)) continue;
    const sign = String((movement as any).movement_type ?? '') === 'out' ? -1 : 1;
    stockByItem.set(itemId, (stockByItem.get(itemId) ?? 0) + sign * qty);
  }

  for (const [itemId, qty] of quantitiesByItem) {
    const available = stockByItem.get(itemId) ?? 0;
    if (available < qty) {
      const item = itemById.get(itemId) as any;
      return { ok: false, error: `Stock insuficiente para ${item?.name ?? 'producto'} (${available} disponible)`, status: 400 };
    }
  }

  const resolvedCharges: Array<{ bookingId: string; scope: BookingChargeScope; amountCents: number; currency: string }> = [];
  for (const input of bookingChargeInputs) {
    const resolved = await resolveBookingChargeCents(supabase, input.booking_id, playerIdStr, input.charge_scope);
    if ('error' in resolved) return { ok: false, error: resolved.error, status: 400 };
    if (resolved.clubId !== clubIdStr) {
      return { ok: false, error: 'El turno no pertenece a este club', status: 400 };
    }
    resolvedCharges.push({
      bookingId: input.booking_id,
      scope: input.charge_scope,
      amountCents: resolved.amountCents,
      currency: resolved.currency,
    });
  }

  const saleId = params.saleId ?? `${Date.now()}`;
  const movementAt = new Date().toISOString();
  let productsCents = 0;
  let bookingsCents = 0;
  let currency = 'EUR';

  const inventoryLineTotals: Array<{ itemId: string; lineTotal: number; item: any; quantity: number }> = [];
  for (const [itemId, quantity] of quantitiesByItem) {
    const item = itemById.get(itemId) as any;
    const lineInput = inventorySaleLines.find((l) => l.item_id === itemId);
    const unitPrice = lineInput?.unit_price_cents && lineInput.unit_price_cents > 0
      ? lineInput.unit_price_cents
      : Math.max(0, Math.trunc(Number(item.unit_price_cents ?? 0)));
    const lineTotal = unitPrice * quantity;
    productsCents += lineTotal;
    currency = String(item.currency ?? currency) || currency;
    inventoryLineTotals.push({ itemId, lineTotal, item, quantity });
  }

  const customLinesMeta: SaleMeta['custom_lines'] = [];
  for (const line of customSaleLines) {
    const lineTotal = line.unit_price_cents * line.quantity;
    productsCents += lineTotal;
    customLinesMeta.push({ name: line.name, unit_price_cents: line.unit_price_cents, quantity: line.quantity });
  }

  for (const charge of resolvedCharges) {
    bookingsCents += charge.amountCents;
    currency = charge.currency || currency;
  }

  const grandTotalCents = productsCents + bookingsCents;

  let walletDebitCents = 0;
  let cashCardMethod = methodStr;
  if (methodStr === 'wallet' || requestedWalletCents > 0) {
    const { data: walletRows, error: walletSumErr } = await supabase
      .from('wallet_transactions')
      .select('amount_cents')
      .eq('player_id', playerIdStr)
      .eq('club_id', clubIdStr);
    if (walletSumErr) {
      return { ok: false, error: 'El jugador no tiene saldo bono disponible', status: 400 };
    }
    const balanceCents = (walletRows ?? []).reduce((acc, row) => acc + Number((row as { amount_cents?: number }).amount_cents ?? 0), 0);
    if (balanceCents <= 0 && (methodStr === 'wallet' || requestedWalletCents > 0)) {
      return { ok: false, error: 'El jugador no tiene saldo bono disponible', status: 400 };
    }
    const targetWallet =
      methodStr === 'wallet' && requestedWalletCents <= 0
        ? grandTotalCents
        : requestedWalletCents > 0
          ? requestedWalletCents
          : 0;
    walletDebitCents = Math.min(targetWallet, grandTotalCents, balanceCents);
    if (walletDebitCents <= 0 && (methodStr === 'wallet' || requestedWalletCents > 0)) {
      return { ok: false, error: 'Saldo bono insuficiente para esta compra', status: 400 };
    }
    const remainderCents = grandTotalCents - walletDebitCents;
    if (remainderCents > 0) {
      if (methodStr !== 'cash' && methodStr !== 'card') {
        return { ok: false, error: 'Saldo bono insuficiente. Elige efectivo o tarjeta para el resto.', status: 400 };
      }
      cashCardMethod = methodStr;
    } else if (grandTotalCents > 0) {
      cashCardMethod = 'wallet';
    }
  }

  const saleMethodLabel =
    walletDebitCents > 0 && walletDebitCents < grandTotalCents
      ? `${cashCardMethod}+wallet`
      : walletDebitCents >= grandTotalCents && grandTotalCents > 0
        ? 'wallet'
        : cashCardMethod;

  let walletRemaining = walletDebitCents;
  const bookingWalletById = new Map<string, number>();
  const bookingCashById = new Map<string, number>();
  const bookingChargeMeta: SaleBookingChargeMeta[] = [];
  for (const charge of resolvedCharges) {
    const chargeWallet = Math.min(charge.amountCents, walletRemaining);
    walletRemaining -= chargeWallet;
    bookingWalletById.set(charge.bookingId, chargeWallet);
    bookingCashById.set(charge.bookingId, charge.amountCents - chargeWallet);
    bookingChargeMeta.push({
      booking_id: charge.bookingId,
      charge_scope: charge.scope,
      amount_cents: charge.amountCents,
      cash_cents: charge.amountCents - chargeWallet,
      wallet_cents: chargeWallet,
    });
  }
  const productsWalletCents = Math.min(productsCents, walletRemaining);
  walletRemaining -= productsWalletCents;
  const productsCashCents = productsCents - productsWalletCents;

  const movementInserts = inventoryLineTotals.map(({ itemId, lineTotal, item, quantity }) => ({
    club_id: clubIdStr,
    item_id: itemId,
    movement_type: 'out' as const,
    quantity,
    reason: buildSaleReason({
      saleId,
      method: saleMethodLabel,
      lineTotal,
      name: String(item.name ?? ''),
      bookingId: linkBookingIdStr || null,
      playerId: playerIdStr,
      walletCents: productsWalletCents,
    }),
    movement_at: movementAt,
  }));

  if (movementInserts.length > 0) {
    const { error: insertErr } = await supabase.from('inventory_movements').insert(movementInserts);
    if (insertErr) return { ok: false, error: insertErr.message, status: 500 };
  }

  const customTotalCents = customLinesMeta.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);
  const customCashCardCents = Math.max(0, customTotalCents - Math.min(productsWalletCents, customTotalCents));
  if (customCashCardCents > 0 && cashCardMethod !== 'wallet') {
    const { error: txErr } = await supabase.from('payment_transactions').insert({
      booking_id: linkBookingIdStr || null,
      payer_player_id: playerIdStr,
      amount_cents: customCashCardCents,
      currency,
      stripe_payment_intent_id: `STORE_SALE_${cashCardMethod}_${saleId}`,
      status: 'succeeded',
    });
    if (txErr) return { ok: false, error: txErr.message, status: 500 };
  }

  for (const charge of resolvedCharges) {
    const chargeWallet = bookingWalletById.get(charge.bookingId) ?? 0;
    const chargeCash = bookingCashById.get(charge.bookingId) ?? 0;
    const payMethod =
      chargeWallet > 0 && chargeCash > 0
        ? cashCardMethod
        : chargeWallet >= charge.amountCents
          ? 'wallet'
          : cashCardMethod;

    const { data: bookingRow, error: bFetchErr } = await supabase
      .from('bookings')
      .select('id, organizer_player_id, total_price_cents, booking_participants(player_id, role, share_amount_cents, paid_amount_cents, wallet_amount_cents, payment_method)')
      .eq('id', charge.bookingId)
      .maybeSingle();
    if (bFetchErr || !bookingRow) {
      return { ok: false, error: bFetchErr?.message ?? 'Turno no encontrado', status: 500 };
    }

    const orgId = String((bookingRow as any).organizer_player_id ?? '');
    const parts = (bookingRow as any).booking_participants ?? [];
    const byPlayer = new Map<string, any>();
    for (const p of parts) {
      if (p?.player_id) byPlayer.set(String(p.player_id), p);
    }
    if (orgId && !byPlayer.has(orgId)) {
      byPlayer.set(orgId, { player_id: orgId, role: 'organizer', share_amount_cents: 0, paid_amount_cents: 0, wallet_amount_cents: 0 });
    }

    const participantRows: Array<{
      player_id: string;
      paid_amount_cents: number;
      wallet_amount_cents: number;
      payment_method: string | null;
      share_amount_cents: number;
    }> = [];

    for (const [pid, p] of byPlayer) {
      const existingPaid = Math.trunc(Number(p.paid_amount_cents ?? 0));
      const existingWallet = Math.trunc(Number(p.wallet_amount_cents ?? 0));
      let paid = existingPaid;
      let wallet = existingWallet;
      let method: string | null = p.payment_method ?? null;
      if (pid === playerIdStr) {
        paid += chargeCash;
        wallet += chargeWallet;
        method = chargeWallet >= charge.amountCents ? 'wallet' : payMethod;
      }
      participantRows.push({
        player_id: pid,
        paid_amount_cents: paid,
        wallet_amount_cents: wallet,
        payment_method: method,
        share_amount_cents: Math.trunc(Number(p.share_amount_cents ?? 0)),
      });
    }

    if (!participantRows.some((p) => p.player_id === playerIdStr)) {
      participantRows.push({
        player_id: playerIdStr,
        paid_amount_cents: chargeCash,
        wallet_amount_cents: chargeWallet,
        payment_method: chargeWallet >= charge.amountCents ? 'wallet' : payMethod,
        share_amount_cents: 0,
      });
    }

    const walletCheck = await checkWalletBalances(supabase, clubIdStr, [
      { player_id: playerIdStr, wallet_amount_cents: chargeWallet, payment_method: chargeWallet > 0 ? 'wallet' : null },
    ]);
    if (!walletCheck.ok) return { ok: false, error: walletCheck.error, status: 400 };

    await upsertManualPayments(supabase, charge.bookingId, participantRows);

    const bookingTotal = Math.trunc(Number((bookingRow as any).total_price_cents ?? 0));
    const newStatus = computeBookingStatus(bookingTotal, participantRows);
    await supabase.from('bookings').update({ status: newStatus }).eq('id', charge.bookingId);

    for (const p of participantRows) {
      const isOrganizer = p.player_id === orgId;
      const updatePayload = {
        share_amount_cents: p.share_amount_cents,
        paid_amount_cents: p.paid_amount_cents,
        wallet_amount_cents: p.wallet_amount_cents,
        payment_method: p.payment_method,
        payment_status: p.paid_amount_cents + p.wallet_amount_cents > 0 ? 'paid' : 'pending',
      };
      if (isOrganizer) {
        await supabase.from('booking_participants').update(updatePayload).eq('booking_id', charge.bookingId).eq('role', 'organizer');
      } else {
        await supabase.from('booking_participants').update(updatePayload).eq('booking_id', charge.bookingId).eq('player_id', p.player_id);
      }
    }

    if (chargeWallet > 0) {
      const { error: walletErr } = await supabase.from('wallet_transactions').insert({
        player_id: playerIdStr,
        club_id: clubIdStr,
        amount_cents: -chargeWallet,
        concept: `Pago turno #${charge.bookingId.slice(0, 8)}`,
        type: 'debit',
        booking_id: charge.bookingId,
        notes: `cart_sale_id=${saleId}`,
      });
      if (walletErr) return { ok: false, error: walletErr.message, status: 500 };
    }
  }

  if (productsWalletCents > 0) {
    const { error: walletErr } = await supabase.from('wallet_transactions').insert({
      player_id: playerIdStr,
      club_id: clubIdStr,
      amount_cents: -productsWalletCents,
      concept: `Compra tienda #${saleId.slice(-6)}`,
      type: 'debit',
      booking_id: linkBookingIdStr || null,
      notes: `store_sale_id=${saleId}`,
    });
    if (walletErr) return { ok: false, error: walletErr.message, status: 500 };
  }

  await insertSaleMeta(supabase, clubIdStr, saleId, {
    player_id: playerIdStr,
    payment_method: saleMethodLabel,
    wallet_amount_cents: walletDebitCents,
    link_booking_id: linkBookingIdStr || null,
    booking_charges: bookingChargeMeta,
    custom_lines: customLinesMeta,
  });

  return {
    ok: true,
    sale: {
      id: saleId,
      total_cents: grandTotalCents,
      products_cents: productsCents,
      bookings_cents: bookingsCents,
      currency,
      wallet_amount_cents: walletDebitCents,
      payment_method: saleMethodLabel,
    },
  };
}
