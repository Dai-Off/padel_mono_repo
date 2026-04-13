import { apiFetchWithAuth } from './api';

export type SpecialDateType = 'holiday' | 'non_working';

export type ClubSpecialDate = {
    id: string;
    club_id: string;
    date: string;
    type: SpecialDateType;
    reason: string | null;
    created_at: string;
};

export async function listSpecialDates(clubId: string, year?: number): Promise<{ ok: true; dates: ClubSpecialDate[] }> {
    const q = new URLSearchParams({ club_id: clubId });
    if (year) q.set('year', String(year));
    return apiFetchWithAuth(`/club-special-dates?${q.toString()}`);
}

export async function createSpecialDate(body: {
    club_id: string;
    date: string;
    type: SpecialDateType;
    reason?: string;
}): Promise<{ ok: true; entry: ClubSpecialDate }> {
    return apiFetchWithAuth('/club-special-dates', { method: 'POST', body: JSON.stringify(body) });
}

export async function deleteSpecialDate(id: string): Promise<{ ok: true }> {
    return apiFetchWithAuth(`/club-special-dates/${id}`, { method: 'DELETE' });
}
