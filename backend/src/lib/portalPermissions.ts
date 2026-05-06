/**
 * Permisos del portal web del club (keys estables API ↔ frontend).
 * `club.manage` implica acceso equivalente al dueño en la mayoría de rutas de negocio (no crea/borra club).
 */
export const PORTAL_PERMISSION_KEYS = [
  'club.manage',
  'roles.manage',
  'grilla',
  'clientes',
  'finanzas',
  'torneos',
  'escuela',
  'gestion',
  'configuracion',
] as const;

export type PortalPermissionKey = (typeof PORTAL_PERMISSION_KEYS)[number];

export const PORTAL_PERMISSION_LABELS: Record<PortalPermissionKey, string> = {
  'club.manage': 'Administración completa del club (panel)',
  'roles.manage': 'Roles del club e invitaciones',
  grilla: 'Reservas, grilla, pistas y horarios',
  clientes: 'Jugadores y CRM',
  finanzas: 'Precios, tarifas, pagos y cierre de caja',
  torneos: 'Torneos y ligas',
  escuela: 'Escuela y cursos',
  gestion: 'Personal operativo, inventario, incidencias y reseñas',
  configuracion: 'Datos y notificaciones del club',
};

export function isValidPermissionKey(k: string): k is PortalPermissionKey {
  return (PORTAL_PERMISSION_KEYS as readonly string[]).includes(k);
}

export function normalizePermissionKeys(keys: unknown): PortalPermissionKey[] {
  if (!Array.isArray(keys)) return [];
  const out: PortalPermissionKey[] = [];
  for (const raw of keys) {
    const s = String(raw ?? '').trim();
    if (isValidPermissionKey(s) && !out.includes(s)) out.push(s);
  }
  return out;
}
