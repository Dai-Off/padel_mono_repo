import { useMemo, useState } from 'react';
import {
    ArrowDownRight,
    ArrowUpRight,
    CreditCard,
    Package,
    Receipt,
    ShoppingCart,
    TrendingUp,
} from 'lucide-react';
import { ListDataPanel } from '../components/ui/ListDataPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { formatMoney } from '../lib/format';

type PeriodKey = '7d' | '30d' | 'month';

type MockSale = {
    id: string;
    date: string;
    customer: string;
    items: number;
    totalCents: number;
    status: 'paid' | 'pending' | 'refunded';
    channel: 'app' | 'web';
};

type MockTopProduct = {
    name: string;
    category: string;
    units: number;
    revenueCents: number;
};

const PERIODS: { key: PeriodKey; label: string }[] = [
    { key: '7d', label: '7 días' },
    { key: '30d', label: '30 días' },
    { key: 'month', label: 'Este mes' },
];

const MOCK_BY_PERIOD: Record<
    PeriodKey,
    {
        revenueCents: number;
        orders: number;
        avgTicketCents: number;
        conversionPct: number;
        revenueDeltaPct: number;
        ordersDeltaPct: number;
        chart: { label: string; value: number }[];
        topProducts: MockTopProduct[];
        sales: MockSale[];
    }
> = {
    '7d': {
        revenueCents: 428_900,
        orders: 37,
        avgTicketCents: 11_591,
        conversionPct: 3.8,
        revenueDeltaPct: 12.4,
        ordersDeltaPct: 8.1,
        chart: [
            { label: 'Lun', value: 42 },
            { label: 'Mar', value: 58 },
            { label: 'Mié', value: 35 },
            { label: 'Jue', value: 71 },
            { label: 'Vie', value: 64 },
            { label: 'Sáb', value: 88 },
            { label: 'Dom', value: 52 },
        ],
        topProducts: [
            { name: 'Pala Pro Carbon 2026', category: 'Palas', units: 9, revenueCents: 161_100 },
            { name: 'Zapatillas Court Elite', category: 'Calzado', units: 7, revenueCents: 97_300 },
            { name: 'Pack 3 pelotas Pro', category: 'Pelotas', units: 14, revenueCents: 41_860 },
        ],
        sales: [
            { id: 'VM-1042', date: '2026-06-24T14:22:00Z', customer: 'Lucía M.', items: 2, totalCents: 18_990, status: 'paid', channel: 'app' },
            { id: 'VM-1041', date: '2026-06-24T11:05:00Z', customer: 'Carlos R.', items: 1, totalCents: 17_900, status: 'paid', channel: 'app' },
            { id: 'VM-1040', date: '2026-06-23T19:40:00Z', customer: 'Ana P.', items: 3, totalCents: 42_500, status: 'pending', channel: 'app' },
            { id: 'VM-1039', date: '2026-06-23T09:15:00Z', customer: 'Marco T.', items: 1, totalCents: 13_900, status: 'refunded', channel: 'web' },
        ],
    },
    '30d': {
        revenueCents: 1_842_300,
        orders: 156,
        avgTicketCents: 11_810,
        conversionPct: 4.1,
        revenueDeltaPct: 18.2,
        ordersDeltaPct: 14.6,
        chart: [
            { label: 'S1', value: 62 },
            { label: 'S2', value: 74 },
            { label: 'S3', value: 58 },
            { label: 'S4', value: 91 },
        ],
        topProducts: [
            { name: 'Pala Pro Carbon 2026', category: 'Palas', units: 31, revenueCents: 554_900 },
            { name: 'Mochila Pro Tour', category: 'Accesorios', units: 22, revenueCents: 197_800 },
            { name: 'Camiseta técnica WeMatch', category: 'Ropa', units: 28, revenueCents: 111_720 },
        ],
        sales: [
            { id: 'VM-1042', date: '2026-06-24T14:22:00Z', customer: 'Lucía M.', items: 2, totalCents: 18_990, status: 'paid', channel: 'app' },
            { id: 'VM-1035', date: '2026-06-22T16:30:00Z', customer: 'Elena V.', items: 1, totalCents: 89_900, status: 'paid', channel: 'app' },
            { id: 'VM-1028', date: '2026-06-20T10:12:00Z', customer: 'Diego S.', items: 2, totalCents: 24_800, status: 'paid', channel: 'web' },
            { id: 'VM-1019', date: '2026-06-18T20:55:00Z', customer: 'Sofía L.', items: 4, totalCents: 56_200, status: 'pending', channel: 'app' },
        ],
    },
    month: {
        revenueCents: 2_156_400,
        orders: 181,
        avgTicketCents: 11_914,
        conversionPct: 4.3,
        revenueDeltaPct: 22.5,
        ordersDeltaPct: 19.8,
        chart: [
            { label: 'Sem 1', value: 48 },
            { label: 'Sem 2', value: 65 },
            { label: 'Sem 3', value: 72 },
            { label: 'Sem 4', value: 84 },
        ],
        topProducts: [
            { name: 'Pala Pro Carbon 2026', category: 'Palas', units: 38, revenueCents: 679_620 },
            { name: 'Zapatillas Court Elite', category: 'Calzado', units: 26, revenueCents: 361_400 },
            { name: 'Overgrip pack x3', category: 'Accesorios', units: 41, revenueCents: 61_500 },
        ],
        sales: [
            { id: 'VM-1042', date: '2026-06-24T14:22:00Z', customer: 'Lucía M.', items: 2, totalCents: 18_990, status: 'paid', channel: 'app' },
            { id: 'VM-1031', date: '2026-06-21T13:18:00Z', customer: 'Pablo N.', items: 1, totalCents: 129_000, status: 'paid', channel: 'app' },
            { id: 'VM-1024', date: '2026-06-19T08:44:00Z', customer: 'Marta G.', items: 2, totalCents: 31_400, status: 'paid', channel: 'app' },
            { id: 'VM-1011', date: '2026-06-15T17:02:00Z', customer: 'Jorge H.', items: 1, totalCents: 14_500, status: 'refunded', channel: 'web' },
        ],
    },
};

function DeltaBadge({ value }: { value: number }) {
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
    delta?: number;
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

function statusLabel(status: MockSale['status']): string {
    if (status === 'paid') return 'Pagado';
    if (status === 'pending') return 'Pendiente';
    return 'Reembolsado';
}

function statusClass(status: MockSale['status']): string {
    if (status === 'paid') return 'bg-emerald-500/10 text-emerald-300';
    if (status === 'pending') return 'bg-amber-500/10 text-amber-300';
    return 'bg-red-500/10 text-red-300';
}

function formatSaleDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}

export function VentasPage() {
    const [period, setPeriod] = useState<PeriodKey>('7d');
    const data = MOCK_BY_PERIOD[period];
    const chartMax = useMemo(() => Math.max(...data.chart.map((b) => b.value), 1), [data.chart]);

    return (
        <div className="flex w-full flex-col gap-5 pb-8 sm:gap-6">
            <PageHeader
                title="Ventas"
                description="Resumen de pedidos y facturación de la tienda en la app. Vista previa con datos de ejemplo."
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-amber-200/90">
                    <TrendingUp className="h-4 w-4 shrink-0" />
                    <span>Maqueta de diseño</span>
                </div>
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    label="Ingresos"
                    value={formatMoney(data.revenueCents)}
                    hint="Total facturado en el período"
                    icon={CreditCard}
                    delta={data.revenueDeltaPct}
                />
                <KpiCard
                    label="Pedidos"
                    value={String(data.orders)}
                    hint="Órdenes completadas o en curso"
                    icon={ShoppingCart}
                    delta={data.ordersDeltaPct}
                />
                <KpiCard
                    label="Ticket medio"
                    value={formatMoney(data.avgTicketCents)}
                    hint="Importe medio por pedido"
                    icon={Receipt}
                />
                <KpiCard
                    label="Conversión"
                    value={`${data.conversionPct.toFixed(1)}%`}
                    hint="Visitas a tienda → compra"
                    icon={TrendingUp}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                <section className="rounded-xl border border-auth-border bg-auth-card/60 p-4 xl:col-span-3">
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-auth-text">Evolución de ingresos</h2>
                        <span className="text-xs text-auth-muted">EUR · período seleccionado</span>
                    </div>
                    <div className="flex h-44 items-end justify-between gap-2 sm:gap-3">
                        {data.chart.map((bar) => (
                            <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                                <div className="flex w-full flex-1 items-end justify-center">
                                    <div
                                        className="w-full max-w-[2.5rem] rounded-t-md bg-gradient-to-t from-[#c46f1f] to-auth-accent transition-all"
                                        style={{ height: `${Math.max(12, (bar.value / chartMax) * 100)}%` }}
                                        title={`${bar.value}% del máximo`}
                                    />
                                </div>
                                <span className="truncate text-[10px] text-auth-muted">{bar.label}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-xl border border-auth-border bg-auth-card/60 p-4 xl:col-span-2">
                    <h2 className="mb-3 text-sm font-semibold text-auth-text">Top productos</h2>
                    <ul className="space-y-3">
                        {data.topProducts.map((product, index) => (
                            <li
                                key={product.name}
                                className="flex items-center gap-3 rounded-lg border border-auth-border/60 bg-white/[0.02] px-3 py-2.5"
                            >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-xs font-bold text-auth-muted">
                                    {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-auth-text">{product.name}</p>
                                    <p className="text-[11px] text-auth-muted">
                                        {product.category} · {product.units} uds.
                                    </p>
                                </div>
                                <p className="shrink-0 text-sm font-semibold tabular-nums text-auth-accent">
                                    {formatMoney(product.revenueCents)}
                                </p>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>

            <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-auth-text">Pedidos recientes</h2>
                    <span className="text-xs text-auth-muted">{data.sales.length} en vista previa</span>
                </div>
                <ListDataPanel loading={false} isEmpty={false}>
                    <div className="modal-scroll overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-auth-card">
                                <tr className="border-b border-auth-border text-[10px] uppercase tracking-wide text-auth-secondary sm:text-xs">
                                    <th className="w-[14%] px-3 py-2 font-medium sm:px-4">Pedido</th>
                                    <th className="w-[18%] px-3 py-2 font-medium sm:px-4">Fecha</th>
                                    <th className="w-[18%] px-3 py-2 font-medium sm:px-4">Cliente</th>
                                    <th className="w-[10%] px-3 py-2 font-medium sm:px-4">Ítems</th>
                                    <th className="w-[12%] px-3 py-2 font-medium sm:px-4">Canal</th>
                                    <th className="w-[14%] px-3 py-2 font-medium sm:px-4">Total</th>
                                    <th className="w-[14%] px-3 py-2 font-medium sm:px-4">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.sales.map((sale) => (
                                    <tr
                                        key={sale.id}
                                        className="border-b border-auth-border/50 transition last:border-0 hover:bg-white/[0.02]"
                                    >
                                        <td className="px-3 py-2.5 font-mono text-xs text-auth-text sm:px-4">{sale.id}</td>
                                        <td className="px-3 py-2.5 text-xs text-auth-muted sm:px-4">
                                            {formatSaleDate(sale.date)}
                                        </td>
                                        <td className="px-3 py-2.5 text-auth-text sm:px-4">{sale.customer}</td>
                                        <td className="px-3 py-2.5 tabular-nums text-auth-muted sm:px-4">{sale.items}</td>
                                        <td className="px-3 py-2.5 sm:px-4">
                                            <span className="inline-flex items-center gap-1 text-xs text-auth-muted">
                                                <Package className="h-3.5 w-3.5" />
                                                {sale.channel === 'app' ? 'App' : 'Web'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 font-semibold tabular-nums text-auth-text sm:px-4">
                                            {formatMoney(sale.totalCents)}
                                        </td>
                                        <td className="px-3 py-2.5 sm:px-4">
                                            <span
                                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(sale.status)}`}
                                            >
                                                {statusLabel(sale.status)}
                                            </span>
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
