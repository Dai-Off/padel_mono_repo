export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type ScheduleBlock = {
    days: Weekday[];
    from: string; // HH:mm
    to: string; // HH:mm
};

export type ClubStaffMember = {
    id: string;
    club_id: string;
    name: string;
    role: string;
    email: string | null;
    phone: string | null;
    schedule: string | null;
    schedule_blocks: ScheduleBlock[] | null;
    status: 'active' | 'inactive';
    created_at: string;
    updated_at: string;
};
