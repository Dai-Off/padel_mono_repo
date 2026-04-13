import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Menu, ArrowLeft, Globe } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth';

export type PortalTealHeaderProps = {
  /** Nombre del club o título de pantalla (ej. panel admin). */
  clubName: string;
  /** Abre el menú lateral (drawer). Si no se pasa, el botón hamburguesa no se muestra. */
  onMenuClick?: () => void;
};

const PORTAL_HEADER_ROOT_ID = 'portal-header-root';

function getPortalHeaderRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(PORTAL_HEADER_ROOT_ID);
}

/**
 * Cabecera teal del portal. Se monta en #portal-header-root (antes de #root en el HTML)
 * para no quedar colgada al final del body tras el script de Vite; position:fixed evita
 * ancestros con transform/overflow dentro de la app.
 */
export function PortalTealHeader({ clubName, onMenuClick }: PortalTealHeaderProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const logout = () => {
    authService.logout();
    navigate('/login', { replace: true });
  };

  const title = clubName.trim() || 'Club';

  const header = (
    <header
      className="fixed top-0 left-0 right-0 z-[55] box-border flex h-12 md:h-14 items-center justify-between gap-3 bg-portal-header px-4 md:px-6 border-b border-portal-header-edge"
      style={{
        boxSizing: 'border-box',
        backgroundColor: 'var(--color-portal-header, #00726b)',
        borderBottom: '1px solid var(--color-portal-header-edge, #005a4f)',
        zIndex: 55,
      }}
    >
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden w-9 h-9 bg-white/20 border border-white/30 rounded-lg flex items-center justify-center text-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-white/30 flex-shrink-0 transition-colors"
            aria-label={t('menu_principal')}
          >
            <Menu className="w-5 h-5 text-white" />
          </button>
        )}
        <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white border border-white/30 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.1)] relative p-[2px]">
          <div className="w-full h-full rounded-full border border-gray-900 bg-white flex items-center justify-center">
            <span className="font-extrabold text-[10px] sm:text-xs text-black italic tracking-tighter">X7</span>
          </div>
        </div>
        <div className="flex flex-col min-w-0">
          <h1 className="text-[13px] md:text-sm font-bold text-white leading-tight truncate">{title}</h1>
        </div>
      </div>
      <div className="relative flex items-center gap-2 flex-shrink-0">
        <div className="relative" ref={langRef}>
          <button
            type="button"
            onClick={() => setLangMenuOpen((v) => !v)}
            className="w-9 h-9 md:w-10 md:h-10 bg-white/20 border border-white/30 rounded-lg flex items-center justify-center text-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-white/30 flex-shrink-0 transition-colors"
            title={t('club_settings_language')}
          >
            <Globe className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </button>
          {langMenuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[60] overflow-hidden min-w-[160px]">
              {(
                [
                  ['es', 'Español 🇪🇸'],
                  ['en', 'English 🇬🇧'],
                  ['zh', '中文 🇨🇳'],
                ] as const
              ).map(([code, label]) => {
                const active = i18n.language === code || i18n.language.startsWith(`${code}-`);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      void i18n.changeLanguage(code);
                      setLangMenuOpen(false);
                    }}
                    className={clsx(
                      'w-full text-left px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2',
                      active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={logout}
          className="bg-[#1f1f1f] hover:bg-black text-white px-3 py-2 md:px-5 md:py-2.5 rounded-full font-medium text-xs md:text-sm flex items-center gap-2 transition-colors flex-shrink-0 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 md:w-4.5 md:h-4.5" />
          <span className="hidden sm:inline">{t('logout')}</span>
        </button>
      </div>
    </header>
  );

  const mount = getPortalHeaderRoot();

  return (
    <>
      {mount ? createPortal(header, mount) : header}
      <div className="h-12 md:h-14 w-full shrink-0" aria-hidden />
    </>
  );
}
