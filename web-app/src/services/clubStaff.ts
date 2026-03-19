import { apiFetchWithAuth } from './api';
import type { ClubStaffMember, ScheduleBlock } from '../types/clubStaff';

type ApiOk<T> = T & { ok: true };

export const clubStaffService = {
    list: async (clubId: string): Promise<ClubStaffMember[]> => {
        const q = new URLSearchParams({ club_id: clubId });
        const res = await apiFetchWithAuth<ApiOk<{ staff: ClubStaffMember[] }>>(`/club-staff?${q}`);
        return res.staff ?? [];
    },

    create: async (body: {
        club_id: string;
        name: string;
        password: string;
        role?: string;
        email?: string;
        phone?: string;
        schedule?: string;
        schedule_blocks?: ScheduleBlock[] | null;
        status?: 'active' | 'inactive';
    }): Promise<{ member: ClubStaffMember; email_sent?: boolean; email_error?: string }> => {
        const res = await apiFetchWithAuth<
            ApiOk<{ member: ClubStaffMember; email_sent?: boolean; email_error?: string }>
        >('/club-staff', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        return { member: res.member, email_sent: res.email_sent, email_error: res.email_error };
    },

    update: async (
        id: string,
        body: Partial<
            Pick<ClubStaffMember, 'name' | 'role' | 'email' | 'phone' | 'schedule' | 'schedule_blocks' | 'status'> & {
                password?: string;
            }
        >
    ): Promise<ClubStaffMember> => {
        const res = await apiFetchWithAuth<ApiOk<{ member: ClubStaffMember }>>(`/club-staff/${id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
        return res.member;
    },

    delete: async (id: string): Promise<void> => {
        await apiFetchWithAuth(`/club-staff/${id}`, { method: 'DELETE' });
    },
};
