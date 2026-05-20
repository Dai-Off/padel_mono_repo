import { API_URL } from '../config';

export type PublicClubReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  club_response: string | null;
  club_response_at: string | null;
  player: { id: string; first_name: string; last_name: string };
};

export type PublicClubReviewsResponse = {
  ok: true;
  summary: { average: number | null; count: number };
  reviews: PublicClubReview[];
};

export async function fetchPublicClubReviews(
  clubId: string,
): Promise<PublicClubReviewsResponse | null> {
  try {
    const q = new URLSearchParams({ club_id: clubId });
    const res = await fetch(`${API_URL}/club-reviews/public?${q.toString()}`);
    const json = (await res.json()) as PublicClubReviewsResponse & { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) return null;
    return json;
  } catch {
    return null;
  }
}
