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
import { useLocation } from 'react-router-dom';
import { authService } from '../../services/auth';

export const ClubDashboard = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const isPlayersPage = location.pathname === '/jugadores';
    const isConfigPage = location.pathname === '/configuracion';

    const [loading, setLoading] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        authService.getMe().then((me) => {
            if (me.ok && me.roles?.admin_id) setIsAdmin(true);
        }).catch(() => {});
    }, []);

    const [courts, setCourts] = useState<Court[]>([]);

    // Selection/Form states
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    const CLUB_NAME = "Club Padel Grilla";

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
        if (!confirm(t('confirm_delete'))) return;
        try {
            await courtService.delete(id);
            setCourts(prev => prev.filter(c => c.id !== id));
        } catch (error) {
            console.error('Error deleting item:', error);
        }
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

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-brand/10 selection:text-brand">
            <Header
                clubName={CLUB_NAME}
                isOnline={true}
                onToggleMenu={() => setIsMenuOpen(true)}
            />

            <main className="px-4 sm:px-5 py-5 pb-20">
                <div className="max-w-7xl mx-auto space-y-6">
                    {isPlayersPage ? (
                        <ClubPlayersTab />
                    ) : isConfigPage ? (
                        <ClubSettingsTab />
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-[#1A1A1A]">{t('courts_management')}</h2>
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

            <MainMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} clubName={CLUB_NAME} isAdmin={isAdmin} />

            {isFormOpen && (
                <CourtForm court={editingItem} onClose={() => setIsFormOpen(false)} onSubmit={handleFormSubmit} />
            )}
        </div>
    );
};
