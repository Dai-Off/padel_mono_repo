import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { NAV_ITEMS } from '../../config/navigation';
import { AuthBrand } from '../ui/AuthBrand';

type SidebarProps = {
    isOpen: boolean;
    onClose: () => void;
};

function navLinkClass({ isActive }: { isActive: boolean }) {
    return [
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        isActive
            ? 'bg-[rgba(241,143,52,0.15)] text-auth-accent'
            : 'text-auth-muted hover:bg-[rgba(255,255,255,0.06)] hover:text-auth-text',
    ].join(' ');
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    return (
        <>
            {/* Overlay móvil */}
            <button
                type="button"
                aria-label="Cerrar menú"
                onClick={onClose}
                className={[
                    'fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity lg:hidden',
                    isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
                ].join(' ')}
            />

            <aside
                className={[
                    'fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(85vw,280px)] flex-col overflow-hidden border-r border-auth-border bg-auth-bg pt-safe pb-safe transition-transform duration-300 ease-out lg:static lg:z-auto lg:h-full lg:w-64 lg:shrink-0 lg:translate-x-0 xl:w-72',
                    isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
                ].join(' ')}
            >
                {/* Cabecera sidebar */}
                <div className="flex items-center justify-between gap-2 border-b border-auth-border px-4 py-4 sm:px-5">
                    <div className="min-w-0 flex-1 lg:hidden">
                        <AuthBrand variant="full" />
                    </div>
                    <p className="hidden text-xs font-semibold uppercase tracking-wider text-auth-secondary lg:block">
                        Navegación
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar menú"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-auth-border text-auth-muted transition hover:bg-[rgba(255,255,255,0.06)] hover:text-auth-text lg:hidden"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Links */}
                <nav className="flex-1 overflow-hidden px-3 py-4 sm:px-4">
                    <ul className="space-y-1">
                        {NAV_ITEMS.map((item) => (
                            <li key={item.id}>
                                <NavLink
                                    to={item.path}
                                    end={item.path === '/'}
                                    onClick={onClose}
                                    className={navLinkClass}
                                >
                                    <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                                    <span className="truncate">{item.label}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="border-t border-auth-border px-4 py-4 sm:px-5">
                    <p className="text-xs text-auth-secondary">
                        WeMatch · Administración
                    </p>
                </div>
            </aside>
        </>
    );
}
