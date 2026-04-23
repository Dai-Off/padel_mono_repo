import { useState, useEffect } from 'react';
import { PortalTealHeader } from '../Layout/PortalTealHeader';
import { MainMenu } from '../Layout/MainMenu';
import { PageSpinner } from '../Layout/PageSpinner';
import { authService } from '../../services/auth';
import { clubService, type Club } from '../../services/club';
import { Building2, ChevronRight } from 'lucide-react';
import { GrillaQuickNav } from '../../features/grilla/components/GrillaQuickNav';
import { ClubTariffsTab } from '../Tariffs/ClubTariffsTab';

export function TarifasView() {
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
        setSelectedClubId(list[0]?.id ?? null);
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
        <div className="hidden md:block"><GrillaQuickNav isAdmin={isAdmin} /></div>
        <PageSpinner />
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
      <div className="hidden md:block"><GrillaQuickNav isAdmin={isAdmin} /></div>

      <main className="px-4 sm:px-5 py-5 pb-20">
        <div className="max-w-5xl mx-auto">

          {showClubSwitcher && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
              <h3 className="text-xs font-bold text-[#1A1A1A] mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                Club
              </h3>
              <div className="flex flex-wrap gap-2">
                {clubs.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedClubId(c.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                      selectedClubId === c.id
                        ? 'bg-[#1A1A1A] text-white'
                        : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
                    }`}
                  >
                    <span className="font-semibold">{c.name}</span>
                    {selectedClubId === c.id && <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ClubTariffsTab clubId={selectedClubId} clubResolved={!loading} />
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
