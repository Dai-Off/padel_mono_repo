export type TournamentPrizeEntry = { label: string; amount_cents: number };

const MAX_PRIZES = 20;

export function parsePrizesFromBody(raw: unknown): { ok: true; prizes: TournamentPrizeEntry[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, prizes: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'prizes debe ser un array' };
  if (raw.length > MAX_PRIZES) return { ok: false, error: `Máximo ${MAX_PRIZES} premios` };
  const prizes: TournamentPrizeEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Cada elemento de prizes debe ser un objeto' };
    const o = item as Record<string, unknown>;
    const label = String(o.label ?? '').trim();
    const n = Number(o.amount_cents ?? o.amountCents ?? 0);
    if (!label) return { ok: false, error: 'Cada premio debe incluir label (texto no vacío)' };
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'amount_cents debe ser un número ≥ 0' };
    prizes.push({ label, amount_cents: Math.min(Math.round(n), 2_000_000_000) });
  }
  return { ok: true, prizes };
}

export function sumPrizeCents(prizes: TournamentPrizeEntry[]): number {
  return prizes.reduce((s, p) => s + p.amount_cents, 0);
}
