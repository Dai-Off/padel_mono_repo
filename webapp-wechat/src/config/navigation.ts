import type { LucideIcon } from 'lucide-react';
import {
    LayoutDashboard,
    Users,
    Building2,
    ShoppingBag,
    GraduationCap,
    Ticket,
} from 'lucide-react';

export type NavItem = {
    id: string;
    label: string;
    path: string;
    icon: LucideIcon;
    description?: string;
};

export const NAV_ITEMS: NavItem[] = [
    {
        id: 'inicio',
        label: 'Inicio',
        path: '/',
        icon: LayoutDashboard,
    },
    {
        id: 'usuarios',
        label: 'Usuarios',
        path: '/usuarios',
        icon: Users,
        description: 'Jugadores y cuentas de la aplicación',
    },
    {
        id: 'clubes',
        label: 'Clubes',
        path: '/clubes',
        icon: Building2,
        description: 'Clubes y configuración de la plataforma',
    },
    {
        id: 'tienda',
        label: 'Tienda',
        path: '/tienda',
        icon: ShoppingBag,
        description: 'Productos y ofertas de la tienda',
    },
    {
        id: 'cursos',
        label: 'Cursos',
        path: '/cursos',
        icon: GraduationCap,
        description: 'Cursos digitales y aprendizaje',
    },
    {
        id: 'codigo-promocional',
        label: 'Códigos promocionales',
        path: '/codigo-promocional',
        icon: Ticket,
        description: 'Cupones, descuentos y campañas',
    },
];

export function getNavItemByPath(pathname: string): NavItem | undefined {
    if (pathname === '/') return NAV_ITEMS[0];
    return NAV_ITEMS.find((item) => item.path !== '/' && pathname.startsWith(item.path));
}
