export interface User {
    id: string;
    email: string;
    user_metadata?: {
        full_name?: string;
        [key: string]: any;
    };
}

export interface Session {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
}

export interface AuthResponse {
    ok: boolean;
    user: User | null;
    session: Session | null;
    error?: string;
}

export interface PortalMembershipDto {
    club_id: string;
    club_portal_role_id: string;
    role_name: string;
    role_slug: string;
    permissions: string[];
}

export interface MeResponse {
    ok: boolean;
    user: User;
    roles: { player_id?: string; club_owner_id?: string; admin_id?: string };
    clubs?: Array<
        { id: string } & Record<string, any>
    >;
    portal_memberships?: PortalMembershipDto[];
    error?: string;
}
