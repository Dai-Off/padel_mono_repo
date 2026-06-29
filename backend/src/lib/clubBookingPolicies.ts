import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_CLUB_CANCELLATION_HOURS, resolveClubCancellationNoticeHours } from './bookingCancellationPolicy';

export const BOOKING_WINDOW_DAY_OPTIONS = [7, 14, 21, 30, 60] as const;

export const CANCELLATION_HOUR_OPTIONS = [
  { label: 'Sin penalización', hours: 0 },
  { label: '2 horas antes', hours: 2 },
  { label: '6 horas antes', hours: 6 },
  { label: '12 horas antes', hours: 12 },
  { label: '24 horas antes', hours: 24 },
  { label: '48 horas antes', hours: 48 },
] as const;

export const DEFAULT_BOOKING_WINDOW_DAYS = 7;

export function parseBookingWindowDays(text: string | null | undefined): number | null {
  const raw = String(text ?? '').trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/(\d+)/);
  if (!match) return null;
  const days = parseInt(match[1], 10);
  if (!Number.isFinite(days) || days < 1 || days > 365) return null;
  return days;
}

export function parseCancellationPolicyHours(text: string | null | undefined): number | null {
  const raw = String(text ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('sin penal')) return 0;
  const match = raw.match(/(\d+)/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  if (!Number.isFinite(hours) || hours < 0) return null;
  return hours;
}

export type ClubBookingPolicies = {
  booking_window_days: number;
  cancellation_notice_hours: number;
};

export async function getClubBookingPolicies(
  supabase: SupabaseClient,
  clubId: string,
): Promise<ClubBookingPolicies> {
  const { data: club, error } = await supabase
    .from('clubs')
    .select('booking_window_days, cancellation_notice_hours')
    .eq('id', clubId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!club) throw new Error('Club no encontrado');

  const windowDays = (club as { booking_window_days?: number | null }).booking_window_days;
  const noticeHours = await resolveClubCancellationNoticeHours(supabase, clubId);

  return {
    booking_window_days:
      windowDays != null && Number.isFinite(Number(windowDays))
        ? Math.trunc(Number(windowDays))
        : DEFAULT_BOOKING_WINDOW_DAYS,
    cancellation_notice_hours: noticeHours,
  };
}

export async function saveClubBookingPolicies(
  supabase: SupabaseClient,
  clubId: string,
  policies: ClubBookingPolicies,
): Promise<ClubBookingPolicies> {
  const windowDays = Math.min(365, Math.max(1, Math.trunc(policies.booking_window_days)));
  const noticeHours = Math.max(0, Math.trunc(policies.cancellation_notice_hours));

  const { error: clubErr } = await supabase
    .from('clubs')
    .update({
      booking_window_days: windowDays,
      cancellation_notice_hours: noticeHours,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clubId);
  if (clubErr) throw new Error(clubErr.message);

  return getClubBookingPolicies(supabase, clubId);
}

export async function seedClubBookingPoliciesFromApplication(
  supabase: SupabaseClient,
  clubId: string,
  application: {
    booking_window?: string | null;
    cancellation_policy?: string | null;
  },
): Promise<void> {
  const bookingWindowDays =
    parseBookingWindowDays(application.booking_window) ?? DEFAULT_BOOKING_WINDOW_DAYS;
  const noticeHours =
    parseCancellationPolicyHours(application.cancellation_policy) ??
    DEFAULT_CLUB_CANCELLATION_HOURS;

  await saveClubBookingPolicies(supabase, clubId, {
    booking_window_days: bookingWindowDays,
    cancellation_notice_hours: noticeHours,
  });
}
