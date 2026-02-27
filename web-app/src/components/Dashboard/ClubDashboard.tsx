import { Plus } from 'lucide-react';
import { Header } from '../Layout/Header';
import { MainMenu } from '../Layout/MainMenu';
import { CourtCard } from '../Courts/CourtCard';
import { CourtForm } from '../Courts/CourtForm';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { courtService } from '../../services/court';
import type { Court } from '../../types/court';

export const ClubDashboard = () => {
    const { t } = useTranslation();
    const [courts, setCourts] = useState<Court[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [editingCourt, setEditingCourt] = useState<Court | undefined>(undefined);

    const CLUB_ID = 'club-1'; // TODO: Get from auth/context
    const CLUB_NAME = "X7 Padel Sabadell Sur";

    useEffect(() => {
        fetchCourts();
    }, []);

    const fetchCourts = async () => {
        try {
            setLoading(true);
            const data = await courtService.getAll(CLUB_ID);
            setCourts(data);
        } catch (error: any) {
            console.error('Error fetching courts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddClick = () => {
        setEditingCourt(undefined);
        setIsFormOpen(true);
    };

    const handleEditClick = (court: Court) => {
        setEditingCourt(court);
        setIsFormOpen(true);
    };

    const handleFormSubmit = async (data: Partial<Court>) => {
        try {
            if (editingCourt) {
                const updated = await courtService.update(editingCourt.id, data);
                setCourts(prev => prev.map(c => c.id === editingCourt.id ? updated : c));
            } else {
                const created = await courtService.create({ ...data, club_id: CLUB_ID });
                setCourts(prev => [...prev, created]);
            }
            setIsFormOpen(false);
        } catch (error: any) {
            console.error('Error saving court:', error);
        }
    };

    const handleDeleteClick = async (id: string) => {
        if (!confirm(t('confirm_delete'))) return;
        try {
            await courtService.delete(id);
            setCourts(prev => prev.filter(c => c.id !== id));
        } catch (error) {
            console.error('Error deleting court:', error);
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
                <div className="max-w-7xl mx-auto space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-primary">{t('title')}</h2>
                        <button
                            onClick={handleAddClick}
                            className="flex items-center gap-1.5 px-4 py-2.5 bg-brand text-brand-foreground rounded-xl text-xs font-bold shadow-sm hover:opacity-90 transition-all active:scale-95"
                        >
                            <Plus className="w-3.5 h-3.5 stroke-[3px]" />
                            {t('add_court')}
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-sm font-medium text-muted-foreground">{t('loading')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {courts.map((court) => (
                                <CourtCard
                                    key={court.id}
                                    court={court}
                                    onEdit={handleEditClick}
                                    onDelete={() => handleDeleteClick(court.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Menú Principal Fullscreen */}
            <MainMenu
                isOpen={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                clubName={CLUB_NAME}
            />

            {isFormOpen && (
                <CourtForm
                    court={editingCourt}
                    onClose={() => setIsFormOpen(false)}
                    onSubmit={handleFormSubmit}
                />
            )}
        </div>
    );
};
