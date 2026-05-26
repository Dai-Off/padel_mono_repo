/**
 * Permisos del portal requeridos por cada id de entrada de navegación (menú lateral y barra desktop).
 * Debe mantenerse alineado con `backend/src/lib/portalPermissions.ts`.
 */
export const PORTAL_MENU_ITEM_PERMS: Record<string, string[]> = {
    resumen: ['grilla'],
    reservas: ['grilla'],
    'lista-reservas': ['grilla'],
    checkIn: ['grilla'],
    pistas: ['grilla'],
    horarios: ['grilla'],
    'fechas-especiales': ['grilla'],
    jugadores: ['clientes'],
    /** Chats del club (turnos / torneos): clientes o configuración. */
    chats: ['clientes', 'configuracion'],
    precios: ['finanzas'],
    tarifas: ['finanzas'],
    pagos: ['finanzas'],
    cierreCaja: ['finanzas'],
    torneos: ['torneos'],
    escuela: ['escuela'],
    'contenido-aprendizaje': ['escuela'],
    personal: ['gestion'],
    inventario: ['gestion'],
    carrito: ['gestion'],
    incidencias: ['gestion'],
    resenas: ['gestion'],
    configuracion: ['configuracion'],
    equipoRoles: ['roles.manage'],
    onboarding: ['club.manage'],
    admin: [],
};

export function portalMenuItemAllowed(itemId: string, portalPermissionKeys: string[] | null | undefined): boolean {
    if (portalPermissionKeys == null) return true;
    if (portalPermissionKeys.includes('club.manage')) return true;
    const need = PORTAL_MENU_ITEM_PERMS[itemId];
    if (!need || need.length === 0) return true;
    return need.some((p) => portalPermissionKeys.includes(p));
}
