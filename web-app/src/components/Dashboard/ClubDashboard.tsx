import { Plus } from 'lucide-react';
import { Header } from '../Layout/Header';
import { MainMenu } from '../Layout/MainMenu';

// Courts
import { CourtCard } from '../Courts/CourtCard';
import { CourtForm } from '../Courts/CourtForm';
import { courtService } from '../../services/court';
import type { Court } from '../../types/court';

// Players
import { ClubPlayersTab } from '../Players/ClubPlayers';
// Settings (Editar club / Configuración)
import { ClubSettingsTab } from '../Settings/ClubSettings';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth';
import { clubService, type Club } from '../../services/club';
import { PageSkeleton } from '../Layout/PageSkeleton';

export const ClubDashboard = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const isPlayersPage = location.pathname === '/jugadores';
    const isConfigPage = location.pathname === '/configuracion';

    const [loading, setLoading] = useState(true);
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
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const [courts, setCourts] = useState<Court[]>([]);

    // Selection/Form states
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [courtToDelete, setCourtToDelete] = useState<Court | null>(null);

    const fetchData = useCallback(async () => {
        if (isPlayersPage || isConfigPage) return;
        setLoading(true);
        try {
            const data = await courtService.getAll();
            setCourts(data);
        } catch (error) {
            console.error('Error fetching courts:', error);
        } finally {
            setLoading(false);
        }
    }, [isPlayersPage, isConfigPage]);

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
                setCourts(prev => [...prev, created]);
            }
            setIsFormOpen(false);
        } catch (error) {
            console.error('Error saving item:', error);
        }
    };

    if (!club && loading) {
        return <PageSkeleton />;
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
                    ) : isConfigPage ? (
                        <ClubSettingsTab />
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
                                    <button
                                        type="button"
                                        onClick={() => navigate('/grilla')}
                                        className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-[#1A1A1A] hover:bg-gray-50 active:scale-95"
                                    >
                                        Ver grilla
                                    </button>
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
                                <div className="flex flex-col items-center justify-center py-24 gap-4">
                                    <div className="w-12 h-12 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
                                    <p className="text-sm font-semibold text-gray-500 animate-pulse">{t('loading')}...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {courts.map((court) => (
                                        <CourtCard
                                            key={court.id}
                                            court={court}
                                            onEdit={handleEditClick}
                                            onDelete={handleDeleteClick}
                                        />
                                    ))}
                                </div>
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

            {isFormOpen && (
                <CourtForm court={editingItem} onClose={() => setIsFormOpen(false)} onSubmit={handleFormSubmit} />
            )}

            {courtToDelete && (
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
