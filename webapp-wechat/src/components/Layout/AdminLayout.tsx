import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Smartphone } from 'lucide-react';
import { authService } from '../../services/auth';
import { HttpError } from '../../services/api';
import { getApiBase } from '../../services/api';

export function AdminLayout() {
    const navigate = useNavigate();
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const session = authService.getSession();
            if (!session) {
                navigate('/login', { replace: true });
                return;
            }
            try {
                const me = await authService.getMe();
                if (!me.ok || !me.roles?.admin_id) {
                    authService.logout();
                    navigate('/login', { replace: true });
                    return;
                }
                if (!cancelled) setUserEmail(me.user.email);
            } catch (e) {
                if (e instanceof HttpError && e.status === 401) {
                    authService.logout();
                    navigate('/login', { replace: true });
                    return;
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [navigate]);

    const handleLogout = () => {
        authService.logout();
        navigate('/login', { replace: true });
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-portal-header border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border-subtle bg-portal-header text-white">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                        <Smartphone className="h-5 w-5" />
                        <span className="font-semibold">
                            {import.meta.env.VITE_APP_NAME || 'WeMatch Admin Mobile'}
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="hidden text-sm opacity-90 sm:inline">{userEmail}</span>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10"
                        >
                            <LogOut className="h-4 w-4" />
                            Salir
                        </button>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-8">
                <Outlet context={{ apiBase: getApiBase() }} />
            </main>
        </div>
    );
}
