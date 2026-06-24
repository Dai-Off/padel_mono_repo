import { apiFetch } from './api';
import type { Club } from '../types/api';

type SearchCourtResult = {
    clubId: string;
    clubName: string;
    city: string;
    address: string;
    imageUrl: string | null;
};

type SearchCourtsResponse = {
    ok?: boolean;
    results?: SearchCourtResult[];
};

function todayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function clubsFromSearchResults(results: SearchCourtResult[]): Club[] {
    const map = new Map<string, Club>();
    for (const row of results) {
        if (map.has(row.clubId)) continue;
        map.set(row.clubId, {
            id: row.clubId,
            created_at: '',
            name: row.clubName,
            description: null,
            address: row.address,
            city: row.city,
            postal_code: '',
            logo_url: row.imageUrl,
            base_currency: '',
        });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function filterClubs(clubs: Club[], query?: string): Club[] {
    const terms = String(query ?? '')
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (!terms.length) return clubs;
    return clubs.filter((club) => {
        const hay = `${club.name} ${club.city} ${club.address}`.toLowerCase();
        return terms.every((term) => hay.includes(term));
    });
}

/** Lista clubes vía GET /search/courts (público, sin tocar backend). */
export async function listClubs(query?: string): Promise<Club[]> {
    const date = todayIsoDate();
    const path = `/search/courts?date_from=${date}&date_to=${date}`;
    const response = await apiFetch<SearchCourtsResponse>(path);
    const clubs = clubsFromSearchResults(response.results ?? []);
    return filterClubs(clubs, query);
}
