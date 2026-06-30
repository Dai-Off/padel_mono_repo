import { useCallback, useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { ErrorBanner } from '../ui/ErrorBanner';
import { ListDataPanel } from '../ui/ListDataPanel';
import { ApplicationDetailModal } from '../solicitudes/ApplicationDetailModal';
import {
    adminApplicationsService,
    type ApplicationStatus,
    type ClubApplication,
} from '../../services/adminApplications';

const STATUS_ALL = 'all';

const STATUS_TABS: { id: string; label: string }[] = [
    { id: STATUS_ALL, label: 'Todas' },
    { id: 'pending', label: 'Pendientes' },
    { id: 'contacted', label: 'Contactadas' },
    { id: 'approved', label: 'Aprobadas' },
    { id: 'rejected', label: 'Rechazadas' },
];

const statusBadge: Record<ApplicationStatus, string> = {
    pending: 'bg-amber-500/15 text-amber-300',
    contacted: 'bg-blue-500/15 text-blue-300',
    approved: 'bg-emerald-500/15 text-emerald-300',
    rejected: 'bg-red-500/15 text-red-300',
};

const statusLabel: Record<ApplicationStatus, string> = {
    pending: 'Pendiente',
    contacted: 'Contactado',
    approved: 'Aprobado',
    rejected: 'Rechazado',
};

/** Solicitudes de alta de clubes (pestaña dentro de la página Clubes). */
export function SolicitudesPanel() {
    const [applications, setApplications] = useState<ClubApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>(STATUS_ALL);
    const [selected, setSelected] = useState<ClubApplication | null>(null);

    const load = useCallback(
        async (opts?: { silent?: boolean }) => {
            const silent = opts?.silent === true;
            if (!silent) setLoading(true);
            setError(null);
            try {
                const status = statusFilter === STATUS_ALL ? undefined : (statusFilter as ApplicationStatus);
                const data = await adminApplicationsService.list(status);
                setApplications(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes');
                setApplications([]);
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [statusFilter],
    );

    useEffect(() => {
        void load();
    }, [load]);

    // Mantener el detalle abierto sincronizado con la lista refrescada.
    useEffect(() => {
        if (!selected) return;
        const fresh = applications.find((a) => a.id === selected.id);
        if (fresh && fresh !== selected) setSelected(fresh);
    }, [applications, selected]);

    const handleApprove = (id: string) => adminApplicationsService.approve(id);
    const handleReject = async (id: string, reason?: string) => {
        await adminApplicationsService.reject(id, reason);
        await load({ silent: true });
    };

    return (
        <>
            <div className="mb-3 flex shrink-0 flex-wrap gap-1.5 sm:mb-4">
                {STATUS_TABS.map((tab) => {
                    const active = statusFilter === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setStatusFilter(tab.id)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                active
                                    ? 'bg-white/10 text-auth-text'
                                    : 'bg-white/[0.03] text-auth-secondary hover:bg-white/[0.06] hover:text-auth-muted'
                            }`}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {error ? (
                <div className="mb-3 shrink-0 sm:mb-4">
                    <ErrorBanner message={error} />
                </div>
            ) : null}

            <ListDataPanel
                loading={loading}
                isEmpty={!loading && applications.length === 0}
                emptyMessage="No hay solicitudes para este filtro."
            >
                <div className="modal-scroll min-h-0 flex-1 overflow-y-auto">
                    <table className="w-full table-fixed text-left text-sm">
                        <thead className="sticky top-0 bg-auth-card">
                            <tr className="border-b border-auth-border text-auth-secondary">
                                <th className="w-[28%] px-4 py-2.5 font-medium sm:px-6">Club</th>
                                <th className="w-[24%] px-4 py-2.5 font-medium sm:px-6">Responsable</th>
                                <th className="w-[24%] px-4 py-2.5 font-medium sm:px-6">Ubicación</th>
                                <th className="w-[24%] px-4 py-2.5 font-medium sm:px-6">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {applications.map((app) => (
                                <tr
                                    key={app.id}
                                    onClick={() => setSelected(app)}
                                    className="h-12 cursor-pointer border-b border-auth-border/60 transition last:border-0 hover:bg-white/[0.03]"
                                >
                                    <td className="px-4 sm:px-6">
                                        <div className="flex items-center gap-2.5">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(241,143,52,0.12)] text-auth-accent ring-1 ring-auth-border">
                                                <Building2 className="h-4 w-4" />
                                            </div>
                                            <p className="truncate font-medium text-auth-text">{app.club_name}</p>
                                        </div>
                                    </td>
                                    <td className="truncate px-4 text-auth-muted sm:px-6">
                                        {app.responsible_first_name} {app.responsible_last_name}
                                    </td>
                                    <td className="truncate px-4 text-auth-muted sm:px-6">
                                        {[app.city, app.country].filter(Boolean).join(', ') || '—'}
                                    </td>
                                    <td className="px-4 sm:px-6">
                                        <span className={`inline-block rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase ${statusBadge[app.status]}`}>
                                            {statusLabel[app.status]}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ListDataPanel>

            <ApplicationDetailModal
                application={selected}
                onClose={() => {
                    setSelected(null);
                    void load({ silent: true });
                }}
                onSilentRefresh={() => void load({ silent: true })}
                onApprove={handleApprove}
                onReject={handleReject}
            />
        </>
    );
}
