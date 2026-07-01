import { useCallback, useEffect, useState } from 'react';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { ListDataPanel } from '../components/ui/ListDataPanel';
import { ListPageShell } from '../components/ui/ListPageShell';
import { PageHeader } from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/PageLoader';
import { Pagination } from '../components/ui/Pagination';
import { SearchInput } from '../components/ui/SearchInput';
import { formatDate, initialsFromName, playerDisplayName, playerStatusLabel } from '../lib/format';
import { DEFAULT_PAGE_SIZE, paginate, totalPages } from '../lib/pagination';
import { listPlayers } from '../services/players';
import type { Player } from '../types/api';
import { PlayerRowActions } from '../components/usuarios/PlayerRowActions';

const STATUS_STYLES: Record<string, string> = {
    active: 'bg-[rgba(52,211,153,0.12)] text-[#34d399]',
    blocked: 'bg-[rgba(251,191,36,0.12)] text-[#fbbf24]',
    deleted: 'bg-[rgba(227,30,36,0.12)] text-auth-error',
};

function PlayerAvatar({ player }: { player: Player }) {
    const name = playerDisplayName(player);
    if (player.avatar_url) {
        return (
            <img
                src={player.avatar_url}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-auth-border"
            />
        );
    }
    return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(241,143,52,0.15)] text-xs font-semibold text-auth-accent ring-1 ring-auth-border">
            {initialsFromName(name)}
        </div>
    );
}

export function UsuariosPage() {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [players, setPlayers] = useState<Player[]>([]);
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
            const data = await listPlayers(debouncedSearch || undefined);
            setPlayers(data);
            setPage(1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudieron cargar los usuarios');
            setPlayers([]);
        } finally {
            setLoading(false);
            setHasLoaded(true);
        }
    }, [debouncedSearch]);

    useEffect(() => {
        void load();
    }, [load]);

    const initialLoad = loading && !hasLoaded;
    const pageCount = totalPages(players.length);
    const pagePlayers = paginate(players, page);

    if (initialLoad) {
        return <PageLoader label="Cargando usuarios…" />;
    }

    return (
        <ListPageShell>
            <PageHeader
                dense
                title="Usuarios"
                description="Jugadores y cuentas registradas en la aplicación."
                count={loading ? undefined : players.length}
            />

            <div className="mb-3 shrink-0 sm:mb-4">
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Buscar por nombre, teléfono o usuario…"
                />
            </div>

            {error ? (
                <div className="mb-3 shrink-0 sm:mb-4">
                    <ErrorBanner message={error} />
                </div>
            ) : null}

            <ListDataPanel
                loading={loading}
                isEmpty={!loading && players.length === 0}
                emptyMessage="No se encontraron usuarios."
                footer={
                    <Pagination
                        page={page}
                        total={pageCount}
                        pageSize={DEFAULT_PAGE_SIZE}
                        totalItems={players.length}
                        onPageChange={setPage}
                    />
                }
            >
                <table className="w-full table-fixed text-left text-sm">
                    <thead>
                        <tr className="border-b border-auth-border text-auth-secondary">
                            <th className="w-[26%] px-4 py-2.5 font-medium sm:px-6">Usuario</th>
                            <th className="w-[30%] px-4 py-2.5 font-medium sm:px-6">Contacto</th>
                            <th className="w-[14%] px-4 py-2.5 font-medium sm:px-6">Estado</th>
                            <th className="w-[16%] px-4 py-2.5 font-medium sm:px-6">Alta</th>
                            <th className="w-[14%] px-4 py-2.5 text-right font-medium sm:px-6">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pagePlayers.map((player) => {
                            const name = playerDisplayName(player);
                            return (
                                <tr
                                    key={player.id}
                                    className="h-11 border-b border-auth-border/60 last:border-0"
                                >
                                    <td className="px-4 sm:px-6">
                                        <div className="flex items-center gap-2.5">
                                            <PlayerAvatar player={player} />
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-auth-text">{name}</p>
                                                {player.username ? (
                                                    <p className="truncate text-xs text-auth-muted">@{player.username}</p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 sm:px-6">
                                        <p className="truncate text-auth-text">{player.email ?? '—'}</p>
                                        <p className="truncate text-xs text-auth-muted">{player.phone ?? '—'}</p>
                                    </td>
                                    <td className="px-4 sm:px-6">
                                        <span
                                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                                STATUS_STYLES[player.status] ?? 'bg-[rgba(255,255,255,0.06)] text-auth-muted'
                                            }`}
                                        >
                                            {playerStatusLabel(player.status)}
                                        </span>
                                    </td>
                                    <td className="truncate px-4 text-auth-muted sm:px-6">
                                        {formatDate(player.created_at)}
                                    </td>
                                    <td className="px-4 sm:px-6">
                                        <PlayerRowActions player={player} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </ListDataPanel>
        </ListPageShell>
    );
}
