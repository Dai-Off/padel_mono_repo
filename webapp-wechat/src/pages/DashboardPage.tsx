import { Link, useOutletContext } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { NAV_ITEMS } from '../config/navigation';

type OutletContext = { userEmail: string | null };

const SECTION_CARDS = NAV_ITEMS.filter((item) => item.path !== '/');

const ICON_TONES = [
    'from-[rgba(241,143,52,0.22)] to-[rgba(241,143,52,0.06)] text-auth-accent',
    'from-[rgba(52,211,153,0.18)] to-[rgba(52,211,153,0.05)] text-[#34d399]',
    'from-[rgba(56,189,248,0.18)] to-[rgba(56,189,248,0.05)] text-[#38bdf8]',
    'from-[rgba(192,132,252,0.18)] to-[rgba(192,132,252,0.05)] text-[#c084fc]',
    'from-[rgba(251,191,36,0.18)] to-[rgba(251,191,36,0.05)] text-[#fbbf24]',
] as const;

function greetingName(email: string | null): string {
    if (!email) return 'equipo';
    const local = email.split('@')[0] ?? 'equipo';
    return local.charAt(0).toUpperCase() + local.slice(1);
}

export function DashboardPage() {
    const { userEmail } = useOutletContext<OutletContext>();

    return (
        <div className="flex w-full flex-col gap-8 sm:gap-10">
            {/* Hero */}
            <section className="home-hero-glow relative overflow-hidden rounded-3xl border border-auth-border bg-auth-card p-6 sm:p-8 lg:p-10">
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-auth-accent/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-auth-accent/5 blur-3xl" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-3xl font-bold leading-tight tracking-tight text-auth-text sm:text-4xl lg:text-5xl">
                            Hola,{' '}
                            <span className="text-auth-accent">{greetingName(userEmail)}</span>
                        </h1>

                        <div
                            className="mt-4 h-[3px] w-32 rounded-full sm:w-40"
                            style={{
                                background: 'linear-gradient(90deg, #F18F34, transparent)',
                            }}
                        />

                        <p className="mt-5 max-w-xl text-sm leading-relaxed text-auth-muted sm:text-base">
                            Bienvenido al panel de administración de{' '}
                            <span className="font-medium text-auth-text">We</span>
                            <span className="font-medium text-auth-accent">Match</span>.
                            {' '}Gestioná la aplicación móvil desde un solo lugar.
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center justify-center lg:justify-end">
                        <div className="logo-shadow relative">
                            <div className="absolute inset-0 rounded-full bg-auth-accent/20 blur-2xl" />
                            <img
                                src="/wematch-logo.png"
                                alt="WeMatch"
                                className="relative h-24 w-24 object-contain sm:h-28 sm:w-28 lg:h-32 lg:w-32"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Secciones */}
            <section>
                <div className="mb-4 flex items-end justify-between gap-3 sm:mb-5">
                    <div>
                        <h2 className="text-lg font-semibold text-auth-text sm:text-xl">
                            ¿Qué querés gestionar?
                        </h2>
                        <p className="mt-1 text-sm text-auth-secondary">
                            Elegí una sección para continuar
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                    {SECTION_CARDS.map((item, index) => {
                        const tone = ICON_TONES[index % ICON_TONES.length];
                        return (
                            <Link
                                key={item.id}
                                to={item.path}
                                className="group relative overflow-hidden rounded-2xl border border-auth-border bg-auth-card p-5 transition duration-200 hover:border-[rgba(241,143,52,0.35)] hover:bg-[rgba(255,255,255,0.02)] sm:p-6"
                            >
                                <div className="home-card-shine pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100" />

                                <div className="relative flex items-start justify-between gap-3">
                                    <div
                                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tone}`}
                                    >
                                        <item.icon className="h-5 w-5" />
                                    </div>
                                    <ArrowUpRight className="h-4 w-4 shrink-0 text-auth-secondary transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-auth-accent" />
                                </div>

                                <div className="relative mt-4">
                                    <p className="font-semibold text-auth-text sm:text-base">
                                        {item.label}
                                    </p>
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
