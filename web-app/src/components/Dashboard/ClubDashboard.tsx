import { Plus } from 'lucide-react';
import { Header } from '../Layout/Header';
import { MainMenu } from '../Layout/MainMenu';
import { TabSwitcher } from '../Common/TabSwitcher';

// Courts
import { CourtCard } from '../Courts/CourtCard';
import { CourtForm } from '../Courts/CourtForm';
import { courtService } from '../../services/court';
import type { Court } from '../../types/court';

// Clubs
import { ClubCard } from '../Clubs/ClubCard';
import { ClubForm } from '../Clubs/ClubForm';
import { clubService, type Club } from '../../services/club';

// Owners
import { OwnerCard } from '../Owners/OwnerCard';
import { OwnerForm } from '../Owners/OwnerForm';
import { clubOwnerService, type ClubOwner } from '../../services/clubOwner';

// Players
import { ClubPlayersTab } from '../Players/ClubPlayers';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth';

type TabId = 'courts' | 'clubs' | 'owners' | 'players';

export const ClubDashboard = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTab, setActiveTabState] = useState<TabId>(() =>
        location.pathname === '/jugadores' ? 'players' : 'courts'
    );

    useEffect(() => {
        if (location.pathname === '/jugadores') setActiveTabState('players');
    }, [location.pathname]);

    const setActiveTab = (id: TabId) => {
        setActiveTabState(id);
        if (id === 'players') navigate('/jugadores');
        else navigate('/');
    };
    const [loading, setLoading] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        authService.getMe().then((me) => {
            if (me.ok && me.roles?.admin_id) setIsAdmin(true);
        }).catch(() => {});
    }, []);

    // Data states
    const [courts, setCourts] = useState<Court[]>([]);
    const [clubs, setClubs] = useState<Club[]>([]);
    const [owners, setOwners] = useState<ClubOwner[]>([]);

    // Selection/Form states
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    const CLUB_NAME = "Club Padel Grilla";

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (activeTab === 'courts') {
                const data = await courtService.getAll();
                setCourts(data);
            } else if (activeTab === 'clubs') {
                const data = await clubService.getAll();
                setClubs(data);
            } else if (activeTab === 'owners') {
                const data = await clubOwnerService.getAll();
                setOwners(data);
            }
        } catch (error) {
            console.error(`Error fetching ${activeTab}:`, error);
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

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
            if (activeTab === 'courts') {
                await courtService.delete(id);
                setCourts(prev => prev.filter(c => c.id !== id));
            } else if (activeTab === 'clubs') {
                await clubService.delete(id);
                setClubs(prev => prev.filter(c => c.id !== id));
            } else if (activeTab === 'owners') {
                await clubOwnerService.delete(id);
                setOwners(prev => prev.filter(o => o.id !== id));
            }
        } catch (error) {
            console.error('Error deleting item:', error);
        }
    };

    const handleFormSubmit = async (data: any) => {
        try {
            if (activeTab === 'courts') {
                if (editingItem) {
                    const updated = await courtService.update(editingItem.id, data);
                    setCourts(prev => prev.map(c => c.id === editingItem.id ? updated : c));
                } else {
                    const created = await courtService.create(data);
                    setCourts(prev => [...prev, created]);
                }
            } else if (activeTab === 'clubs') {
                if (editingItem) {
                    const updated = await clubService.update(editingItem.id, data);
                    setClubs(prev => prev.map(c => c.id === editingItem.id ? updated : c));
                } else {
                    const created = await clubService.create(data);
                    setClubs(prev => [...prev, created]);
                }
            } else if (activeTab === 'owners') {
                if (editingItem) {
                    const updated = await clubOwnerService.update(editingItem.id, data);
                    setOwners(prev => prev.map(o => o.id === editingItem.id ? updated : o));
                } else {
                    const created = await clubOwnerService.create(data);
                    setOwners(prev => [...prev, created]);
                }
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <TabSwitcher
                            tabs={[
                                { id: 'courts', label: t('tabs_courts') },
                                { id: 'clubs', label: t('tabs_clubs') },
                                { id: 'owners', label: t('tabs_owners') },
                                { id: 'players', label: t('tabs_players') },
                            ]}
                            activeTab={activeTab}
                            onTabChange={(id) => setActiveTab(id as TabId)}
                        />
                        {activeTab !== 'players' && (
                            <button
                                onClick={handleAddClick}
                                className={`w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                                    activeTab === 'courts'
                                        ? 'bg-[#E31E24] text-white hover:opacity-90'
                                        : 'bg-brand text-brand-foreground shadow-lg shadow-brand/20 hover:opacity-90'
                                }`}
                            >
                                <Plus className="w-3.5 h-3.5" />
                                {activeTab === 'courts' ? t('add_court') : activeTab === 'clubs' ? t('add_club') : t('add_owner')}
                            </button>
                        )}
                    </div>

                    {activeTab === 'players' ? (
                        <ClubPlayersTab />
                    ) : (
                        <>
                            {activeTab === 'courts' && (
                                <div className="flex items-center justify-between">
                                    <h2 className="text-sm font-bold text-[#1A1A1A]">{t('courts_management')}</h2>
                                </div>
                            )}
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-24 gap-4">
                                    <div className="w-12 h-12 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
                                    <p className="text-sm font-semibold text-gray-500 animate-pulse">{t('loading')}...</p>
                                </div>
                            ) : (
                                <div className={`grid ${activeTab === 'courts' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'}`}>
                                    {activeTab === 'courts' && courts.map((court) => (
                                        <CourtCard
                                            key={court.id}
                                            court={court}
                                            onEdit={handleEditClick}
                                            onDelete={handleDeleteClick}
                                        />
                                    ))}
                                    {activeTab === 'clubs' && clubs.map(club => (
                                        <ClubCard key={club.id} club={club} onEdit={handleEditClick} onDelete={handleDeleteClick} />
                                    ))}
                                    {activeTab === 'owners' && owners.map(owner => (
                                        <OwnerCard key={owner.id} owner={owner} onEdit={handleEditClick} onDelete={handleDeleteClick} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>

            <MainMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} clubName={CLUB_NAME} isAdmin={isAdmin} />

            {/* Forms Layer */}
            {isFormOpen && activeTab === 'courts' && (
                <CourtForm court={editingItem} onClose={() => setIsFormOpen(false)} onSubmit={handleFormSubmit} />
            )}
            {isFormOpen && activeTab === 'clubs' && (
                <ClubForm club={editingItem} onClose={() => setIsFormOpen(false)} onSubmit={handleFormSubmit} />
            )}
            {isFormOpen && activeTab === 'owners' && (
                <OwnerForm owner={editingItem} onClose={() => setIsFormOpen(false)} onSubmit={handleFormSubmit} />
            )}
        </div>
    );
};
