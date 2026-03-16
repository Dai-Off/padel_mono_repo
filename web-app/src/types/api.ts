export interface Player {
    id: string;
    created_at: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    elo_rating: number;
    status: 'active' | 'blocked' | 'deleted';
    auth_user_id?: string | null;
}

export interface ClubOwner {
    id: string;
    created_at: string;
    name: string;
    email: string;
    phone: string | null;
    stripe_connect_account_id: string;
    kyc_status: string;
    status: string;
}

export interface Club {
    id: string;
    created_at: string;
    owner_id: string;
    fiscal_tax_id: string;
    fiscal_legal_name: string;
    name: string;
    description: string | null;
    address: string;
    city: string;
    postal_code: string;
    lat: number | null;
    lng: number | null;
    base_currency: string;
    weekly_schedule?: any;
    schedule_exceptions?: any[];
}

export interface Booking {
    id: string;
    created_at: string;
    court_id: string;
    organizer_player_id: string;
    start_at: string;
    end_at: string;
    timezone: string;
    total_price_cents: number;
    currency: string;
    status: 'pending' | 'confirmed' | 'cancelled';
}

export interface Match {
    id: string;
    created_at: string;
    booking_id: string;
    visibility: 'public' | 'private';
    elo_min: number | null;
    elo_max: number | null;
    gender: string;
    competitive: boolean;
    status: 'open' | 'full' | 'cancelled';
}

export interface ApiResponse<T> {
    ok: boolean;
    data?: T;
    error?: string;
    [key: string]: any; // Para soportar el formato { ok: true, players: [...] }
}
