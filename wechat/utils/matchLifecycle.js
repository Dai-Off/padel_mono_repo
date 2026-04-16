/** Alineado a mobile-app/src/domain/matchLifecycle.ts */

const TERMINAL_STATUSES = new Set(['cancelled', 'finished', 'completed']);

function parseMs(iso) {
  if (iso == null || iso === '') return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function getMatchListPhase(nowMs, matchStatus, startAt, endAt) {
  const s = String(matchStatus || '').toLowerCase();
  if (TERMINAL_STATUSES.has(s)) return 'past';

  const endMs = parseMs(endAt);
  const startMs = parseMs(startAt);
  if (endMs != null && nowMs >= endMs) return 'past';
  if (startMs != null && endMs != null && nowMs >= startMs && nowMs < endMs) return 'live';
  return 'upcoming';
}

module.exports = { getMatchListPhase };
