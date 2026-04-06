// Lifecycle / payment status (maps to bookings.status in DB)
export type ReservationStatus =
    | 'pending_payment'   // Pendiente de cobro
    | 'partial_payment'   // Pago parcial (split en proceso)
    | 'confirmed'         // Confirmada y pagada
    | 'flat_rate'         // Tarifa plana (coste 0 en planilla)
    | 'no_show'           // No se presentó sin avisar con 48h
    | 'completed'         // Jugada y finalizada
    | 'cancelled'         // Cancelada
    | 'available'         // Slot libre (no es un estado de DB, solo UI)
    | 'past';             // Tiempo pasado (solo UI)

// Type of reservation (maps to bookings.booking_type in DB)
export type ReservationType =
    | 'standard'
    | 'open_match'
    | 'pozo'
    | 'fixed_recurring'
    | 'school_course'
    | 'school_group'
    | 'school_individual'
    | 'flat_rate'
    | 'tournament'
    | 'blocked';

export interface PlayerDetails {
    name: string;
    isMember: boolean; // true = socio, false = no socio
    level: number; // e.g., 2.98
    paidAmount: number; // e.g., 3.67
}

export interface Court {
    id: string;
    name: string;
    locationId?: string; // Optional for backward compatibility but used for tabs
    is_hidden?: boolean;
    visibility_windows?: unknown;
}

export interface Reservation {
    id: string;
    locationId?: string;
    courtId: string;
    courtName?: string;
    startTime: string;        // e.g. "18:00"
    durationMinutes: number;  // e.g. 90
    playerName: string;
    /** Display label for the reservation (e.g. i18n of booking_type or custom) */
    matchType?: string;
    status: ReservationStatus;
    booking_type: ReservationType;
    source_channel?: 'mobile' | 'web' | 'manual' | 'system';
    playerEmail?: string;
    totalPrice?: number;
    isPaidIcon?: boolean;
    paymentNumber?: number;
    hasYellowAlert?: boolean;
    detailedPlayers?: PlayerDetails[];
    // Extended fields populated when relevant
    instructorName?: string;         // school bookings
    flatRateAgreementId?: string;    // flat_rate bookings
    pozoEventId?: string;            // pozo bookings
    parentBookingId?: string;        // fixed_recurring instances
    notes?: string;
}
