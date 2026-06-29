import { useMemo, useState } from 'react';
import {
    Calendar,
    Copy,
    Percent,
    Plus,
    Tag,
    Ticket,
    TrendingUp,
    Users,
} from 'lucide-react';
import { ListDataPanel } from '../components/ui/ListDataPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { formatMoney } from '../lib/format';

type StatusFilter = 'all' | 'active' | 'scheduled' | 'expired';

type PromoCode = {
    id: string;
    code: string;
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    uses: number;
    maxUses: number | null;
    startsAt: string;
    endsAt: string;
    status: 'active' | 'scheduled' | 'expired';
    scope: 'tienda' | 'cursos' | 'all';
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'Activos' },
    { key: 'scheduled', label: 'Programados' },
    { key: 'expired', label: 'Expirados' },
];

const MOCK_CODES: PromoCode[] = [
    {
        id: '1',
        code: 'VERANO26',
        name: 'Verano 2026',
        discountType: 'percent',
        discountValue: 15,
        uses: 84,
        maxUses: 500,
        startsAt: '2026-06-01',
        endsAt: '2026-08-31',
        status: 'active',
        scope: 'tienda',
    },
    {
        id: '2',
        code: 'WELCOME10',
        name: 'Bienvenida nuevos usuarios',
        discountType: 'percent',
        discountValue: 10,
        uses: 312,
        maxUses: null,
        startsAt: '2026-01-01',
        endsAt: '2026-12-31',
        status: 'active',
        scope: 'all',
    },
    {
        id: '3',
        code: 'PALA50',
        name: 'Descuento palas premium',
        discountType: 'fixed',
        discountValue: 5000,
        uses: 12,
        maxUses: 50,
        startsAt: '2026-06-15',
        endsAt: '2026-07-15',
        status: 'active',
        scope: 'tienda',
    },
    {
        id: '4',
        code: 'CURSOFLASH',
        name: 'Flash cursos digitales',
        discountType: 'percent',
        discountValue: 25,
        uses: 0,
        maxUses: 100,
        startsAt: '2026-07-01',
        endsAt: '2026-07-07',
        status: 'scheduled',
        scope: 'cursos',
    },
    {
        id: '5',
        code: 'BLACKFRI25',
        name: 'Black Friday 2025',
        discountType: 'percent',
        discountValue: 30,
        uses: 891,
        maxUses: 1000,
        startsAt: '2025-11-28',
        endsAt: '2025-11-30',
        status: 'expired',
        scope: 'tienda',
    },
    {
        id: '6',
        code: 'AMIGO20',
        name: 'Referidos amigos',
        discountType: 'percent',
        discountValue: 20,
        uses: 47,
        maxUses: 200,
        startsAt: '2026-03-01',
        endsAt: '2026-09-30',
        status: 'active',
        scope: 'all',
    },
];

function KpiCard({
    label,
    value,
    hint,
    icon: Icon,
}: {
    label: string;
    value: string;
    hint?: string;
    icon: typeof Ticket;
}) {
    return (
        <div className="rounded-xl border border-auth-border bg-auth-card/60 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(241,143,52,0.12)] text-auth-accent">
                <Icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-xs text-auth-secondary">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-auth-text">{value}</p>
            {hint ? <p className="mt-1 text-[11px] text-auth-muted">{hint}</p> : null}
        </div>
    );
}

function statusLabel(status: PromoCode['status']): string {
    if (status === 'active') return 'Activo';
    if (status === 'scheduled') return 'Programado';
    return 'Expirado';
}

function statusClass(status: PromoCode['status']): string {
    if (status === 'active') return 'bg-emerald-500/10 text-emerald-300';
    if (status === 'scheduled') return 'bg-sky-500/10 text-sky-300';
    return 'bg-white/5 text-auth-muted';
}

function scopeLabel(scope: PromoCode['scope']): string {
    if (scope === 'tienda') return 'Tienda';
    if (scope === 'cursos') return 'Cursos';
    return 'Toda la app';
}

function formatDiscount(promo: PromoCode): string {
    if (promo.discountType === 'percent') return `${promo.discountValue}%`;
    return formatMoney(promo.discountValue);
}

function formatDateShort(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(d);
}

function usesLabel(promo: PromoCode): string {
    if (promo.maxUses == null) return `${promo.uses} / ∞`;
    return `${promo.uses} / ${promo.maxUses}`;
}

export function CodigosPromocionalesPage() {
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const filtered = useMemo(() => {
        if (statusFilter === 'all') return MOCK_CODES;
        return MOCK_CODES.filter((c) => c.status === statusFilter);
    }, [statusFilter]);

    const activeCount = MOCK_CODES.filter((c) => c.status === 'active').length;
    const totalUses = MOCK_CODES.reduce((sum, c) => sum + c.uses, 0);
    const topCode = [...MOCK_CODES].sort((a, b) => b.uses - a.uses)[0];

    return (
        <div className="flex w-full flex-col gap-5 pb-8 sm:gap-6">
            <PageHeader
                title="Códigos promocionales"
                description="Cupones, descuentos y campañas para la tienda y la app."
                actions={(
                    <button
                        type="button"
                        disabled
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-auth-accent/80 px-4 py-2 text-sm font-semibold text-white opacity-90"
                        title="Próximamente"
                    >
                        <Plus className="h-4 w-4" />
                        Nuevo código
                    </button>
                )}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-amber-200/90">
                    <TrendingUp className="h-4 w-4 shrink-0" />
                    <span>Maqueta de diseño</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {STATUS_FILTERS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setStatusFilter(f.key)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                statusFilter === f.key
                                    ? 'bg-auth-accent text-white'
                                    : 'border border-auth-border bg-white/[0.03] text-auth-muted hover:text-auth-text'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Códigos activos" value={String(activeCount)} hint="Vigentes ahora" icon={Ticket} />
                <KpiCard
                    label="Canjes totales"
                    value={String(totalUses)}
                    hint="Usos acumulados"
                    icon={Users}
                />
                <KpiCard
                    label="Descuento medio"
                    value="14,2%"
                    hint="Promedio en campañas activas"
                    icon={Percent}
                />
                <KpiCard
                    label="Más usado"
                    value={topCode?.code ?? '—'}
                    hint={topCode ? `${topCode.uses} canjes` : undefined}
                    icon={Tag}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <section className="rounded-xl border border-auth-border bg-auth-card/60 p-4 lg:col-span-2">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-auth-text">Rendimiento por campaña</h2>
                        <span className="text-xs text-auth-muted">Canjes en el período</span>
                    </div>
                    <div className="space-y-3">
                        {[...MOCK_CODES]
                            .filter((c) => c.status !== 'expired')
                            .sort((a, b) => b.uses - a.uses)
                            .slice(0, 4)
                            .map((promo) => {
                                const max = topCode?.uses ?? 1;
                                const pct = Math.max(8, (promo.uses / max) * 100);
                                return (
                                    <div key={promo.id}>
                                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                                            <span className="truncate font-medium text-auth-text">
                                                {promo.name}
                                            </span>
                                            <span className="shrink-0 tabular-nums text-auth-muted">
                                                {promo.uses} canjes
                                            </span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-white/5">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-[#c46f1f] to-auth-accent"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </section>

                <section className="rounded-xl border border-auth-border bg-auth-card/60 p-4">
                    <h2 className="mb-3 text-sm font-semibold text-auth-text">Próximo a activar</h2>
                    {MOCK_CODES.filter((c) => c.status === 'scheduled').length === 0 ? (
                        <p className="text-sm text-auth-muted">No hay campañas programadas.</p>
                    ) : (
                        <ul className="space-y-3">
                            {MOCK_CODES.filter((c) => c.status === 'scheduled').map((promo) => (
                                <li
                                    key={promo.id}
                                    className="rounded-lg border border-auth-border/60 bg-white/[0.02] px-3 py-2.5"
                                >
                                    <p className="font-mono text-sm font-semibold text-auth-accent">{promo.code}</p>
                                    <p className="mt-0.5 text-xs text-auth-muted">{promo.name}</p>
                                    <p className="mt-2 flex items-center gap-1 text-[11px] text-auth-secondary">
                                        <Calendar className="h-3.5 w-3.5" />
                                        Inicia {formatDateShort(promo.startsAt)}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-auth-text">Listado de códigos</h2>
                    <span className="text-xs text-auth-muted">{filtered.length} códigos</span>
                </div>
                <ListDataPanel loading={false} isEmpty={filtered.length === 0}>
                    <div className="modal-scroll overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[880px] table-fixed text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-auth-card">
                                <tr className="border-b border-auth-border text-[10px] uppercase tracking-wide text-auth-secondary sm:text-xs">
                                    <th className="w-[14%] px-3 py-2 font-medium sm:px-4">Código</th>
                                    <th className="w-[18%] px-3 py-2 font-medium sm:px-4">Campaña</th>
                                    <th className="w-[10%] px-3 py-2 font-medium sm:px-4">Descuento</th>
                                    <th className="w-[10%] px-3 py-2 font-medium sm:px-4">Canjes</th>
                                    <th className="w-[12%] px-3 py-2 font-medium sm:px-4">Vigencia</th>
                                    <th className="w-[12%] px-3 py-2 font-medium sm:px-4">Ámbito</th>
                                    <th className="w-[12%] px-3 py-2 font-medium sm:px-4">Estado</th>
                                    <th className="w-[8%] px-3 py-2 text-right font-medium sm:px-4" />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((promo) => (
                                    <tr
                                        key={promo.id}
                                        className="border-b border-auth-border/50 transition last:border-0 hover:bg-white/[0.02]"
                                    >
                                        <td className="px-3 py-2.5 sm:px-4">
                                            <span className="font-mono text-xs font-semibold text-auth-accent">
                                                {promo.code}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-auth-text sm:px-4">{promo.name}</td>
                                        <td className="px-3 py-2.5 font-semibold tabular-nums text-auth-text sm:px-4">
                                            {formatDiscount(promo)}
                                        </td>
                                        <td className="px-3 py-2.5 tabular-nums text-auth-muted sm:px-4">
                                            {usesLabel(promo)}
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-auth-muted sm:px-4">
                                            {formatDateShort(promo.startsAt)}
                                            <span className="text-auth-secondary"> → </span>
                                            {formatDateShort(promo.endsAt)}
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-auth-muted sm:px-4">
                                            {scopeLabel(promo.scope)}
                                        </td>
                                        <td className="px-3 py-2.5 sm:px-4">
                                            <span
                                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(promo.status)}`}
                                            >
                                                {statusLabel(promo.status)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right sm:px-4">
                                            <button
                                                type="button"
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-auth-border text-auth-muted transition hover:bg-white/5 hover:text-auth-text"
                                                title="Copiar código"
                                                onClick={() => void navigator.clipboard?.writeText(promo.code)}
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ListDataPanel>
            </section>
        </div>
    );
}
