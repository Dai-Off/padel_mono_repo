export type CourtVisibilityWindow = {
    days_of_week: number[];
    start_minutes: number;
    end_minutes: number;
};

export interface Court {
    id: string;
    created_at?: string;
    club_id: string;
    display_order?: number;
    name: string;
    /** Deporte principal de la pista (filtros app / tarifas). */
    sport?: 'padel' | 'tenis' | 'pickleball' | 'otro' | string;
    indoor: boolean;
    glass_type: string;
    status: 'operational' | 'maintenance' | 'closed';
    lighting?: boolean;
    last_maintenance?: string | null;
    is_hidden?: boolean;
    allow_payment_after_play?: boolean;
    visibility_windows?: CourtVisibilityWindow[] | null;
}

export type CourtStatus = Court['status'];
