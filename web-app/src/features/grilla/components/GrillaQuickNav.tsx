import { useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

type QuickNavItem = { id: string; path: string; labelKey: string };

function navItemsForUser(isAdmin: boolean): QuickNavItem[] {
  const rows: QuickNavItem[] = [];
  if (isAdmin) {
    rows.push({ id: 'admin', path: '/admin', labelKey: 'admin_panel' });
  }
  rows.push(
    { id: 'resumen', path: '/grilla', labelKey: 'menu_resumen' },
    { id: 'reservas', path: '/grilla', labelKey: 'menu_reservas' },
    { id: 'pistas', path: '/pistas', labelKey: 'menu_pistas' },
    { id: 'horarios', path: '/horarios', labelKey: 'menu_horarios' },
    { id: 'checkIn', path: '/checkIn', labelKey: 'menu_checkin' },
    { id: 'personal', path: '/personal', labelKey: 'menu_personal' },
    { id: 'jugadores', path: '/jugadores', labelKey: 'menu_jugadores' },
    { id: 'miPerfil', path: '/mi-perfil', labelKey: 'menu_mi_perfil' },
    { id: 'escuela', path: '/escuela', labelKey: 'menu_escuela' },
    { id: 'inventario', path: '/inventario', labelKey: 'menu_inventario' },
    { id: 'precios', path: '/precios', labelKey: 'menu_precios_reservas' },
    { id: 'pagos', path: '/pagos', labelKey: 'menu_pagos' },
    { id: 'cierreCaja', path: '/cierreCaja', labelKey: 'menu_cierre_caja' },
    { id: 'crm', path: '/crm', labelKey: 'menu_crm' },
    { id: 'torneos', path: '/torneos', labelKey: 'menu_torneos' },
    { id: 'incidencias', path: '/incidencias', labelKey: 'menu_incidencias' },
    { id: 'resenas', path: '/resenas', labelKey: 'menu_reseñas' },
    { id: 'onboarding', path: '/onboarding', labelKey: 'onboarding_menu' },
    { id: 'configuracion', path: '/configuracion', labelKey: 'menu_configuracion' }
  );
  return rows;
}

function itemIsActive(pathname: string, menuParam: string | null, item: QuickNavItem): boolean {
  if (item.path === '/grilla') {
    if (pathname !== '/grilla') return false;
    if (item.id === 'reservas') return menuParam === 'reservas';
    if (item.id === 'resumen') return menuParam !== 'reservas';
    return false;
  }
  if (item.path === '/torneos') {
    return pathname === '/torneos' || pathname.startsWith('/torneos/');
  }
  return pathname === item.path;
}

const pillClass = (active: boolean) =>
  clsx(
    'px-1.5 py-0.5 rounded text-[10px] transition-all whitespace-nowrap flex-shrink-0 border',
    active
      ? 'bg-[#e53e3e] text-white border-[#e53e3e] font-bold'
      : 'bg-[#097560] text-white border-[#097560] hover:bg-[#0b8b72] font-normal'
  );

export function GrillaQuickNav({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const items = useMemo(() => navItemsForUser(isAdmin), [isAdmin]);
  const menuParam = searchParams.get('menu');

  const go = (item: QuickNavItem) => {
    if (item.path === '/grilla' && (item.id === 'resumen' || item.id === 'reservas')) {
      navigate(`/grilla?menu=${item.id === 'resumen' ? 'resumen' : 'reservas'}`);
    } else {
      navigate(item.path);
    }
  };

  return (
    <nav
      className="bg-[#eef8f6] border-b border-[#00726b]/20 px-2 sm:px-4 py-1.5 flex flex-wrap items-center gap-x-0.5 gap-y-1 z-40 shrink-0"
      aria-label={t('menu_gestion')}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => go(item)}
          className={pillClass(itemIsActive(location.pathname, menuParam, item))}
          title={t(item.labelKey)}
        >
          {t(item.labelKey)}
        </button>
      ))}
    </nav>
  );
}
