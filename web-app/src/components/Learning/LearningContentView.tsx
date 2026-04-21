import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BookOpen, Building2, ChevronRight } from 'lucide-react';
import { PortalTealHeader } from '../Layout/PortalTealHeader';
import { MainMenu } from '../Layout/MainMenu';
import { PageSpinner } from '../Layout/PageSpinner';
import { GrillaQuickNav } from '../../features/grilla/components/GrillaQuickNav';
import { authService } from '../../services/auth';
import { clubService, type Club } from '../../services/club';
import { QuestionsTab } from './Questions/QuestionsTab';
import { CoursesTab } from './Courses/CoursesTab';

type Tab = 'questions' | 'courses';

export function LearningContentView() {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('questions');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await authService.getMe();
        if (cancelled || !me.ok) return;
        const admin = !!me.roles?.admin_id;
        const ownerId = me.roles?.club_owner_id ?? null;
        setIsAdmin(admin);

        let list: Club[] = [];
        const clubsFromMe = Array.isArray(me.clubs) ? (me.clubs as Club[]) : [];
        if (clubsFromMe.length > 0) {
          list = clubsFromMe;
        } else if (admin) {
          list = (await clubService.getAll()) ?? [];
        } else if (ownerId) {
          list = (await clubService.getAll(ownerId)) ?? [];
        }
        if (cancelled) return;

        setClubs(Array.isArray(list) ? list : []);
        const first = list.length > 0 ? list[0] : null;
        setSelectedClubId(first?.id ?? null);
      } catch {
        if (!cancelled) setClubs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedClub = clubs.find((c) => c.id === selectedClubId) ?? null;
  const showClubSwitcher = isAdmin && clubs.length > 1;

  // Estado de carga
  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans">
        <PortalTealHeader clubName="" onMenuClick={() => setIsMenuOpen(true)} />
        <div className="hidden md:block"><GrillaQuickNav isAdmin={isAdmin} /></div>
        <PageSpinner />
        <MainMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} clubName="" isAdmin={isAdmin} />
      </div>
    );
  }

  // Sin clubs
  if (clubs.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans">
        <PortalTealHeader clubName="" onMenuClick={() => setIsMenuOpen(true)} />
        <div className="hidden md:block"><GrillaQuickNav isAdmin={isAdmin} /></div>
        <main className="px-4 sm:px-5 py-12">
          <p className="text-sm text-gray-500 text-center">{t('not_found')}</p>
        </main>
        <MainMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} clubName="" isAdmin={isAdmin} />
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'questions', label: t('learning_tab_questions') },
    { key: 'courses', label: t('learning_tab_courses') },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <PortalTealHeader
        clubName={selectedClub?.name ?? clubs[0]?.name ?? ''}
        onMenuClick={() => setIsMenuOpen(true)}
      />
      <div className="hidden md:block"><GrillaQuickNav isAdmin={isAdmin} /></div>

      <main className="px-4 sm:px-5 py-5 pb-20">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Título */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-50">
              <BookOpen className="w-5 h-5 text-indigo-500" />
            </div>
            <h1 className="text-lg font-bold text-[#1A1A1A]">{t('menu_learning_content')}</h1>
          </div>

          {/* Club switcher (solo admin con múltiples clubs) */}
          {showClubSwitcher && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h3 className="text-xs font-bold text-[#1A1A1A] mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                {t('club_settings_switch_club')}
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
                    {selectedClubId === c.id && <ChevronRight className="w-4 h-4 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === tab.key
                    ? 'bg-[#1A1A1A] text-white'
                    : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Contenido del tab activo */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {selectedClubId && activeTab === 'questions' && (
              <QuestionsTab clubId={selectedClubId} />
            )}
            {selectedClubId && activeTab === 'courses' && (
              <CoursesTab clubId={selectedClubId} />
            )}
          </motion.div>
        </div>
      </main>

      <MainMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        clubName={selectedClub?.name ?? ''}
        isAdmin={isAdmin}
      />
    </div>
  );
}
