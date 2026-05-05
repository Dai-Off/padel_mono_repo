import { useState, useEffect } from 'react';
import { authService } from '../services/auth';

export type PortalMenuAccess = {
    /** null = dueño/admin plataforma (menú completo) */
    permissionKeys: string[] | null;
};

/**
 * Permisos del menú lateral para el club seleccionado (staff del portal vs dueño).
 */
export function usePortalMenuPermissions(clubId: string | null | undefined): PortalMenuAccess {
    const [permissionKeys, setPermissionKeys] = useState<string[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!clubId) {
                if (!cancelled) setPermissionKeys(null);
                return;
            }
            try {
                const me = await authService.getMe();
                if (cancelled || !me.ok) return;
                if (me.roles?.admin_id || me.roles?.club_owner_id) {
                    setPermissionKeys(null);
                    return;
                }
                const m = (me.portal_memberships ?? []).find((x) => x.club_id === clubId);
                setPermissionKeys(m?.permissions?.length ? m.permissions : []);
            } catch {
                if (!cancelled) setPermissionKeys([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [clubId]);

    return { permissionKeys };
}
