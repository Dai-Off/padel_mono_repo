import 'dotenv/config';
import { getSupabaseServiceRoleClient } from '../src/lib/supabase';
import { applyFriendlyPlayCounts, runLevelingPipeline } from '../src/services/levelingService';
import { runFraudCheck } from '../src/services/fraudService';

const H24_MS = 24 * 60 * 60 * 1000;
const H48_MS = 48 * 60 * 60 * 1000;

async function autoConfirmStaleScores(): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const cutoff = new Date(Date.now() - H24_MS).toISOString();
  const { data: rows, error } = await supabase
    .from('matches')
    .select('id, competitive')
    .in('score_status', ['pending_confirmation', 'disputed_pending'])
    .lt('updated_at', cutoff);
  if (error) throw new Error(error.message);
  let n = 0;
  for (const m of rows ?? []) {
    const id = (m as { id: string }).id;
    const competitive = !!(m as { competitive?: boolean }).competitive;
    const now = new Date().toISOString();
    const { data: upd } = await supabase
      .from('matches')
      .update({ score_status: 'confirmed', score_confirmed_at: now, updated_at: now })
      .eq('id', id)
      .in('score_status', ['pending_confirmation', 'disputed_pending'])
      .select('id')
      .maybeSingle();
    if (!upd) continue;
    n++;
    try {
      if (competitive) {
        await runLevelingPipeline(id);
        runFraudCheck(id).catch((e) => console.error('[fraud]', e));
      } else {
        await applyFriendlyPlayCounts(id);
      }
    } catch (e) {
      console.error('[autoConfirm match]', id, e);
      await supabase
        .from('matches')
        .update({
          score_status: 'pending_confirmation',
          score_confirmed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
  }
  return n;
}

async function expirePendingNoScore(): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const cutoffMs = Date.now() - H48_MS;
  const { data: rows, error } = await supabase
    .from('matches')
    .select('id, booking_id')
    .eq('score_status', 'pending')
    .not('booking_id', 'is', null);
  if (error) {
    console.warn('[expirePendingNoScore]', error.message);
    return 0;
  }
  let n = 0;
  for (const m of rows ?? []) {
    const id = (m as { id: string }).id;
    const bid = (m as { booking_id: string }).booking_id;
    const { data: b } = await supabase.from('bookings').select('end_time').eq('id', bid).maybeSingle();
    const endMs = b?.end_time ? new Date(String(b.end_time)).getTime() : 0;
    if (!endMs || endMs > cutoffMs) continue;
    const { data: upd } = await supabase
      .from('matches')
      .update({ score_status: 'no_result', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('score_status', 'pending')
      .select('id')
      .maybeSingle();
    if (upd) n++;
  }
  return n;
}

async function main() {
  const a = await autoConfirmStaleScores();
  const b = await expirePendingNoScore();
  console.log(JSON.stringify({ ok: true, auto_confirmed: a, expired_no_score: b }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
