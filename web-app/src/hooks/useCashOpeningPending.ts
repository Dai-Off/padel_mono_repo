import { useCallback, useEffect, useState } from 'react';
import { paymentsService } from '../services/payments';
import { localDateYmd } from '../lib/localDate';

/** Dispatched on window by the cash register screen after saving an opening or a closing. */
export const CASH_SESSION_CHANGED_EVENT = 'padel:cash-session-changed';

/** Background revalidation interval while the tab stays open. */
const REVALIDATE_EVERY_MS = 3 * 60 * 1000;
/** Tick used to detect the midnight rollover and to trigger revalidation. */
const TICK_MS = 60 * 1000;

type Snapshot = {
  clubId: string | null;
  /** Operative day the snapshot refers to (local YYYY-MM-DD). */
  forDate: string;
  pending: boolean;
  /** false until the first successful answer for this club + day. */
  loaded: boolean;
  fetchedAtMs: number;
};

/**
 * Module-level state: the banner is mounted by each portal shell (dashboard, grilla,
 * precios...), so keeping it in component state would blank the banner and refetch on
 * every navigation. Revalidation is silent: `pending` only changes with a fresh answer.
 */
let snapshot: Snapshot = {
  clubId: null,
  forDate: localDateYmd(),
  pending: false,
  loaded: false,
  fetchedAtMs: 0,
};
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function setSnapshot(next: Partial<Snapshot>): void {
  snapshot = { ...snapshot, ...next };
  emit();
}

async function fetchPending(clubId: string, day: string): Promise<void> {
  try {
    const res = await paymentsService.getCashOpeningForDay(clubId, day);
    const opening = res.opening;
    const openingDay = opening?.for_date ? String(opening.for_date).slice(0, 10) : null;
    const appliesToDay = Boolean(opening) && (openingDay === null || openingDay === day);
    setSnapshot({
      clubId,
      forDate: day,
      pending: !appliesToDay,
      loaded: true,
      fetchedAtMs: Date.now(),
    });
  } catch {
    // Network/permission errors must not raise a false reminder, and must not drop a
    // known state either: keep the previous answer and retry on the next tick.
    setSnapshot({ fetchedAtMs: Date.now() });
    if (!snapshot.loaded) setSnapshot({ clubId, forDate: day, pending: false });
  }
}

/**
 * Fetches only when needed: scope change (club or day), stale data, or `force`.
 * Concurrent callers share the in-flight request.
 */
function ensureFresh(clubId: string | null | undefined, force = false): void {
  if (!clubId) return;
  const day = localDateYmd();
  const scopeChanged = snapshot.clubId !== clubId || snapshot.forDate !== day;
  const stale = Date.now() - snapshot.fetchedAtMs >= REVALIDATE_EVERY_MS;

  if (scopeChanged) {
    // A new day (or club) invalidates what we knew.
    snapshot = { clubId, forDate: day, pending: false, loaded: false, fetchedAtMs: 0 };
    emit();
  } else if (!force && !stale && snapshot.loaded) {
    return;
  }

  if (inFlight) return;
  inFlight = fetchPending(clubId, day).finally(() => {
    inFlight = null;
  });
}

export type CashOpeningPendingState = {
  loading: boolean;
  /** true when the current local day has no cash opening registered yet. */
  pending: boolean;
  /** Operative day this state refers to (local YYYY-MM-DD). */
  forDate: string;
  refresh: () => void;
};

/**
 * Whether the cash opening is still pending for today.
 *
 * Uses "no opening registered for the local day" instead of the cash session state:
 * a session is also inactive after the daily closing, and that must not raise the
 * reminder again until the next day.
 */
export function useCashOpeningPending(clubId: string | null | undefined): CashOpeningPendingState {
  const [snap, setSnap] = useState(snapshot);

  useEffect(() => {
    const listener = () => setSnap(snapshot);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    ensureFresh(clubId);
  }, [clubId]);

  useEffect(() => {
    if (!clubId) return;
    const id = window.setInterval(() => ensureFresh(clubId), TICK_MS);
    return () => window.clearInterval(id);
  }, [clubId]);

  useEffect(() => {
    if (!clubId) return;
    const onWake = () => {
      if (document.visibilityState === 'hidden') return;
      ensureFresh(clubId);
    };
    const onCashSessionChanged = () => ensureFresh(clubId, true);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener(CASH_SESSION_CHANGED_EVENT, onCashSessionChanged);
    return () => {
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener(CASH_SESSION_CHANGED_EVENT, onCashSessionChanged);
    };
  }, [clubId]);

  const refresh = useCallback(() => ensureFresh(clubId, true), [clubId]);

  const inScope = Boolean(clubId) && snap.clubId === clubId;
  return {
    loading: !inScope || !snap.loaded,
    pending: inScope && snap.loaded && snap.pending,
    forDate: snap.forDate,
    refresh,
  };
}

/** Notifies every mounted listener that the cash session state changed. */
export function notifyCashSessionChanged(): void {
  window.dispatchEvent(new CustomEvent(CASH_SESSION_CHANGED_EVENT));
}
