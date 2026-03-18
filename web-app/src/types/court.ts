export interface Court {
    id: string;
    created_at?: string;
    club_id: string;
    display_order?: number;
    name: string;
    indoor: boolean;
    glass_type: string;
    status: 'operational' | 'maintenance' | 'closed';
    lighting?: boolean;
    last_maintenance?: string | null;
}

export type CourtStatus = Court['status'];
