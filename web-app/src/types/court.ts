export interface Court {
    id: string;
    club_id: string;
    name: string;
    indoor: boolean;
    glass_type: string;
    status: 'operational' | 'maintenance' | 'closed';
    lighting: boolean;
    last_maintenance: string;
}

export type CourtStatus = Court['status'];
