import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
    BarChart3,
    Grid3x3,
    Calendar,
    Clock,
    UserPlus,
    Users,
    Award,
    DollarSign,
    MessageCircle,
    AlertCircle,
    Star,
    Settings,
    Shield,
    UserCog,
    BookOpen,
    Trophy,
    ShoppingCart,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { portalMenuItemAllowed } from '../../lib/portalNavPermissions';
import { useClubChatMentionsCount } from '../../hooks/useClubChatMentionsCount';

interface MainMenuProps {
    isOpen: boolean;
    onClose: () => void;
    clubName: string;
    /** Club actual (menciones @club en badge de Chats). */
    clubId?: string | null;
    isAdmin?: boolean;
    /** null = acceso completo (dueño o admin). Array = permisos del rol de portal para el club actual. */
    portalMenuPermissionKeys?: string[] | null;
    loading?: boolean;
}

export const MainMenu: React.FC<MainMenuProps> = ({ isOpen, onClose, clubId, isAdmin, portalMenuPermissionKeys, loading }) => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const grillaMenu = searchParams.get('menu');
    const chatMentionsCount = useClubChatMentionsCount(clubId);

    const menuSections = useMemo(() => {
        const adminItem = isAdmin
            ? { id: 'admin', path: '/admin', icon: Shield, label: t('admin_panel'), color: 'rgb(227, 30, 36)', bgColor: 'rgba(227, 30, 36, 0.1)' }
            : null;
        const raw = [
            ...(adminItem ? [{ title: 'Admin', items: [adminItem] }] : []),
            {
                title: 'Reservas',
                items: [
                    { id: 'resumen', path: '/grilla', icon: BarChart3, label: t('menu_resumen'), color: 'rgb(227, 30, 36)', bgColor: 'rgba(227, 30, 36, 0.06)' },
                    { id: 'reservas', path: '/grilla', icon: Calendar, label: t('menu_reservas'), color: 'rgb(16, 185, 129)', bgColor: 'rgba(16, 185, 129, 0.06)' },
                    { id: 'checkIn', path: '/checkIn', icon: UserPlus, label: t('menu_checkin'), color: 'rgb(139, 92, 246)', bgColor: 'rgba(139, 92, 246, 0.06)' },
                    { id: 'pistas', path: '/pistas', icon: Grid3x3, label: t('menu_pistas'), color: 'rgb(91, 141, 238)', bgColor: 'rgba(91, 141, 238, 0.1)' },
                    { id: 'horarios', path: '/horarios', icon: Clock, label: t('menu_horarios'), color: 'rgb(245, 158, 11)', bgColor: 'rgba(245, 158, 11, 0.06)' },
                    { id: 'fechas-especiales', path: '/fechas-especiales', icon: Calendar, label: 'Fechas especiales', color: 'rgb(217, 119, 6)', bgColor: 'rgba(217, 119, 6, 0.06)' },
                ],
            },
            {
                title: 'Clientes',
                items: [
                    { id: 'jugadores', path: '/jugadores', icon: Users, label: t('menu_jugadores'), color: 'rgb(20, 184, 166)', bgColor: 'rgba(20, 184, 166, 0.06)' },
                ],
            },
            {
                title: t('menu_finanzas'),
                items: [
                    { id: 'precios', path: '/precios', icon: DollarSign, label: t('menu_precios_reservas'), color: 'rgb(16, 185, 129)', bgColor: 'rgba(16, 185, 129, 0.06)' },
                    { id: 'pagos', path: '/pagos', icon: DollarSign, label: t('menu_pagos'), color: 'rgb(16, 185, 129)', bgColor: 'rgba(16, 185, 129, 0.06)' },
                    { id: 'cierreCaja', path: '/cierreCaja', icon: DollarSign, label: t('menu_cierre_caja'), color: 'rgb(5, 150, 105)', bgColor: 'rgba(5, 150, 105, 0.06)' },
                ],
            },
            {
                title: t('menu_torneos'),
                items: [
                    { id: 'torneos', path: '/torneos', icon: Trophy, label: t('menu_torneos'), color: 'rgb(234, 179, 8)', bgColor: 'rgba(234, 179, 8, 0.08)' },
                ],
            },
            {
                title: 'Escuela',
                items: [
                    { id: 'escuela', path: '/escuela', icon: Award, label: t('menu_escuela'), color: 'rgb(249, 115, 22)', bgColor: 'rgba(249, 115, 22, 0.06)' },
                    { id: 'contenido-aprendizaje', path: '/contenido-aprendizaje', icon: BookOpen, label: t('menu_learning_content'), color: 'rgb(99, 102, 241)', bgColor: 'rgba(99, 102, 241, 0.06)' },
                ],
            },
            {
                title: t('menu_gestion'),
                items: [
                    { id: 'personal', path: '/personal', icon: Users, label: t('menu_personal'), color: 'rgb(236, 72, 153)', bgColor: 'rgba(236, 72, 153, 0.06)' },
                    { id: 'inventario', path: '/inventario', icon: Grid3x3, label: t('menu_inventario'), color: 'rgb(99, 102, 241)', bgColor: 'rgba(99, 102, 241, 0.06)' },
                    { id: 'carrito', path: '/carrito', icon: ShoppingCart, label: 'Carrito', color: 'rgb(11, 91, 122)', bgColor: 'rgba(11, 91, 122, 0.08)' },
                    { id: 'incidencias', path: '/incidencias', icon: AlertCircle, label: t('menu_incidencias'), color: 'rgb(239, 68, 68)', bgColor: 'rgba(239, 68, 68, 0.06)' },
                    { id: 'resenas', path: '/resenas', icon: Star, label: t('menu_reseñas'), color: 'rgb(245, 158, 11)', bgColor: 'rgba(245, 158, 11, 0.06)' },
                ],
            },
            {
                title: 'Chats',
                items: [
                    { id: 'chats', path: '/chats', icon: MessageCircle, label: 'Chats', color: 'rgb(79, 70, 229)', bgColor: 'rgba(79, 70, 229, 0.08)' },
                ],
            },
            {
                title: t('menu_configuracion'),
                items: [
                    { id: 'configuracion', path: '/configuracion', icon: Settings, label: 'Configuración del club', color: 'rgb(107, 114, 128)', bgColor: 'rgba(107, 114, 128, 0.06)' },
                    { id: 'deportes', path: '/deportes', icon: Trophy, label: 'Deportes', color: 'rgb(16, 185, 129)', bgColor: 'rgba(16, 185, 129, 0.08)' },
                    {
                        id: 'equipoRoles',
                        path: '/equipo-portal',
                        icon: UserCog,
                        label: 'Gestión de personal',
                        color: 'rgb(99, 102, 241)',
                        bgColor: 'rgba(99, 102, 241, 0.08)',
                    },
                    { id: 'onboarding', path: '/onboarding', icon: Settings, label: 'Asistente inicial', color: 'rgb(107, 114, 128)', bgColor: 'rgba(107, 114, 128, 0.06)' },
                ],
            },
        ];

        return raw
            .map((section) => ({
                ...section,
                items: section.items.filter((item) => portalMenuItemAllowed(item.id, portalMenuPermissionKeys)),
            }))
            .filter((section) => section.items.length > 0);
    }, [isAdmin, portalMenuPermissionKeys, t]);

    const showChatsMentionBadge = chatMentionsCount > 0;

    const handleItemClick = (item: { path: string; id: string }) => {
        if (item.path === '/grilla' && (item.id === 'resumen' || item.id === 'reservas')) {
            navigate(`/grilla?menu=${item.id}`);
        } else if (item.id === 'equipoRoles') {
            navigate('/equipo-portal');
        } else {
            navigate(item.path);
        }
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-60"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    <motion.div
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] shadow-2xl z-70 max-h-[85vh] overflow-y-auto"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    >
                        <div className="sticky top-0 bg-white pt-3 pb-2 z-10">
                            <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto" />
                        </div>

                        <div className="px-5 pb-8 space-y-6">
                            {loading ? (
                                // Skeleton loader for mobile menu
                                Array.from({ length: 3 }).map((_, secIdx) => (
                                    <div key={secIdx} className="space-y-4 animate-pulse">
                                        <div className="w-20 h-2 bg-gray-100 rounded ml-1" />
                                        <div className="space-y-2">
                                            {Array.from({ length: 3 }).map((_, itemIdx) => (
                                                <div key={itemIdx} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-gray-50/50">
                                                    <div className="w-9 h-9 rounded-xl bg-gray-100" />
                                                    <div className="w-32 h-3 bg-gray-100 rounded" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                menuSections.map((section, idx) => (
                                <div key={idx} className="space-y-2">
                                    <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.15em] mb-2 px-1">
                                        {section.title}
                                    </p>
                                    <div className="space-y-1">
                                        {section.items.map((item, itemIdx) => {
                                            const isGrillaEntry =
                                                item.path === '/grilla' &&
                                                (item.id === 'resumen' || item.id === 'reservas');
                                            const isActive = isGrillaEntry
                                                ? location.pathname === '/grilla' && grillaMenu === item.id
                                                : location.pathname === item.path;
                                            const showChatsBadge = item.id === 'chats' && showChatsMentionBadge;
                                            return (
                                                <motion.button
                                                    key={itemIdx}
                                                    type="button"
                                                    onClick={() => handleItemClick(item)}
                                                    whileTap={{ scale: 0.98 }}
                                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all ${isActive
                                                        ? 'bg-[#1A1A1A] text-white shadow-xl shadow-black/10'
                                                        : 'text-[#1A1A1A] hover:bg-gray-50 border border-transparent'
                                                        }`}
                                                >
                                                    <div
                                                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 relative"
                                                        style={{
                                                            backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : item.bgColor
                                                        }}
                                                    >
                                                        <item.icon
                                                            className="w-5 h-5"
                                                            style={{ color: isActive ? '#FFF' : item.color }}
                                                        />
                                                        {showChatsBadge && (
                                                            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-0.5 flex items-center justify-center rounded-full bg-[#E31E24] text-[10px] font-bold text-white border-2 border-white shadow-sm">
                                                                1
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`text-sm flex-1 text-left ${isActive ? 'font-bold' : 'font-semibold'}`}>
                                                        {item.label}
                                                    </span>
                                                    {isActive && (
                                                        <div className="w-1.5 h-1.5 rounded-full bg-[#E31E24] shrink-0" />
                                                    )}
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )))}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
