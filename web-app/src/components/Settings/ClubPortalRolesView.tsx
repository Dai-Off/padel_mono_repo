import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { authService } from '../../services/auth';
import { clubService, type Club } from '../../services/club';
import type { MeResponse } from '../../types/auth';
import { PageSpinner } from '../Layout/PageSpinner';
import { ClubPortalRolesTab } from './ClubPortalRolesTab';

type Status = 'loading' | 'ready' | 'no_club';

interface ClubPortalRolesViewProps {
    initialClub?: Club | null;
}

export function ClubPortalRolesView({ initialClub }: ClubPortalRolesViewProps) {
    const [status, setStatus] = useState<Status>('loading');
    const [isAdmin, setIsAdmin] = useState(false);
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [meData, setMeData] = useState<MeResponse | null>(null);
    const [clubs, setClubs] = useState<Club[]>([]);
    const [selectedClubId, setSelectedClubId] = useState<string | null>(initialClub?.id ?? null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setStatus('loading');
            try {
                const me = await authService.getMe();
                if (cancelled) return;
                if (me.ok) setMeData(me);
                const admin = me.ok && !!me.roles?.admin_id;
                const oid = me.ok && me.roles?.club_owner_id ? me.roles.club_owner_id : null;
                setIsAdmin(admin);
                setOwnerId(oid);

                const clubsFromMe = me.ok && Array.isArray(me.clubs) ? (me.clubs as Club[]) : [];
                let list: Club[] = [];
                if (clubsFromMe.length > 0) {
                    list = clubsFromMe;
                } else if (admin) {
                    list = (await clubService.getAll()) ?? [];
                } else if (oid) {
                    list = (await clubService.getAll(oid)) ?? [];
                } else {
                    list = (await clubService.getAll()) ?? [];
                }
                if (cancelled) return;
                const clubsList = list.length > 0 ? list : initialClub ? [initialClub] : [];
                setClubs(clubsList);
                setSelectedClubId((prev) => prev ?? clubsList[0]?.id ?? null);
                setStatus(clubsList.length ? 'ready' : 'no_club');
            } catch {
                if (!cancelled) {
                    setStatus(initialClub ? 'ready' : 'no_club');
                    toast.error('No se pudo cargar el equipo del club');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [initialClub]);

    const portalForSelected = useMemo(() => {
        if (!selectedClubId || !meData?.ok) return null;
        return meData.portal_memberships?.find((p) => p.club_id === selectedClubId) ?? null;
    }, [selectedClubId, meData]);

    const canFullOwnerOrAdmin = isAdmin || !!ownerId;
    const canRoles = canFullOwnerOrAdmin || !!portalForSelected?.permissions?.includes('roles.manage');

    if (status === 'loading') return <PageSpinner />;
    if (status === 'no_club') {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
                <p className="text-sm text-gray-500">No hay club disponible.</p>
            </motion.div>
        );
    }
    if (!canRoles) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
                <p className="text-sm text-gray-500">No tienes permiso para gestionar roles e invitaciones.</p>
            </motion.div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 lg:flex-1 min-w-0">
                <h2 className="text-sm font-bold text-[#1A1A1A]">Gestión de personal</h2>
                {selectedClubId && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <ClubPortalRolesTab clubId={selectedClubId} />
                    </div>
                )}
            </motion.div>
            {clubs.length > 1 && (
                <motion.aside initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="w-full lg:w-72 flex-shrink-0">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 sticky top-4">
                        <h3 className="text-xs font-bold text-[#1A1A1A] mb-3 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            Cambiar club
                        </h3>
                        <div className="space-y-1">
                            {clubs.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setSelectedClubId(c.id)}
                                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
                                        selectedClubId === c.id
                                            ? 'bg-[#1A1A1A] text-white'
                                            : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
                                    }`}
                                >
                                    <span className="font-semibold truncate">{c.name}</span>
                                    {selectedClubId === c.id && <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.aside>
            )}
        </div>
    );
}
