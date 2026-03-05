import { apiFetch } from './api';

export interface ClubApplicationPayload {
    responsible_first_name: string;
    responsible_last_name: string;
    club_name: string;
    city: string;
    country: string;
    phone: string;
    email: string;
    court_count: number;
    sport: string;
    sports?: string[];
    official_name?: string;
    full_address?: string;
    description?: string;
    logo_url?: string | null;
    photo_urls?: string[];
    courts?: Array<{ id: string; name: string; type: string; covered: boolean; lighting: boolean; sport: string }>;
    open_time?: string;
    close_time?: string;
    slot_duration_min?: number;
    pricing?: Array<{ label: string; price: string }>;
    booking_window?: string;
    cancellation_policy?: string;
    tax_id?: string;
    fiscal_address?: string;
    stripe_connected?: boolean;
    selected_plan?: string;
}

export interface ClubApplicationResponse {
    ok: boolean;
    id?: string;
    message?: string;
    error?: string;
}

export interface UploadResponse {
    ok: boolean;
    url?: string;
    error?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
const base = (path: string) => `${API_BASE.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

export async function uploadClubApplicationImage(file: File): Promise<UploadResponse> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(base('/club-applications/upload'), {
        method: 'POST',
        body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al subir la imagen');
    return data;
}

export async function submitClubApplication(
    data: ClubApplicationPayload
): Promise<ClubApplicationResponse> {
    return apiFetch<ClubApplicationResponse>('/club-applications', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
