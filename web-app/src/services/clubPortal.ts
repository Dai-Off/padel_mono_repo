import { apiFetchWithAuth, apiFetch } from './api';
import type { AuthResponse } from '../types/auth';

export type PortalPermissionKey =
    | 'club.manage'
    | 'roles.manage'
    | 'grilla'
    | 'clientes'
    | 'finanzas'
    | 'torneos'
    | 'escuela'
    | 'gestion'
    | 'configuracion';

export type PortalRoleRow = {
    id: string;
    club_id: string;
    name: string;
    slug: string;
    is_system: boolean;
    created_at: string;
    permission_keys: string[];
};

export type PortalMemberRow = {
    id: string;
    club_id: string;
    auth_user_id: string;
    club_portal_role_id: string;
    created_at: string;
    email: string | null;
    role_name: string | null;
    role_slug: string | null;
};

export type PortalInviteRow = {
    id: string;
    club_id: string;
    email: string;
    club_portal_role_id: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    created_at: string;
    role_name?: string | null;
};

export const clubPortalService = {
    permissionCatalog: async (): Promise<{ key: string; label: string }[]> => {
        const res = await apiFetchWithAuth<{ ok: true; permissions: { key: string; label: string }[] }>(
            '/club-portal/permission-catalog'
        );
        return res.permissions ?? [];
    },

    listRoles: async (clubId: string): Promise<PortalRoleRow[]> => {
        const res = await apiFetchWithAuth<{ ok: true; roles: PortalRoleRow[] }>(
            `/club-portal/roles?club_id=${encodeURIComponent(clubId)}`
        );
        return res.roles ?? [];
    },

    createRole: async (body: {
        club_id: string;
        name: string;
        permission_keys: PortalPermissionKey[];
    }): Promise<PortalRoleRow> => {
        const res = await apiFetchWithAuth<{ ok: true; role: PortalRoleRow }>('/club-portal/roles', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        return res.role;
    },

    updateRole: async (
        id: string,
        body: { name?: string; permission_keys: PortalPermissionKey[] }
    ): Promise<PortalRoleRow> => {
        const res = await apiFetchWithAuth<{ ok: true; role: PortalRoleRow }>(`/club-portal/roles/${id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
        return res.role;
    },

    deleteRole: async (id: string): Promise<void> => {
        await apiFetchWithAuth(`/club-portal/roles/${id}`, { method: 'DELETE' });
    },

    listMembers: async (clubId: string): Promise<PortalMemberRow[]> => {
        const res = await apiFetchWithAuth<{ ok: true; members: PortalMemberRow[] }>(
            `/club-portal/members?club_id=${encodeURIComponent(clubId)}`
        );
        return res.members ?? [];
    },

    removeMember: async (id: string): Promise<void> => {
        await apiFetchWithAuth(`/club-portal/members/${id}`, { method: 'DELETE' });
    },

    updateMemberRole: async (id: string, club_portal_role_id: string): Promise<PortalMemberRow> => {
        const res = await apiFetchWithAuth<{ ok: true; member: PortalMemberRow }>(`/club-portal/members/${id}/role`, {
            method: 'PUT',
            body: JSON.stringify({ club_portal_role_id }),
        });
        return res.member;
    },

    listInvites: async (clubId: string): Promise<PortalInviteRow[]> => {
        const res = await apiFetchWithAuth<{ ok: true; invites: PortalInviteRow[] }>(
            `/club-portal/invites?club_id=${encodeURIComponent(clubId)}`
        );
        return res.invites ?? [];
    },

    createInvite: async (body: {
        club_id: string;
        email: string;
        club_portal_role_id: string;
    }): Promise<{
        ok: true;
        invite_url?: string;
        expires_at?: string;
        email_sent?: boolean;
        email_error?: string;
    }> => {
        return apiFetchWithAuth('/club-portal/invites', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    },

    revokeInvite: async (id: string): Promise<void> => {
        await apiFetchWithAuth(`/club-portal/invites/${id}/revoke`, { method: 'POST' });
    },

    validateInviteToken: async (
        token: string
    ): Promise<{
        ok: true;
        email: string;
        club_id: string;
        club_name: string;
        role_name: string;
        expires_at: string;
    }> => {
        return apiFetch(
            `/club-portal/invites/validate?token=${encodeURIComponent(token)}`
        );
    },

    acceptInvite: async (token: string): Promise<{ ok: true; club_id: string }> => {
        return apiFetchWithAuth('/auth/accept-club-portal-invite', {
            method: 'POST',
            body: JSON.stringify({ token }),
        });
    },

    registerFromInvite: async (body: {
        token: string;
        password: string;
        name?: string;
    }): Promise<AuthResponse & { club_id?: string }> => {
        return apiFetch('/auth/register-from-club-portal-invite', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    },
};
