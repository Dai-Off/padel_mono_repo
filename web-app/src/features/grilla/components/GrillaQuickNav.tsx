import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  Calendar,
  Users,
  DollarSign,
  GraduationCap,
  BarChart3,
  Settings,
  Shield,
  ClipboardList,
  Trophy,
  MessageCircle,
  ShoppingCart,
} from 'lucide-react';
import { portalMenuItemAllowed } from '../../../lib/portalNavPermissions';
import { useClubChatMentionsCount } from '../../../hooks/useClubChatMentionsCount';

type NavChild = { id: string; path: string; label: string; queryParam?: string; search?: string };
type NavSection = {
  id: string;
  label: string;
  icon: React.ElementType;
  children: NavChild[];
};

function buildSections(isAdmin: boolean): NavSection[] {
  const sections: NavSection[] = [];

  if (isAdmin) {
    sections.push({
      id: 'admin',
      label: 'Admin',
      icon: Shield,
      children: [{ id: 'admin', path: '/admin', label: 'Panel Admin' }],
    });
  }

  sections.push(
    {
      id: 'operativa',
      label: 'Reservas',
      icon: Calendar,
      children: [
        { id: 'resumen', path: '/grilla', label: 'Resumen', queryParam: 'resumen' },
        { id: 'reservas', path: '/grilla', label: 'Grilla de reservas', queryParam: 'reservas' },
        { id: 'checkIn', path: '/checkIn', label: 'Check-in' },
        { id: 'pistas', path: '/pistas', label: 'Pistas' },
        { id: 'horarios', path: '/horarios', label: 'Horarios' },
        { id: 'fechas-especiales', path: '/fechas-especiales', label: 'Fechas especiales' },
      ],
    },
    {
      id: 'clientes',
      label: 'Clientes',
      icon: Users,
      children: [
        { id: 'jugadores', path: '/jugadores', label: 'Jugadores' },
      ],
    },
    {
      id: 'finanzas',
      label: 'Finanzas',
      icon: DollarSign,
      children: [
        { id: 'precios', path: '/precios', label: 'Precios por reserva' },
        { id: 'tarifas', path: '/tarifas', label: 'Tarifas del club' },
        { id: 'pagos', path: '/pagos', label: 'Pagos' },
        { id: 'cierreCaja', path: '/cierreCaja', label: 'Cierre de caja' },
      ],
    },
    {
      id: 'pagos',
      label: 'TPV',
      icon: ShoppingCart,
      children: [
        { id: 'carrito', path: '/carrito', label: 'Carrito' },
        { id: 'pagos', path: '/pagos', label: 'Pagos' },
      ],
    },
    {
      id: 'torneos',
      label: 'Torneos',
      icon: Trophy,
      children: [
        { id: 'torneos', path: '/torneos', label: 'Torneos' },
      ],
    },
    {
      id: 'escuela',
      label: 'Escuela',
      icon: GraduationCap,
      children: [
        { id: 'escuela', path: '/escuela', label: 'Gestión Escuela' },
        { id: 'contenido-aprendizaje', path: '/contenido-aprendizaje', label: 'Contenido de aprendizaje' },
      ],
    },
    {
      id: 'gestion',
      label: 'Gestión',
      icon: ClipboardList,
      children: [
        { id: 'personal', path: '/personal', label: 'Personal' },
        { id: 'inventario', path: '/inventario', label: 'Inventario' },
        { id: 'incidencias', path: '/incidencias', label: 'Incidencias' },
        { id: 'resenas', path: '/resenas', label: 'Reseñas' },
      ],
    },
    {
      id: 'informes',
      label: 'Informes',
      icon: BarChart3,
      children: [
        { id: 'cierreCaja', path: '/cierreCaja', label: 'Cierre de caja' },
      ],
    },
    {
      id: 'chats',
      label: 'Chats',
      icon: MessageCircle,
      children: [
        { id: 'chats', path: '/chats', label: 'Chats' },
      ],
    },
    {
      id: 'config',
      label: 'Configuración',
      icon: Settings,
      children: [
        { id: 'configuracion', path: '/configuracion', label: 'Configuración del club' },
        { id: 'deportes', path: '/deportes', label: 'Deportes' },
        { id: 'equipoRoles', path: '/equipo-portal', label: 'Gestión de personal' },
        { id: 'onboarding', path: '/onboarding', label: 'Asistente inicial' },
      ],
    }
  );

  return sections;
}

function isChildActive(
  pathname: string,
  menuParam: string | null,
  child: NavChild
): boolean {
  if (child.path === '/grilla') {
    if (pathname !== '/grilla') return false;
    if (child.queryParam === 'reservas') return menuParam === 'reservas';
    if (child.queryParam === 'resumen') return menuParam !== 'reservas';
    return false;
  }
  if (child.path === '/torneos') {
    return pathname === '/torneos' || pathname.startsWith('/torneos/');
  }
  return pathname === child.path;
}

function isSectionActive(
  pathname: string,
  menuParam: string | null,
  section: NavSection
): boolean {
  return section.children.some((c) => isChildActive(pathname, menuParam, c));
}

export function GrillaQuickNav({
  isAdmin,
  portalMenuPermissionKeys,
  clubId,
  loading,
}: {
  isAdmin: boolean;
  portalMenuPermissionKeys?: string[] | null;
  clubId?: string | null;
  loading?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const menuParam = searchParams.get('menu');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const chatMentionsCount = useClubChatMentionsCount(clubId);
  const showChatsMentionBadge = chatMentionsCount > 0;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenSection(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const sections = useMemo(() => {
    const built = buildSections(isAdmin);
    if (portalMenuPermissionKeys == null) return built;
    return built
      .map((sec) => ({
        ...sec,
        children: sec.children.filter((c) => portalMenuItemAllowed(c.id, portalMenuPermissionKeys)),
      }))
      .filter((sec) => sec.children.length > 0);
  }, [isAdmin, portalMenuPermissionKeys]);

  const go = (child: NavChild) => {
    if (child.path === '/grilla' && child.queryParam) {
      navigate(`/grilla?menu=${child.queryParam}`);
    } else {
      navigate(child.path);
    }
    setOpenSection(null);
  };

  return (
    <nav
      ref={navRef}
      className="bg-white border-b border-gray-200 z-40 shrink-0"
      aria-label="Navegación principal"
    >
      <div className="flex items-stretch justify-start">
        {loading ? (
          // Skeleton Loader
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center justify-center gap-2 px-4 py-2.5 min-w-[72px] animate-pulse">
              <div className="w-5 h-5 bg-gray-200 rounded-full" />
              <div className="w-10 h-2 bg-gray-200 rounded" />
            </div>
          ))
        ) : (
          sections.map((section) => {
            const active = isSectionActive(location.pathname, menuParam, section);
            const isOpen = openSection === section.id;
            const Icon = section.icon;

            return (
              <div key={section.id} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (section.children.length === 1) {
                      go(section.children[0]);
                    } else {
                      setOpenSection(isOpen ? null : section.id);
                    }
                  }}
                  className={clsx(
                    'flex flex-col items-center justify-center gap-1 px-4 py-2.5 transition-colors border-b-2 min-w-[72px]',
                    active
                      ? 'border-portal-header text-portal-header'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50',
                    isOpen && 'bg-gray-50'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-semibold leading-tight whitespace-nowrap">
                    {section.label}
                  </span>
                </button>

              {isOpen && section.children.length > 1 && (
                <div className="absolute top-full left-0 mt-0 bg-white border border-gray-200 rounded-b-lg shadow-lg z-50 min-w-[200px] py-1">
                  {section.children.map((child) => {
                    const childActive = isChildActive(location.pathname, menuParam, child);
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => go(child)}
                        className={clsx(
                          'w-full text-left px-4 py-2 text-[12px] transition-colors flex items-center justify-between gap-2',
                          childActive
                            ? 'bg-portal-header/5 text-portal-header font-bold'
                            : 'text-gray-700 hover:bg-gray-50 font-medium'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {childActive && <span className="w-1.5 h-1.5 rounded-full bg-portal-header shrink-0" />}
                          <span className="truncate">{child.label}</span>
                        </span>
                        {child.id === 'chats' && showChatsMentionBadge ? (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-0.5 flex items-center justify-center rounded-full bg-[#E31E24] text-[10px] font-bold text-white">
                            1
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }))}
      </div>
    </nav>
  );
}
