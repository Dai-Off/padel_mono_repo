import { useState, useEffect } from 'react';
import { PortalTealHeader } from '../Layout/PortalTealHeader';
import { MainMenu } from '../Layout/MainMenu';
import { PageSpinner } from '../Layout/PageSpinner';
import { authService } from '../../services/auth';
import { clubService, type Club } from '../../services/club';
import { Building2, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PreciosForm } from './PreciosForm';

export function PreciosView() {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans">
        <PortalTealHeader clubName="" onMenuClick={() => setIsMenuOpen(true)} />
        <PageSpinner />
        <MainMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} clubName="" isAdmin={isAdmin} />
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans">
        <PortalTealHeader clubName="" onMenuClick={() => setIsMenuOpen(true)} />
        <main className="px-4 sm:px-5 py-12">
          <p className="text-sm text-gray-500 text-center">{t('not_found')}</p>
        </main>
        <MainMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} clubName="" isAdmin={isAdmin} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <PortalTealHeader
        clubName={selectedClub?.name ?? clubs[0]?.name ?? ''}
        onMenuClick={() => setIsMenuOpen(true)}
      />

      <main className="px-4 sm:px-5 py-5 pb-20">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-bold text-[#1A1A1A] mb-4">
            {t('reservation_type_prices_title')}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {t('reservation_type_prices_desc')}
          </p>

          {showClubSwitcher && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
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

          <PreciosForm clubId={selectedClubId} />
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
