export interface Player {
    id: string;
    created_at: string;
    first_name: string;
    last_name: string;
    username?: string | null;
    email: string | null;
    phone: string | null;
    avatar_url?: string | null;
    elo_rating: number;
    status: 'active' | 'blocked' | 'deleted';
    onboarding_completed?: boolean;
}

export interface Club {
    id: string;
    created_at: string;
    name: string;
    description: string | null;
    address: string;
    city: string;
    postal_code: string;
    contact_phone?: string | null;
    contact_email?: string | null;
    logo_url?: string | null;
    base_currency: string;
}

export type ApiListResponse<TKey extends string, T> = {
    ok: boolean;
} & Record<TKey, T[]>;
