export interface User {
    id: string;
    email: string;
    user_metadata?: {
        full_name?: string;
        [key: string]: unknown;
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

/** Respuesta de verificación de sesión del panel de administración. */
export interface MobileAdminMeResponse {
    ok: boolean;
    user: User;
    roles: { mobile_admin_id?: string };
    error?: string;
}
