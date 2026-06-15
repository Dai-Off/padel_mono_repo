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

export type MyClubReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  club_response?: string | null;
  club_response_at?: string | null;
};

export type EligibleClubReviewItem = {
  club_id: string;
  name: string;
  city: string | null;
  can_review: boolean;
  review: MyClubReview | null;
};

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

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

export async function fetchEligibleClubReviews(
  accessToken: string,
): Promise<EligibleClubReviewItem[]> {
  try {
    const res = await fetch(`${API_URL}/club-reviews/eligible-clubs`, {
      headers: authHeaders(accessToken),
    });
    const json = (await res.json()) as { ok?: boolean; clubs?: EligibleClubReviewItem[] };
    if (!res.ok || !json.ok || !Array.isArray(json.clubs)) return [];
    return json.clubs;
  } catch {
    return [];
  }
}

export async function fetchMyClubReview(
  clubId: string,
  accessToken: string,
): Promise<{ review: MyClubReview | null; canReview: boolean }> {
  try {
    const q = new URLSearchParams({ club_id: clubId });
    const res = await fetch(`${API_URL}/club-reviews/mine?${q.toString()}`, {
      headers: authHeaders(accessToken),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      review?: MyClubReview | null;
      can_review?: boolean;
      error?: string;
    };
    if (!res.ok || !json.ok) return { review: null, canReview: false };
    return {
      review: json.review ?? null,
      canReview: Boolean(json.can_review),
    };
  } catch {
    return { review: null, canReview: false };
  }
}

export async function submitClubReview(
  accessToken: string,
  body: { club_id: string; rating: number; comment?: string | null },
): Promise<{ ok: true; review: MyClubReview } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/club-reviews`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; review?: MyClubReview; error?: string };
    if (!res.ok || !json.ok || !json.review) {
      return { ok: false, error: json.error ?? 'No se pudo guardar la reseña' };
    }
    return { ok: true, review: json.review };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function deleteMyClubReview(
  accessToken: string,
  reviewId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/club-reviews/${reviewId}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudo eliminar la reseña' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}
