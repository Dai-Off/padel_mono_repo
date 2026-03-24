import { apiFetchWithAuth } from './api';

export type ClubReviewSummary = {
    average: number | null;
    count: number;
    distribution: Record<string, number>;
};

export type ClubReviewListItem = {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    updated_at: string;
    player: { id: string; first_name: string; last_name: string };
};

export type ClubReviewsListResponse = {
    ok: true;
    summary: ClubReviewSummary;
    reviews: ClubReviewListItem[];
};

export async function listClubReviews(clubId: string): Promise<ClubReviewsListResponse> {
    const q = new URLSearchParams({ club_id: clubId });
    return apiFetchWithAuth<ClubReviewsListResponse>(`/club-reviews?${q.toString()}`);
}

export async function submitPlayerReview(body: {
    club_id: string;
    rating: number;
    comment?: string | null;
}): Promise<{ ok: true; review: Record<string, unknown> }> {
    return apiFetchWithAuth('/club-reviews', { method: 'POST', body: JSON.stringify(body) });
}

export async function patchPlayerReview(
    id: string,
    body: { rating?: number; comment?: string | null }
): Promise<{ ok: true; review: Record<string, unknown> }> {
    return apiFetchWithAuth(`/club-reviews/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deletePlayerReview(id: string): Promise<{ ok: true }> {
    return apiFetchWithAuth(`/club-reviews/${id}`, { method: 'DELETE' });
}
