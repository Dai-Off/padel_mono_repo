import { apiFetchWithAuth } from './api';

export type BookingChatMessageRow = {
  id: string;
  created_at: string;
  author_user_id: string;
  author_name: string;
  message: string;
};

export type ClubChatMentionRow = {
  id: string;
  created_at: string;
  source_type: 'booking' | 'court' | 'tournament';
  booking_id: string | null;
  court_id: string | null;
  tournament_id: string | null;
  source_message_id: string;
  author_user_id: string;
  author_name: string;
  message: string;
};

export type ChatSummaryBooking = {
  id: string;
  court_id: string;
  court_name: string;
  start_at: string;
  end_at: string;
  reservation_type: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_author: string | null;
};

export type ChatSummaryTournament = {
  id: string;
  name: string | null;
  description: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_author: string | null;
};

export type ChatSummary = {
  bookings: ChatSummaryBooking[];
  tournaments: ChatSummaryTournament[];
  mentions: ClubChatMentionRow[];
};

export const clubChatsService = {
  async getSummary(clubId: string): Promise<ChatSummary> {
    const res = await apiFetchWithAuth<{ ok: true } & ChatSummary>(
      `/clubs/${encodeURIComponent(clubId)}/chat-summary`,
    );
    return {
      bookings: res.bookings ?? [],
      tournaments: res.tournaments ?? [],
      mentions: res.mentions ?? [],
    };
  },

  async listBookingChat(bookingId: string): Promise<BookingChatMessageRow[]> {
    const res = await apiFetchWithAuth<{ ok: true; messages: BookingChatMessageRow[] }>(
      `/bookings/${encodeURIComponent(bookingId)}/chat`,
    );
    return res.messages ?? [];
  },

  async sendBookingChat(bookingId: string, message: string): Promise<BookingChatMessageRow> {
    const res = await apiFetchWithAuth<{ ok: true; message: BookingChatMessageRow }>(
      `/bookings/${encodeURIComponent(bookingId)}/chat`,
      { method: 'POST', body: JSON.stringify({ message }) },
    );
    return res.message;
  },

  async listMentions(clubId: string): Promise<ClubChatMentionRow[]> {
    const res = await apiFetchWithAuth<{ ok: true; mentions: ClubChatMentionRow[] }>(
      `/clubs/${encodeURIComponent(clubId)}/chat-mentions`,
    );
    return res.mentions ?? [];
  },
};
