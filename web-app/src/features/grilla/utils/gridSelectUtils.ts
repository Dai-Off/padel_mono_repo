import type { Reservation } from '../types';
import { MAINTENANCE_NOTE_PREFIX } from './gridMarqueeSelection';

export function isReservationCheckboxSelectable(r: Reservation): boolean {
    if (r.id.startsWith('school-slot-') || r.id.startsWith('school-private-slot-')) return false;
    if (r.status === 'cancelled' || r.status === 'available' || r.status === 'past') return false;
    if (r.booking_type === 'school_course' || r.booking_type === 'school_individual' || r.booking_type === 'school_group') {
        return false;
    }
    return true;
}

export function isMaintenanceReservation(r: Reservation): boolean {
    return r.booking_type === 'blocked' && Boolean(r.notes?.includes(MAINTENANCE_NOTE_PREFIX) || r.matchType === 'MANTENIMIENTO');
}

export function reservationCheckboxLabel(r: Reservation): string {
    if (isMaintenanceReservation(r)) return 'Mantenimiento';
    if (r.booking_type === 'tournament') return r.playerName || 'Torneo';
    return r.playerName || r.matchType || 'Turno';
}
