import { apiFetchWithAuth } from './api';

export type CheckinParticipant = {
  participant_id: string;
  player_id: string;
  player_name: string;
  payment_status: string;
  is_paid: boolean;
  must_present: boolean;
};

export type CheckinBookingItem = {
  booking_id: string;
  court_id: string;
  court_name: string;
  start_at: string;
  end_at: string;
  started_at: string | null;
  started_turn: boolean;
  booking_status: string;
  participants: CheckinParticipant[];
};

type CheckinTodayResponse = {
  ok: boolean;
  date: string;
  items: CheckinBookingItem[];
};

type StartTurnResponse = {
  ok: boolean;
  booking: {
    id: string;
    started_at: string | null;
  };
};

export const checkinService = {
  async getToday(clubId: string, date?: string): Promise<CheckinBookingItem[]> {
    const params = new URLSearchParams({ club_id: clubId });
    if (date) params.set('date', date);
    const response = await apiFetchWithAuth<CheckinTodayResponse>(`/bookings/checkin/today?${params.toString()}`);
    return response.items ?? [];
  },

  async startTurn(bookingId: string): Promise<StartTurnResponse['booking']> {
    const response = await apiFetchWithAuth<StartTurnResponse>(`/bookings/${bookingId}/start-turn`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return response.booking;
  },
};
