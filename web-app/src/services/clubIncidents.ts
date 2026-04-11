import { apiFetchWithAuth } from './api';

export type IncidentType = 'late_cancel' | 'no_show' | 'damage' | 'complaint';
export type IncidentSeverity = 'low' | 'medium' | 'high';

export type ClubIncidentSubject = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
};

export type ClubIncidentBooking = {
  start_at: string;
  end_at: string;
  court_name: string | null;
} | null;

export type ClubIncidentDto = {
  id: string;
  created_at: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  resolution: string | null;
  cost_cents: number | null;
  booking_id: string | null;
  subject_player: ClubIncidentSubject;
  booking: ClubIncidentBooking;
};

export type ClubIncidentMonthSummary = {
  year: number;
  month: number;
  total: number;
  no_shows: number;
  late_cancels: number;
  players_in_alert: number;
  attendance_rate_pct: number;
  bookings_in_month: number;
  total_all_time: number;
};

export type ClubIncidentDistribution = {
  no_show: number;
  late_cancel: number;
  damage: number;
  complaint: number;
};

export type ClubIncidentPlayerRow = {
  player_id: string;
  player_name: string;
  player_phone: string;
  player_email: string;
  join_date: string | null;
  total_bookings: number;
  incidents: {
    late_cancel: number;
    no_show: number;
    damage: number;
    complaint: number;
  };
  risk_level: string;
  status: string;
};

type SummaryResponse = {
  ok: boolean;
  month: ClubIncidentMonthSummary;
  distribution: ClubIncidentDistribution;
  recent: ClubIncidentDto[];
  players: ClubIncidentPlayerRow[];
};

type ListResponse = { ok: boolean; incidents: ClubIncidentDto[] };

type CreateResponse = { ok: boolean; incident: { id: string; created_at: string } };

export const clubIncidentsService = {
  async getSummary(clubId: string): Promise<SummaryResponse> {
    const qs = new URLSearchParams({ club_id: clubId });
    return apiFetchWithAuth<SummaryResponse>(`/club-incidents/summary?${qs.toString()}`);
  },

  async list(
    clubId: string,
    opts?: { incident_type?: IncidentType; severity?: IncidentSeverity; limit?: number },
  ): Promise<ClubIncidentDto[]> {
    const qs = new URLSearchParams({ club_id: clubId });
    if (opts?.incident_type) qs.set('incident_type', opts.incident_type);
    if (opts?.severity) qs.set('severity', opts.severity);
    if (opts?.limit != null) qs.set('limit', String(opts.limit));
    const res = await apiFetchWithAuth<ListResponse>(`/club-incidents?${qs.toString()}`);
    return res.incidents ?? [];
  },

  async create(body: {
    club_id: string;
    subject_player_id: string;
    incident_type: IncidentType;
    severity: IncidentSeverity;
    description: string;
    booking_id?: string | null;
    cost_cents?: number | null;
    resolution?: string | null;
  }): Promise<CreateResponse['incident']> {
    const res = await apiFetchWithAuth<CreateResponse>('/club-incidents', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.incident;
  },
};
