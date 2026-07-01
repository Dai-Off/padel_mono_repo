import { useEffect, useState, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../../services/auth';
import { HttpError } from '../../services/api';
import { isFixedListPath, pageMainY } from '../../lib/layout';
import { PageLoader } from '../ui/PageLoader';
import { Sidebar } from './Sidebar';
import { AdminHeader } from './AdminHeader';

export function AdminLayout() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const fixedListPage = isFixedListPath(pathname);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const closeSidebar = useCallback(() => setSidebarOpen(false), []);
    const openSidebar = useCallback(() => setSidebarOpen(true), []);

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
                if (!me.ok || !me.roles?.mobile_admin_id) {
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

    useEffect(() => {
        if (!sidebarOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [sidebarOpen]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeSidebar();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [closeSidebar]);

    const handleLogout = () => {
        authService.logout();
        navigate('/login', { replace: true });
    };

    if (loading) {
        return (
            <div className="flex h-[100dvh] min-h-[100dvh] items-center justify-center overflow-hidden bg-auth-bg">
                <PageLoader />
            </div>
        );
    }

    return (
        <div className="flex h-[100dvh] min-h-[100dvh] overflow-hidden bg-auth-bg text-auth-text">
            <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <AdminHeader
                    userEmail={userEmail}
                    onMenuOpen={openSidebar}
                    onLogout={handleLogout}
                />

                <main
                    className={`flex min-h-0 w-full flex-1 flex-col px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pb-safe ${
                        fixedListPage
                            ? 'overflow-hidden pt-2 sm:pt-3'
                            : `overflow-y-auto overscroll-contain ${pageMainY}`
                    }`}
                >
                    <div
                        className={`flex min-h-0 flex-1 flex-col ${fixedListPage ? 'overflow-hidden' : ''}`}
                    >
                        <Outlet context={{ userEmail }} />
                    </div>
                </main>
            </div>
        </div>
    );
}
