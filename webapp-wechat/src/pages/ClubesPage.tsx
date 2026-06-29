import { useState } from 'react';
import { ListPageShell } from '../components/ui/ListPageShell';
import { PageHeader } from '../components/ui/PageHeader';
import { ClubsPanel } from '../components/clubes/ClubsPanel';
import { SolicitudesPanel } from '../components/clubes/SolicitudesPanel';

type MainTab = 'clubes' | 'solicitudes';

const MAIN_TABS: { id: MainTab; label: string }[] = [
    { id: 'clubes', label: 'Clubes' },
    { id: 'solicitudes', label: 'Solicitudes de alta' },
];

export function ClubesPage() {
    const [tab, setTab] = useState<MainTab>('clubes');

    return (
        <ListPageShell>
            <PageHeader
                dense
                title="Clubes"
                description={
                    tab === 'clubes'
                        ? 'Clubes activos en la plataforma con pistas visibles.'
                        : 'Solicitudes de clubes para unirse a la plataforma. Aprobá o rechazá cada una.'
                }
            />

            <div className="mb-3 flex shrink-0 gap-1.5 sm:mb-4">
                {MAIN_TABS.map((t) => {
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                                active
                                    ? 'bg-auth-accent text-white'
                                    : 'bg-white/[0.04] text-auth-muted hover:bg-white/[0.08] hover:text-auth-text'
                            }`}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === 'clubes' ? <ClubsPanel /> : <SolicitudesPanel />}
        </ListPageShell>
    );
}
