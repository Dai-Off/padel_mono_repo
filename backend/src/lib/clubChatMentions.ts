import type { SupabaseClient } from '@supabase/supabase-js';

export const CLUB_MENTION_REGEX = /(^|\s)@club\b/i;

export function messageMentionsClub(message: string): boolean {
  return CLUB_MENTION_REGEX.test(String(message ?? '').trim());
}

type InsertMentionParams = {
  clubId: string;
  sourceType: 'booking' | 'court' | 'tournament';
  bookingId?: string | null;
  courtId?: string | null;
  tournamentId?: string | null;
  sourceMessageId: string;
  authorUserId: string;
  authorName: string;
  message: string;
};

export async function insertClubChatMention(
  supabase: SupabaseClient,
  p: InsertMentionParams
): Promise<void> {
  if (!messageMentionsClub(p.message)) return;
  const row: Record<string, unknown> = {
    club_id: p.clubId,
    source_type: p.sourceType,
    source_message_id: p.sourceMessageId,
    author_user_id: p.authorUserId,
    author_name: p.authorName,
    message: p.message,
    booking_id: null,
    court_id: null,
    tournament_id: null,
  };
  if (p.sourceType === 'booking') {
    row.booking_id = p.bookingId ?? null;
  } else if (p.sourceType === 'court') {
    row.court_id = p.courtId ?? null;
  } else {
    row.tournament_id = p.tournamentId ?? null;
  }
  const { error } = await supabase.from('club_chat_mentions').insert(row);
  if (error) throw new Error(error.message);
}
