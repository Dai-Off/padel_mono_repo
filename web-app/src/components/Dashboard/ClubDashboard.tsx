import { Plus } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    DragOverlay,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    rectSortingStrategy,
    arrayMove,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { Header } from '../Layout/Header';
import { MainMenu } from '../Layout/MainMenu';

// Courts
import { CourtCard } from '../Courts/CourtCard';
import { CourtDetailModal } from '../Courts/CourtDetailModal';
import { SortableCourtCard } from '../Courts/SortableCourtCard';
import { CourtForm } from '../Courts/CourtForm';
import { courtService } from '../../services/court';
import type { Court } from '../../types/court';

// Players
import { ClubPlayersTab } from '../Players/ClubPlayers';
// Settings (Editar club / Configuración)
import { ClubSettingsTab } from '../Settings/ClubSettings';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { authService } from '../../services/auth';
import { clubService, type Club } from '../../services/club';
import { PageSpinner } from '../Layout/PageSpinner';
import { ClubStaffTab } from '../Staff/ClubStaffTab';
import { InventoryControl } from '../Inventory/InventoryControl';
import { ClubSchoolTab } from '../School/ClubSchoolTab';
import { ClubPaymentsTab } from '../Payments/ClubPayments';
import { ClubCheckinTab } from './ClubDashboardExtensions';
import { ClubCashClosingTab } from '../CashClosing/ClubCashClosing';
import { ClubDashboardExtensions } from './ClubDashboardExtensions';
import { ClubReviewsTab } from './ClubReviewsTab';

export const ClubDashboard = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const isPlayersPage = location.pathname === '/jugadores';
    const isConfigPage = location.pathname === '/configuracion';
    const isPersonalPage = location.pathname === '/personal';
    const isInventoryPage = location.pathname === '/inventario';
    const isSchoolPage = location.pathname === '/escuela';
    const isPaymentsPage = location.pathname === '/pagos';
    const isCheckinPage = location.pathname === '/checkIn';
    const isCashClosingPage = location.pathname === '/cierreCaja';
    const isCrmPage = location.pathname === '/crm';
    const isResenasPage = location.pathname === '/resenas';

    const [loading, setLoading] = useState(true);
    const [clubResolved, setClubResolved] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [club, setClub] = useState<Club | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const me = await authService.getMe();
                if (cancelled || !me.ok) return;
                const admin = !!me.roles?.admin_id;
                setIsAdmin(admin);

                // Si el backend ya envía lista de clubs en /auth/me, úsala como fuente de verdad
                const clubsFromMe = Array.isArray(me.clubs) ? (me.clubs as Club[]) : [];
                if (clubsFromMe.length > 0) {
                    if (!cancelled) setClub(clubsFromMe[0]);
                    if (!cancelled) setClubResolved(true);
                    return;
                }

                // Fallback a consultas explícitas si no vienen en me.clubs
                const ownerId = me.roles?.club_owner_id ?? null;
                let clubs: Club[] = [];
                if (admin) {
                    clubs = await clubService.getAll();
                } else if (ownerId) {
                    clubs = await clubService.getAll(ownerId);
                }
                if (cancelled) return;
                const first = Array.isArray(clubs) && clubs.length > 0 ? clubs[0] : null;
                if (first) setClub(first);
            } catch {
                if (!cancelled) {
                    setIsAdmin(false);
                    setClub(null);
                }
            } finally {
                if (!cancelled) setClubResolved(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const [courts, setCourts] = useState<Court[]>([]);
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const reorderRequestSeqRef = useRef(0);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Selection/Form states
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [courtToDelete, setCourtToDelete] = useState<Court | null>(null);
    const [courtDetail, setCourtDetail] = useState<Court | null>(null);

    const fetchData = useCallback(async () => {
        if (isPlayersPage || isConfigPage || isPersonalPage || isInventoryPage || isSchoolPage || isPaymentsPage || isCheckinPage || isCashClosingPage || isCrmPage || isResenasPage) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await courtService.getAll(club?.id);
            setCourts(data);
        } catch (error) {
            console.error('Error fetching courts:', error);
        } finally {
            setLoading(false);
        }
    }, [isPlayersPage, isConfigPage, isPersonalPage, isInventoryPage, isSchoolPage, isPaymentsPage, isCheckinPage, isCashClosingPage, isCrmPage, isResenasPage, club?.id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAddClick = () => {
        setEditingItem(null);
        setIsFormOpen(true);
    };

    const handleEditClick = (item: any) => {
        setEditingItem(item);
        setIsFormOpen(true);
    };

    const handleDeleteClick = async (id: string) => {
        const court = courts.find((c) => c.id === id) ?? null;
        setCourtToDelete(court);
    };

    const handleFormSubmit = async (data: any) => {
        try {
            if (editingItem) {
                const updated = await courtService.update(editingItem.id, data);
                setCourts(prev => prev.map(c => c.id === editingItem.id ? updated : c));
            } else {
                const created = await courtService.create(data);
                setCourts(prev => [...prev, created].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)));
            }
            setIsFormOpen(false);
        } catch (error) {
            console.error('Error saving item:', error);
        }
    };

    const handleCourtsDragStart = (e: DragStartEvent) => {
        setActiveDragId(String(e.active.id));
    };

    const handleCourtsDragEnd = async (e: DragEndEvent) => {
        setActiveDragId(null);
        const { active, over } = e;
        if (!over || active.id === over.id || !club?.id) return;
        const oldIndex = courts.findIndex((c) => c.id === active.id);
        const newIndex = courts.findIndex((c) => c.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const previous = [...courts];
        const reordered = arrayMove(previous, oldIndex, newIndex);
        setCourts(reordered);
        const reqSeq = ++reorderRequestSeqRef.current;
        try {
            const saved = await courtService.reorder(club.id, reordered.map((c) => c.id));
            if (reqSeq !== reorderRequestSeqRef.current) return; // stale response from older reorder
            // Keep optimistic order to avoid visual "snap back".
            // If backend returns different ids/order, trust backend response.
            const optimisticIds = reordered.map((c) => c.id).join('|');
            const backendIds = (saved ?? []).map((c) => c.id).join('|');
            if (saved.length && optimisticIds !== backendIds) {
                setCourts(saved);
            } else if (saved.length) {
                const byId = new Map(saved.map((c) => [c.id, c]));
                setCourts((prev) => prev.map((c) => byId.get(c.id) ?? c));
            }
            window.dispatchEvent(new CustomEvent('padel:courts-reordered'));
        } catch {
            if (reqSeq !== reorderRequestSeqRef.current) return;
            toast.error(t('fetch_error'));
            setCourts(previous);
        }
    };

    // Evita spinner doble en pantallas donde el tab ya se encarga del loader (CRM y Reseñas).
    if (!club && loading && !isResenasPage && !isCrmPage) {
        return <PageSpinner />;
    }

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-brand/10 selection:text-brand">
            <Header
                clubName={club?.name ?? ''}
                isOnline={true}
                onToggleMenu={() => setIsMenuOpen(true)}
                clubLogoUrl={club?.logo_url ?? null}
            />

            <main className="px-4 sm:px-5 py-5 pb-20">
                <div className="max-w-7xl mx-auto space-y-6">
                    {isPlayersPage ? (
                        <ClubPlayersTab />
                    ) : isResenasPage ? (
                        <ClubReviewsTab clubId={club?.id ?? null} clubResolved={clubResolved} />
                    ) : isCrmPage ? (
                        <ClubDashboardExtensions clubId={club?.id ?? null} clubResolved={clubResolved} />
                    ) : isConfigPage ? (
                        <ClubSettingsTab initialClub={club} />
                    ) : isPersonalPage ? (
                        <ClubStaffTab clubId={club?.id ?? null} clubResolved={clubResolved} />
                    ) : isInventoryPage ? (
                        <InventoryControl clubId={club?.id ?? null} clubResolved={clubResolved} />
                    ) : isSchoolPage ? (
                        <ClubSchoolTab clubId={club?.id ?? null} clubResolved={clubResolved} />
                    ) : isPaymentsPage ? (
                        <ClubPaymentsTab />
                    ) : isCheckinPage ? (
                        <ClubCheckinTab />
                    ) : isCashClosingPage ? (
                        <ClubCashClosingTab />
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleAddClick}
                                        className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-[#1A1A1A] hover:bg-gray-50 active:scale-95"
                                    >
                                        {t('courts_management')}
                                    </button>
                                    {courts.length > 1 && (
                                        <span className="text-[10px] text-gray-400 max-w-[200px] leading-tight hidden sm:inline">
                                            {t('drag_order_hint')}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={handleAddClick}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#E31E24] text-white hover:opacity-90 active:scale-95"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    {t('add_court')}
                                </button>
                            </div>
                            {loading ? (
                                <PageSpinner />
                            ) : courts.length === 0 ? (
                                <p className="text-sm text-gray-500 text-center py-12">{t('no_courts')}</p>
                            ) : (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragStart={handleCourtsDragStart}
                                    onDragEnd={handleCourtsDragEnd}
                                >
                                    <SortableContext items={courts.map((c) => c.id)} strategy={rectSortingStrategy}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {courts.map((court) => (
                                                <SortableCourtCard
                                                    key={court.id}
                                                    court={court}
                                                    onEdit={handleEditClick}
                                                    onDelete={handleDeleteClick}
                                                    onViewDetails={setCourtDetail}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                    <DragOverlay dropAnimation={null}>
                                        {activeDragId ? (
                                            <div className="cursor-grabbing opacity-95 shadow-2xl rounded-2xl overflow-hidden max-w-sm">
                                                <CourtCard
                                                    court={courts.find((c) => c.id === activeDragId)!}
                                                    onEdit={() => {}}
                                                    onViewDetails={() => {}}
                                                />
                                            </div>
                                        ) : null}
                                    </DragOverlay>
                                </DndContext>
                            )}
                        </>
                    )}
                </div>
            </main>

            <MainMenu
                isOpen={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                clubName={club?.name ?? ''}
                isAdmin={isAdmin}
            />

            {!isInventoryPage && isFormOpen && (
                <CourtForm court={editingItem} onClose={() => setIsFormOpen(false)} onSubmit={handleFormSubmit} />
            )}

            <AnimatePresence>
                {!isInventoryPage && courtDetail && (
                    <CourtDetailModal
                        key={courtDetail.id}
                        court={courtDetail}
                        onClose={() => setCourtDetail(null)}
                        onEdit={handleEditClick}
                    />
                )}
            </AnimatePresence>

            {!isInventoryPage && courtToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 p-5 shadow-xl">
                        <p className="text-sm font-semibold text-[#1A1A1A] mb-2">
                            {t('confirm_delete')}
                        </p>
                        <p className="text-xs text-gray-500 mb-4">
                            {courtToDelete.name}
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setCourtToDelete(null)}
                                className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await courtService.delete(courtToDelete.id);
                                        setCourts(prev => prev.filter(c => c.id !== courtToDelete.id));
                                    } catch (error) {
                                        console.error('Error deleting item:', error);
                                    } finally {
                                        setCourtToDelete(null);
                                    }
                                }}
                                className="px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                            >
                                {t('delete_success')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
