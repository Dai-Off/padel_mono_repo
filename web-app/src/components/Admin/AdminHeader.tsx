import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authService } from '../../services/auth';

export const AdminHeader = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const handleLogout = () => {
        authService.logout();
        navigate('/login');
    };

    return (
        <header className="sticky top-0 z-[55] bg-background/95 backdrop-blur-md border-b border-border-subtle">
            <div className="px-5 py-3.5">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl overflow-hidden bg-white border border-border-subtle p-1 flex-shrink-0">
                            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                        </div>
                        <h1 className="text-sm font-bold text-primary">{t('admin_panel')}</h1>
                    </div>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-all"
                        title={t('logout')}
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t('logout')}</span>
                    </button>
                </div>
            </div>
        </header>
    );
};
