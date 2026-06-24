import { Menu, LogOut } from 'lucide-react';
import { AuthBrand } from '../ui/AuthBrand';
import { getNavItemByPath } from '../../config/navigation';
import { useLocation } from 'react-router-dom';

type AdminHeaderProps = {
    userEmail: string | null;
    onMenuOpen: () => void;
    onLogout: () => void;
};

export function AdminHeader({ userEmail, onMenuOpen, onLogout }: AdminHeaderProps) {
    const { pathname } = useLocation();
    const current = getNavItemByPath(pathname);

    return (
        <header className="sticky top-0 z-30 border-b border-auth-border bg-auth-bg/95 pt-safe backdrop-blur-md">
            <div className="flex min-h-14 items-center justify-between gap-3 px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] sm:min-h-16 sm:px-6 lg:px-8">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <button
                        type="button"
                        onClick={onMenuOpen}
                        aria-label="Abrir menú"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-auth-border text-auth-muted transition hover:bg-[rgba(255,255,255,0.06)] hover:text-auth-text lg:hidden"
                    >
                        <Menu className="h-5 w-5" />
                    </button>

                    <div className="min-w-0 hidden lg:block">
                        <AuthBrand variant="full" />
                    </div>

                    <div className="min-w-0 lg:hidden">
                        <p className="truncate text-sm font-semibold text-auth-text sm:text-base">
                            {current?.label ?? 'Inicio'}
                        </p>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    {userEmail ? (
                        <span
                            className="hidden max-w-[180px] truncate text-xs text-auth-muted sm:inline sm:max-w-[220px] sm:text-sm md:max-w-none"
                            title={userEmail}
                        >
                            {userEmail}
                        </span>
                    ) : null}
                    <button
                        type="button"
                        onClick={onLogout}
                        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-auth-border bg-[rgba(255,255,255,0.06)] px-2.5 py-2 text-xs text-auth-muted transition hover:bg-[rgba(255,255,255,0.1)] hover:text-auth-text sm:px-3 sm:text-sm"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="hidden xs:inline">Salir</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
