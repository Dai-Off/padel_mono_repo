import { useEffect, useState } from 'react';
import { authService } from '../services/auth';
import { clubService, type Club } from '../services/club';

type ClubIdState = {
  clubId: string | null;
  /** false while the club is still being resolved (avoids flashing UI that depends on it). */
  resolved: boolean;
};

let cachedClubId: string | null | undefined;
let inFlight: Promise<string | null> | null = null;

/** Clears the module cache (call it when the session changes). */
export function clearCurrentClubIdCache(): void {
  cachedClubId = undefined;
  inFlight = null;
}

async function resolveClubId(): Promise<string | null> {
  const me = await authService.getMe();
  if (!me.ok) return null;

  // /auth/me already carries the club list for owners and portal staff.
  const clubsFromMe = Array.isArray(me.clubs) ? me.clubs : [];
  if (clubsFromMe.length > 0) return clubsFromMe[0]?.id ?? null;

  const ownerId = me.roles?.club_owner_id ?? null;
  const clubs: Club[] = ownerId ? await clubService.getAll(ownerId) : await clubService.getAll();
  return Array.isArray(clubs) && clubs.length > 0 ? clubs[0].id : null;
}

/**
 * Club of the logged-in user, resolvable outside ClubDashboard (grilla, precios, tarifas...).
 * Cached at module level so mounting it in several views costs a single request.
 */
export function useCurrentClubId(enabled = true): ClubIdState {
  const [clubId, setClubId] = useState<string | null>(cachedClubId ?? null);
  const [resolved, setResolved] = useState(cachedClubId !== undefined);

  useEffect(() => {
    if (!enabled) return;
    if (!authService.getSession()) {
      clearCurrentClubIdCache();
      setClubId(null);
      setResolved(true);
      return;
    }
    if (cachedClubId !== undefined) {
      setClubId(cachedClubId);
      setResolved(true);
      return;
    }

    let cancelled = false;
    inFlight = inFlight ?? resolveClubId();
    inFlight
      .then((id) => {
        cachedClubId = id;
        if (!cancelled) {
          setClubId(id);
          setResolved(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClubId(null);
          setResolved(true);
        }
      })
      .finally(() => {
        inFlight = null;
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { clubId, resolved };
}
