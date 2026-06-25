import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowUpRight,
    Building2,
    Layers,
    Package,
    ShoppingBag,
    Users,
    Zap,
} from 'lucide-react';
import { NAV_ITEMS } from '../config/navigation';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { PageLoader } from '../components/ui/PageLoader';
import { pageHeaderTitleClass } from '../components/ui/PageHeader';
import { buildDashboardSnapshot, type DashboardSnapshot } from '../lib/dashboardStats';
import { formatDate, storeCategoryLabel } from '../lib/format';
import { listClubs } from '../services/clubs';
import { listPlayers } from '../services/players';
import {
    getStoreFlashSettings,
    listStoreCollections,
    listStoreProducts,
} from '../services/store';

type OutletContext = { userEmail: string | null };

const SECTION_CARDS = NAV_ITEMS.filter((item) => item.path !== '/');

const ICON_TONES = [
    'from-[rgba(241,143,52,0.22)] to-[rgba(241,143,52,0.06)] text-auth-accent',
    'from-[rgba(52,211,153,0.18)] to-[rgba(52,211,153,0.05)] text-[#34d399]',
    'from-[rgba(56,189,248,0.18)] to-[rgba(56,189,248,0.05)] text-[#38bdf8]',
    'from-[rgba(192,132,252,0.18)] to-[rgba(192,132,252,0.05)] text-[#c084fc]',
    'from-[rgba(251,191,36,0.18)] to-[rgba(251,191,36,0.05)] text-[#fbbf24]',
    'from-[rgba(244,114,182,0.18)] to-[rgba(244,114,182,0.05)] text-[#f472b6]',
] as const;

const ALERT_TONE_CLASS = {
    danger: 'border-red-500/25 bg-red-500/5 text-red-200',
    warning: 'border-amber-500/25 bg-amber-500/5 text-amber-200',
    info: 'border-sky-500/25 bg-sky-500/5 text-sky-200',
} as const;

function greetingName(email: string | null): string {
    if (!email) return 'equipo';
    const local = email.split('@')[0] ?? 'equipo';
    return local.charAt(0).toUpperCase() + local.slice(1);
}

function KpiCard({
    label,
    value,
    hint,
    icon: Icon,
    tone = 'default',
}: {
    label: string;
    value: string;
    hint?: string;
    icon: typeof Users;
    tone?: 'default' | 'warning' | 'danger' | 'accent';
}) {
    const valueClass =
        tone === 'warning'
            ? 'text-amber-400'
            : tone === 'danger'
              ? 'text-red-400'
              : tone === 'accent'
                ? 'text-auth-accent'
                : 'text-auth-text';

    const iconClass =
        tone === 'warning'
            ? 'bg-amber-500/10 text-amber-400'
            : tone === 'danger'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-[rgba(241,143,52,0.12)] text-auth-accent';

    return (
        <div className="rounded-xl border border-auth-border bg-auth-card/60 p-4">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconClass}`}>
                <Icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-xs text-auth-secondary">{label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
            {hint ? <p className="mt-1 text-[11px] text-auth-muted">{hint}</p> : null}
        </div>
    );
}

export function DashboardPage() {
    const { userEmail } = useOutletContext<OutletContext>();
    const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [playersRes, clubsRes, productsRes, collectionsRes, flashRes] =
                await Promise.allSettled([
                    listPlayers(),
                    listClubs(),
                    listStoreProducts({ includeInactive: true }),
                    listStoreCollections({ includeInactive: true }),
                    getStoreFlashSettings(),
                ]);

            const failures: string[] = [];
            const players = playersRes.status === 'fulfilled' ? playersRes.value : [];
            const clubs = clubsRes.status === 'fulfilled' ? clubsRes.value : [];
            const products = productsRes.status === 'fulfilled' ? productsRes.value : [];
            const collections =
                collectionsRes.status === 'fulfilled' ? collectionsRes.value : [];
            const flash =
                flashRes.status === 'fulfilled'
                    ? flashRes.value
                    : {
                          id: 1,
                          flash_enabled: false,
                          flash_ends_at: null,
                          flash_title: null,
                          updated_at: new Date().toISOString(),
                      };

            if (playersRes.status === 'rejected') failures.push('jugadores');
            if (clubsRes.status === 'rejected') failures.push('clubes');
            if (productsRes.status === 'rejected') failures.push('tienda');
            if (collectionsRes.status === 'rejected') failures.push('colecciones');

            setSnapshot(
                buildDashboardSnapshot(players, clubs.length, products, collections, flash),
            );

            if (failures.length === 5) {
                setError('No se pudo cargar el resumen del panel');
            } else if (failures.length > 0) {
                setError(`No se pudo cargar: ${failures.join(', ')}`);
            }
        } catch {
            setError('No se pudo cargar el resumen del panel');
            setSnapshot(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading && !snapshot) {
        return <PageLoader label="Cargando resumen…" />;
    }

    const data = snapshot;

    return (
        <div className="flex w-full flex-col gap-6 pb-8 sm:gap-8">
            <section className="home-hero-glow relative overflow-hidden rounded-2xl border border-auth-border bg-auth-card p-5 sm:p-6">
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-auth-accent/10 blur-3xl" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h1 className={pageHeaderTitleClass('md')}>
                            Hola, <span className="text-auth-accent">{greetingName(userEmail)}</span>
                        </h1>
                        <p className="mt-2 max-w-xl text-sm text-auth-muted">
                            Resumen de la plataforma WeMatch — datos en tiempo real del panel.
                        </p>
                    </div>
                    <img
                        src="/wematch-logo.png"
                        alt="WeMatch"
                        className="hidden h-16 w-16 shrink-0 object-contain sm:block lg:h-20 lg:w-20"
                    />
                </div>
            </section>

            {error ? (
                <ErrorBanner message={error} />
            ) : null}

            {data ? (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <KpiCard
                            label="Jugadores"
                            value={String(data.playersActive)}
                            hint={`${data.playersTotal} en total`}
                            icon={Users}
                        />
                        <KpiCard
                            label="Clubes"
                            value={String(data.clubsCount)}
                            hint="Con pistas visibles hoy"
                            icon={Building2}
                        />
                        <KpiCard
                            label="Productos"
                            value={String(data.productsActive)}
                            hint={`${data.productsTotal} en catálogo`}
                            icon={Package}
                        />
                        <KpiCard
                            label="Stock crítico"
                            value={String(data.productsLowStock + data.productsOutOfStock)}
                            hint={
                                data.productsOutOfStock > 0
                                    ? `${data.productsOutOfStock} agotados`
                                    : 'Sin agotados'
                            }
                            icon={AlertTriangle}
                            tone={
                                data.productsOutOfStock > 0
                                    ? 'danger'
                                    : data.productsLowStock > 0
                                      ? 'warning'
                                      : 'default'
                            }
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {data.alerts.length > 0 ? (
                            <section className="rounded-xl border border-auth-border bg-auth-card/60 p-4 lg:col-span-2">
                                <h2 className="mb-3 text-sm font-semibold text-auth-text">
                                    Requiere atención
                                </h2>
                                <ul className="space-y-2">
                                    {data.alerts.map((alert) => (
                                        <li key={alert.id}>
                                            <Link
                                                to={alert.to}
                                                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition hover:brightness-110 ${ALERT_TONE_CLASS[alert.tone]}`}
                                            >
                                                <span>{alert.message}</span>
                                                <ArrowUpRight className="h-4 w-4 shrink-0 opacity-70" />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : (
                            <section className="flex items-center rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 lg:col-span-2">
                                <p className="text-sm text-emerald-200">
                                    Todo en orden — no hay alertas pendientes en tienda ni usuarios.
                                </p>
                            </section>
                        )}

                        <section className="rounded-xl border border-auth-border bg-auth-card/60 p-4">
                            <h2 className="mb-3 text-sm font-semibold text-auth-text">Tienda</h2>
                            <ul className="space-y-2.5 text-sm">
                                <li className="flex items-center justify-between gap-2 text-auth-muted">
                                    <span className="inline-flex items-center gap-1.5">
                                        <Zap className="h-3.5 w-3.5" />
                                        Flash
                                    </span>
                                    <span
                                        className={
                                            data.flashActive
                                                ? 'font-medium text-emerald-300'
                                                : 'text-auth-secondary'
                                        }
                                    >
                                        {data.flashActive ? 'Activa' : 'Inactiva'}
                                    </span>
                                </li>
                                <li className="flex items-center justify-between gap-2 text-auth-muted">
                                    <span className="inline-flex items-center gap-1.5">
                                        <Layers className="h-3.5 w-3.5" />
                                        Colecciones
                                    </span>
                                    <span className="font-medium text-auth-text">
                                        {data.collectionsActive}/{data.collectionsTotal}
                                    </span>
                                </li>
                                <li className="flex items-center justify-between gap-2 text-auth-muted">
                                    <span className="inline-flex items-center gap-1.5">
                                        <ShoppingBag className="h-3.5 w-3.5" />
                                        Destacados
                                    </span>
                                    <span className="font-medium text-auth-text">
                                        {data.productsFeatured}
                                    </span>
                                </li>
                                <li className="flex items-center justify-between gap-2 text-auth-muted">
                                    <span className="inline-flex items-center gap-1.5">
                                        <Zap className="h-3.5 w-3.5" />
                                        En flash
                                    </span>
                                    <span className="font-medium text-auth-text">
                                        {data.productsFlashDeal}
                                    </span>
                                </li>
                            </ul>
                        </section>
                    </div>

                    {data.recentProducts.length > 0 ? (
                        <section className="rounded-xl border border-auth-border bg-auth-card/60 p-4">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <h2 className="text-sm font-semibold text-auth-text">
                                    Últimos cambios en catálogo
                                </h2>
                                <Link
                                    to="/tienda"
                                    className="text-xs font-semibold text-auth-accent hover:underline"
                                >
                                    Ver tienda
                                </Link>
                            </div>
                            <ul className="divide-y divide-auth-border/50">
                                {data.recentProducts.map((product) => (
                                    <li
                                        key={product.id}
                                        className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-auth-text">
                                                {product.name}
                                            </p>
                                            <p className="text-xs text-auth-muted">
                                                {storeCategoryLabel(product.category)} ·{' '}
                                                {product.is_active ? 'Visible' : 'Oculto'}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-xs text-auth-secondary">
                                            {formatDate(product.updated_at)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}
                </>
            ) : null}

            <section>
                <div className="mb-4">
                    <h2 className="text-sm font-semibold text-auth-text sm:text-base">
                        Accesos rápidos
                    </h2>
                    <p className="mt-1 text-sm text-auth-secondary">
                        Secciones del panel de administración
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                    {SECTION_CARDS.map((item, index) => {
                        const tone = ICON_TONES[index % ICON_TONES.length];
                        const stat = data?.sectionStats[item.id];
                        return (
                            <Link
                                key={item.id}
                                to={item.path}
                                className="group relative overflow-hidden rounded-2xl border border-auth-border bg-auth-card p-4 transition duration-200 hover:border-[rgba(241,143,52,0.35)] hover:bg-[rgba(255,255,255,0.02)] sm:p-5"
                            >
                                <div className="home-card-shine pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100" />

                                <div className="relative flex items-start justify-between gap-3">
                                    <div
                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tone}`}
                                    >
                                        <item.icon className="h-5 w-5" />
                                    </div>
                                    <ArrowUpRight className="h-4 w-4 shrink-0 text-auth-secondary transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-auth-accent" />
                                </div>

                                <div className="relative mt-3">
                                    <p className="font-semibold text-auth-text">{item.label}</p>
                                    {stat ? (
                                        <p className="mt-1 text-xs font-medium text-auth-accent">
                                            {stat}
                                        </p>
                                    ) : null}
                                    {item.description ? (
                                        <p className="mt-1.5 text-sm leading-relaxed text-auth-muted">
                                            {item.description}
                                        </p>
                                    ) : null}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
