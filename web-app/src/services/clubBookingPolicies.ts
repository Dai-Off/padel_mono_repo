import { ApiServiceWithAuth } from './api';

export type ClubBookingPolicies = {
    booking_window_days: number;
    cancellation_notice_hours: number;
};

export const BOOKING_WINDOW_DAY_OPTIONS = [7, 14, 21, 30, 60] as const;

export const CANCELLATION_POLICY_OPTIONS = [
    { label: 'Sin penalización', hours: 0 },
    { label: '2 horas antes', hours: 2 },
    { label: '6 horas antes', hours: 6 },
    { label: '12 horas antes', hours: 12 },
    { label: '24 horas antes', hours: 24 },
    { label: '48 horas antes', hours: 48 },
] as const;

export const REFUND_PERCENT_OPTIONS = [0, 25, 50, 75, 100] as const;

class ClubBookingPoliciesService extends ApiServiceWithAuth {
    async getByClub(clubId: string): Promise<ClubBookingPolicies> {
        const res = await super.get<{ ok?: boolean; policies: ClubBookingPolicies }>(
            `/clubs/${clubId}/booking-policies`,
        );
        return res.policies;
    }

    async update(clubId: string, policies: ClubBookingPolicies): Promise<ClubBookingPolicies> {
        const res = await this.put<{ ok?: boolean; policies: ClubBookingPolicies }>(
            `/clubs/${clubId}/booking-policies`,
            policies,
        );
        return res.policies;
    }
}

export const clubBookingPoliciesService = new ClubBookingPoliciesService();
