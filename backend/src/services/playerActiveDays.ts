import type { Request } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { dayKeyInTz } from '../routes/learningTimezone';
import { isValidTimezone } from './seasonPassPeriods';

// In-process throttle: at most one write per player per (local) day.
// After a restart the upsert is a no-op thanks to the (player_id, day) PK.
const lastDayByPlayer = new Map<string, string>();

export async function touchActiveDay(playerId: string, tz: string): Promise<void> {
  const day = dayKeyInTz(new Date(), isValidTimezone(tz) ? tz : 'UTC');
  if (lastDayByPlayer.get(playerId) === day) return;
  lastDayByPlayer.set(playerId, day);
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase
      .from('player_active_days')
      .upsert({ player_id: playerId, day }, { onConflict: 'player_id,day', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } catch (e) {
    lastDayByPlayer.delete(playerId); // retry on the next request
    console.warn('[active-days] touch failed:', (e as Error).message);
  }
}

/**
 * Fire-and-forget hook for authenticated player requests. Timezone comes from
 * the request when present (mobile sends ?timezone=), UTC otherwise.
 */
export function touchActiveDayFromRequest(req: Request, playerId: string): void {
  const raw = req.query?.timezone;
  const tz = typeof raw === 'string' && raw.trim() ? raw.trim() : 'UTC';
  void touchActiveDay(playerId, tz);
}
