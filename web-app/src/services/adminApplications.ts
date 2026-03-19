import { apiFetchWithAuth } from './api';

export type ApplicationStatus = 'pending' | 'contacted' | 'approved' | 'rejected';

export interface ClubApplication {
    id: string;
    created_at: string;
    responsible_first_name: string;
    responsible_last_name: string;
    club_name: string;
    city: string;
    country: string;
    phone: string;
    email: string;
    court_count: number;
    sport: string;
    status: ApplicationStatus;
    approved_at?: string | null;
    rejected_at?: string | null;
    rejection_reason?: string | null;
    club_owner_id?: string | null;
    club_id?: string | null;
    invitation_sent_at?: string | null;
    official_name?: string | null;
    full_address?: string | null;
    description?: string | null;
    tax_id?: string | null;
    fiscal_address?: string | null;
    courts?: unknown;
    open_time?: string | null;
    close_time?: string | null;
    slot_duration_min?: number | null;
    pricing?: unknown;
}

export interface ListApplicationsResponse {
    ok: boolean;
    applications: ClubApplication[];
    error?: string;
}

export interface ApplicationDetailResponse {
    ok: boolean;
    application: ClubApplication;
    error?: string;
}

export interface ApproveResponse {
    ok: boolean;
    message?: string;
    invite_url?: string;
    error?: string;
}

export interface RejectResponse {
    ok: boolean;
    message?: string;
    error?: string;
}

export const adminApplicationsService = {
    list: async (status?: ApplicationStatus): Promise<ClubApplication[]> => {
        const query = status ? `?status=${status}` : '';
        const res = await apiFetchWithAuth<ListApplicationsResponse>(`/club-applications${query}`);
        if (!res.ok) throw new Error((res as { error?: string }).error || 'Error al cargar');
        return res.applications;
    },

    getOne: async (id: string): Promise<ClubApplication> => {
        const res = await apiFetchWithAuth<ApplicationDetailResponse>(`/club-applications/${id}`);
        if (!res.ok || !res.application) throw new Error((res as { error?: string }).error || 'No encontrado');
        return res.application;
    },

    approve: async (id: string): Promise<{ invite_url: string }> => {
        const res = await apiFetchWithAuth<ApproveResponse>(`/club-applications/${id}/approve`, {
            method: 'POST',
        });
        if (!res.ok) throw new Error((res as { error?: string }).error || 'Error al aprobar');
        return { invite_url: res.invite_url || '' };
    },

    reject: async (id: string, reason?: string): Promise<void> => {
        const res = await apiFetchWithAuth<RejectResponse>(`/club-applications/${id}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason ?? '' }),
        });
        if (!res.ok) throw new Error((res as { error?: string }).error || 'Error al rechazar');
    },

    resendInvite: async (id: string): Promise<{ invite_url: string; message?: string }> => {
        const res = await apiFetchWithAuth<ApproveResponse>(`/club-applications/${id}/resend-invite`, {
            method: 'POST',
        });
        if (!res.ok) throw new Error((res as { error?: string }).error || 'Error al reenviar');
        return { invite_url: res.invite_url || '', message: res.message };
    },
};
