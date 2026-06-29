import { useCallback, useEffect, useState } from 'react';
import {
    ArrowDownRight,
    ArrowUpRight,
    CreditCard,
    Package,
    Receipt,
    RefreshCw,
    Layers,
    ShoppingCart,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { ListDataPanel } from '../components/ui/ListDataPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/PageLoader';
import { Pagination } from '../components/ui/Pagination';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { formatMoney } from '../lib/format';
import { DEFAULT_PAGE_SIZE, paginate, totalPages } from '../lib/pagination';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { getStoreSales, type StoreSalesPeriod, type StoreSalesSummary } from '../services/store';

const PERIODS: { key: StoreSalesPeriod; label: string }[] = [
    { key: '7d', label: '7 días' },
    { key: '30d', label: '30 días' },
    { key: 'month', label: 'Este mes' },
];

function DeltaBadge({ value }: { value: number | null }) {
    if (value == null) return null;
    const up = value >= 0;
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    return (
        <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                up ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
            }`}
        >
            <Icon className="h-3 w-3" />
            {up ? '+' : ''}
            {value.toFixed(1)}%
        </span>
    );
}

function KpiCard({
    label,
    value,
    hint,
    icon: Icon,
    delta,
}: {
    label: string;
    value: string;
    hint?: string;
    icon: typeof Receipt;
    delta?: number | null;
}) {
    return (
        <div className="rounded-xl border border-auth-border bg-auth-card/60 p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(241,143,52,0.12)] text-auth-accent">
                    <Icon className="h-4 w-4" />
                </div>
                {typeof delta === 'number' ? <DeltaBadge value={delta} /> : null}
            </div>
            <p className="mt-3 text-xs text-auth-secondary">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-auth-text">{value}</p>
            {hint ? <p className="mt-1 text-[11px] text-auth-muted">{hint}</p> : null}
        </div>
    );
}

const STATUS_META: Record<string, { label: string; className: string }> = {
    paid: { label: 'Pagado', className: 'bg-emerald-500/10 text-emerald-300' },
    pending_payment: { label: 'Pendiente', className: 'bg-amber-500/10 text-amber-300' },
    cancelled: { label: 'Cancelado', className: 'bg-red-500/10 text-red-300' },
    failed: { label: 'Fallido', className: 'bg-red-500/10 text-red-300' },
};

function statusMeta(status: string) {
    return STATUS_META[status] ?? { label: status, className: 'bg-white/5 text-auth-muted' };
}

function formatSaleDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}

function shortOrderId(id: string): string {
    return id.slice(0, 8).toUpperCase();
}

function ChartTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: { value?: number }[];
    label?: string;
}) {
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div className="rounded-lg border border-auth-border bg-auth-card px-3 py-2 shadow-lg">
            <p className="text-[11px] text-auth-muted">{label}</p>
            <p className="text-sm font-semibold tabular-nums text-auth-text">
                {formatMoney(Number(payload[0]?.value ?? 0))}
            </p>
        </div>
    );
}

export function VentasPage() {
    const [period, setPeriod] = useState<StoreSalesPeriod>('7d');
    const [data, setData] = useState<StoreSalesSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [salesPage, setSalesPage] = useState(1);

    const load = useCallback(
        async (opts?: { silent?: boolean }) => {
            const silent = opts?.silent ?? false;
            if (!silent) setLoading(true);
            try {
                const summary = await getStoreSales(period);
                setData(summary);
                setError(null);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'No se pudieron cargar las ventas';
                // En refresco de fondo mantenemos los últimos datos válidos en pantalla.
                if (!silent) {
                    setError(message);
                    setData(null);
                }
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [period],
    );

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        setSalesPage(1);
    }, [period]);

    useAutoRefresh(() => load({ silent: true }));

    const stats = data?.stats;
    const recentSales = data?.recent_sales ?? [];
    const topProducts = data?.top_products ?? [];
    const hasSales = (stats?.orders ?? 0) > 0 || recentSales.length > 0;

    const recentPageCount = totalPages(recentSales.length);
    const recentPage = Math.min(salesPage, recentPageCount);
    const pagedSales = paginate(recentSales, recentPage);

    if (loading && !data) {
        return <PageLoader label="Cargando ventas…" />;
    }

    return (
        <div className="flex w-full flex-col gap-5 pb-8 sm:gap-6">
            <PageHeader
                title="Ventas"
                description="Resumen de pedidos y facturación de la tienda en la app."
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-auth-border bg-auth-card/40 px-4 py-3">
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="inline-flex items-center gap-2 text-sm text-auth-muted transition hover:text-auth-text disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                </button>
                <div className="flex flex-wrap gap-1.5">
                    {PERIODS.map((p) => (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => setPeriod(p.key)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                period === p.key
                                    ? 'bg-auth-accent text-white'
                                    : 'border border-auth-border bg-white/[0.03] text-auth-muted hover:text-auth-text'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {error ? <ErrorBanner message={error} /> : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    label="Ingresos"
                    value={formatMoney(stats?.revenue_cents ?? 0)}
                    hint="Total facturado en el período"
                    icon={CreditCard}
                    delta={stats?.revenue_delta_pct ?? null}
                />
                <KpiCard
                    label="Pedidos"
                    value={String(stats?.orders ?? 0)}
                    hint="Pedidos pagados"
                    icon={ShoppingCart}
                    delta={stats?.orders_delta_pct ?? null}
                />
                <KpiCard
                    label="Ticket medio"
                    value={formatMoney(stats?.avg_ticket_cents ?? 0)}
                    hint="Importe medio por pedido"
                    icon={Receipt}
                />
                <KpiCard
                    label="Unidades"
                    value={String(stats?.units ?? 0)}
                    hint="Artículos vendidos"
                    icon={Package}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                <section className="rounded-xl border border-auth-border bg-auth-card/60 p-4 xl:col-span-3">
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-auth-text">Evolución de ingresos</h2>
                        <span className="text-xs text-auth-muted">EUR · período seleccionado</span>
                    </div>
                    {data && data.chart.length > 0 ? (
                        <div className="h-44 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={data.chart}
                                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                                >
                                    <defs>
                                        <linearGradient id="ventasRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#f18f34" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#f18f34" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        vertical={false}
                                        stroke="rgba(255,255,255,0.06)"
                                    />
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        width={48}
                                        tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(value) => formatMoney(Number(value))}
                                    />
                                    <Tooltip
                                        content={<ChartTooltip />}
                                        cursor={{ stroke: 'rgba(255,255,255,0.15)' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="value_cents"
                                        stroke="#f18f34"
                                        strokeWidth={2}
                                        fill="url(#ventasRevenue)"
                                        dot={{ r: 2.5, fill: '#f18f34', strokeWidth: 0 }}
                                        activeDot={{ r: 4 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex h-44 items-center justify-center text-sm text-auth-muted">
                            {loading ? 'Cargando…' : 'Sin ingresos en el período'}
                        </div>
                    )}
                </section>

                <section className="rounded-xl border border-auth-border bg-auth-card/60 p-4 xl:col-span-2">
                    <h2 className="mb-3 text-sm font-semibold text-auth-text">Top productos</h2>
                    {topProducts.length > 0 ? (
                        <ul className="space-y-3">
                            {topProducts.map((product, index) => (
                                <li
                                    key={`${product.name}-${index}`}
                                    className="flex items-center gap-3 rounded-lg border border-auth-border/60 bg-white/[0.02] px-3 py-2.5"
                                >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-xs font-bold text-auth-muted">
                                        {index + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-auth-text">{product.name}</p>
                                        <p className="text-[11px] text-auth-muted">
                                            {product.brand ? `${product.brand} · ` : ''}
                                            {product.units} uds.
                                        </p>
                                    </div>
                                    <p className="shrink-0 text-sm font-semibold tabular-nums text-auth-accent">
                                        {formatMoney(product.revenue_cents)}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="flex items-center gap-2 rounded-lg border border-auth-border/60 bg-white/[0.02] px-3 py-6 text-sm text-auth-muted">
                            <Layers className="h-4 w-4 shrink-0" />
                            {loading ? 'Cargando…' : 'Aún no hay ventas en el período'}
                        </div>
                    )}
                </section>
            </div>

            <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-auth-text">Pedidos recientes</h2>
                    <span className="text-xs text-auth-muted">{recentSales.length} pedidos</span>
                </div>
                <ListDataPanel
                    loading={loading}
                    isEmpty={!loading && !hasSales}
                    emptyMessage="Todavía no hay pedidos pagados en la tienda."
                    footer={
                        <Pagination
                            page={recentPage}
                            total={recentPageCount}
                            pageSize={DEFAULT_PAGE_SIZE}
                            totalItems={recentSales.length}
                            onPageChange={setSalesPage}
                        />
                    }
                >
                    <div className="modal-scroll overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-auth-card">
                                <tr className="border-b border-auth-border text-[10px] uppercase tracking-wide text-auth-secondary sm:text-xs">
                                    <th className="w-[14%] px-3 py-2 font-medium sm:px-4">Pedido</th>
                                    <th className="w-[20%] px-3 py-2 font-medium sm:px-4">Fecha</th>
                                    <th className="w-[20%] px-3 py-2 font-medium sm:px-4">Cliente</th>
                                    <th className="w-[10%] px-3 py-2 font-medium sm:px-4">Ítems</th>
                                    <th className="w-[16%] px-3 py-2 font-medium sm:px-4">Total</th>
                                    <th className="w-[14%] px-3 py-2 font-medium sm:px-4">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedSales.map((sale) => {
                                    const meta = statusMeta(sale.status);
                                    return (
                                        <tr
                                            key={sale.id}
                                            className="border-b border-auth-border/50 transition last:border-0 hover:bg-white/[0.02]"
                                        >
                                            <td className="px-3 py-2.5 font-mono text-xs text-auth-text sm:px-4">
                                                {shortOrderId(sale.id)}
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-auth-muted sm:px-4">
                                                {formatSaleDate(sale.paid_at ?? sale.created_at)}
                                            </td>
                                            <td className="truncate px-3 py-2.5 text-auth-text sm:px-4">{sale.customer}</td>
                                            <td className="px-3 py-2.5 tabular-nums text-auth-muted sm:px-4">{sale.items}</td>
                                            <td className="px-3 py-2.5 font-semibold tabular-nums text-auth-text sm:px-4">
                                                {formatMoney(sale.total_cents)}
                                            </td>
                                            <td className="px-3 py-2.5 sm:px-4">
                                                <span
                                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}
                                                >
                                                    {meta.label}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </ListDataPanel>
            </section>
        </div>
    );
}
