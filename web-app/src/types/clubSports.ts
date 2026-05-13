export interface ClubSport {
    id: string;
    club_id: string;
    name: string;
    slug: string;
    allows_singles: boolean;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}
