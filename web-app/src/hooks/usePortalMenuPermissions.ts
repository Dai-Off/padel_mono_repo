import { useState, useEffect } from 'react';
import { authService } from '../services/auth';

export type PortalMenuAccess = {
    /** null = dueño/admin plataforma (menú completo) */
    permissionKeys: string[] | null;
    loading: boolean;
};

// Simple global cache to avoid flash when navigating between views of the same club
const permissionCache: Record<string, string[] | null> = {};

/**
 * Permisos del menú lateral para el club seleccionado (staff del portal vs dueño).
 */
export function usePortalMenuPermissions(clubId: string | null | undefined): PortalMenuAccess {
    const [permissionKeys, setPermissionKeys] = useState<string[] | null>(() => {
        if (clubId && permissionCache[clubId] !== undefined) {
            return permissionCache[clubId];
        }
        // DEFAULT: Restricted (empty array) instead of null (which means full access)
        return [];
    });
    const [loading, setLoading] = useState(() => {
        if (clubId && permissionCache[clubId] !== undefined) {
            return false;
        }
        return true; // Always start as loading until verified
    });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Always fetch getMe to determine if the user is a platform admin
                const me = await authService.getMe();
                if (cancelled) return;

                if (!me.ok) {
                    setPermissionKeys([]);
                    setLoading(false);
                    return;
                }

                let keys: string[] | null = null;
                // Full access only for platform admins or club owners
                if (me.roles?.admin_id || me.roles?.club_owner_id) {
                    keys = null;
                } else if (clubId) {
                    // Portal role permissions for this specific club
                    const m = (me.portal_memberships ?? []).find((x) => x.club_id === clubId);
                    keys = m?.permissions?.length ? m.permissions : [];
                } else {
                    // Restricted by default if not an admin and no club selected
                    keys = [];
                }

                if (clubId) {
                    permissionCache[clubId] = keys;
                }

                if (!cancelled) {
                    setPermissionKeys(keys);
                    setLoading(false);
                }
            } catch {
                if (!cancelled) {
                    setPermissionKeys([]);
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [clubId]);

    return { permissionKeys, loading };
}
