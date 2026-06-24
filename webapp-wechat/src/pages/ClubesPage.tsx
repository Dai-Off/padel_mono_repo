import { useCallback, useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { ListDataPanel } from '../components/ui/ListDataPanel';
import { ListPageShell } from '../components/ui/ListPageShell';
import { PageHeader } from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/PageLoader';
import { Pagination } from '../components/ui/Pagination';
import { SearchInput } from '../components/ui/SearchInput';
import { DEFAULT_PAGE_SIZE, paginate, totalPages } from '../lib/pagination';
import { listClubs } from '../services/clubs';
import type { Club } from '../types/api';
import { ClubRowActions } from '../components/clubes/ClubRowActions';

function ClubLogo({ club }: { club: Club }) {
    if (club.logo_url) {
        return (
            <img
                src={club.logo_url}
                alt=""
                className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-auth-border"
            />
        );
    }
    return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(241,143,52,0.12)] text-auth-accent ring-1 ring-auth-border">
            <Building2 className="h-4 w-4" />
        </div>
    );
}

export function ClubesPage() {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [clubs, setClubs] = useState<Club[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await listClubs(debouncedSearch || undefined);
            setClubs(data);
            setPage(1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudieron cargar los clubes');
            setClubs([]);
        } finally {
            setLoading(false);
            setHasLoaded(true);
        }
    }, [debouncedSearch]);

    useEffect(() => {
        void load();
    }, [load]);

    const initialLoad = loading && !hasLoaded;
    const pageCount = totalPages(clubs.length);
    const pageClubs = paginate(clubs, page);

    if (initialLoad) {
        return <PageLoader label="Cargando clubes…" />;
    }

    return (
        <ListPageShell>
            <PageHeader
                compact
                title="Clubes"
                description="Clubes activos en la plataforma con pistas visibles."
                count={loading ? undefined : clubs.length}
            />

            <div className="mb-3 shrink-0 sm:mb-4">
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Buscar por nombre, ciudad o dirección…"
                />
            </div>

            {error ? (
                <div className="mb-3 shrink-0 sm:mb-4">
                    <ErrorBanner message={error} />
                </div>
            ) : null}

            <ListDataPanel
                loading={loading}
                isEmpty={!loading && clubs.length === 0}
                emptyMessage="No se encontraron clubes."
                footer={
                    <Pagination
                        page={page}
                        total={pageCount}
                        pageSize={DEFAULT_PAGE_SIZE}
                        totalItems={clubs.length}
                        onPageChange={setPage}
                    />
                }
            >
                <table className="w-full table-fixed text-left text-sm">
                    <thead>
                        <tr className="border-b border-auth-border text-auth-secondary">
                            <th className="w-[30%] px-4 py-2.5 font-medium sm:px-6">Club</th>
                            <th className="w-[18%] px-4 py-2.5 font-medium sm:px-6">Ciudad</th>
                            <th className="w-[34%] px-4 py-2.5 font-medium sm:px-6">Dirección</th>
                            <th className="w-[18%] px-4 py-2.5 text-right font-medium sm:px-6">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pageClubs.map((club) => (
                            <tr
                                key={club.id}
                                className="h-11 border-b border-auth-border/60 last:border-0"
                            >
                                <td className="px-4 sm:px-6">
                                    <div className="flex items-center gap-2.5">
                                        <ClubLogo club={club} />
                                        <p className="truncate font-medium text-auth-text">{club.name}</p>
                                    </div>
                                </td>
                                <td className="truncate px-4 text-auth-text sm:px-6">{club.city || '—'}</td>
                                <td className="truncate px-4 text-auth-muted sm:px-6">{club.address || '—'}</td>
                                <td className="px-4 sm:px-6">
                                    <ClubRowActions club={club} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ListDataPanel>
        </ListPageShell>
    );
}
