import { Menu, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth';

interface HeaderProps {
    clubName: string;
    isOnline?: boolean;
    onToggleMenu?: () => void;
}

export const Header = ({ clubName, isOnline = true, onToggleMenu }: HeaderProps) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();

    const handleLogout = () => {
        authService.logout();
        navigate('/login');
    };

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
    };

    const currentLanguage = i18n.language.split('-')[0];

    return (
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border-subtle">
            <div className="px-5 py-3.5">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onToggleMenu}
                            className="w-10 h-10 rounded-xl bg-card border border-border-subtle flex items-center justify-center hover:bg-gray-50 transition-colors">
                            <Menu className="w-5 h-5 text-primary" />
                        </button>

                        <div className="w-9 h-9 rounded-xl overflow-hidden bg-white border border-border-subtle p-1 flex-shrink-0">
                            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-sm font-bold text-primary truncate">{clubName}</h1>
                            <div className="flex items-center gap-1.5">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isOnline ? 'bg-success' : 'bg-error'}`}></span>
                                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? 'bg-success' : 'bg-error'}`}></span>
                                </span>
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                    {isOnline ? t('online') : t('offline')}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Selector de Idioma */}
                        <div className="hidden sm:flex items-center bg-card border border-border-subtle rounded-xl p-1">
                            {['es', 'en', 'zh'].map((lng) => (
                                <button
                                    key={lng}
                                    onClick={() => changeLanguage(lng)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${currentLanguage === lng
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-primary'
                                        }`}
                                >
                                    {lng === 'zh' ? 'ZH' : lng}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all"
                            title={t('logout')}
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{t('logout')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};
