export type ReservationStatus =
    | 'Reservado'
    | 'Pagado'
    | 'Torneo Reservado'
    | 'Torneo Pagado'
    | 'RESERVA FIJA 2025 - 40€ Pagado'
    | 'Reserva Internet Pago parcial'
    | 'Reserva Internet Pagado'
    | 'S7 RESERVAS Reservado'
    | 'DIAGONAL TARIFA PLANA Reservado'
    | 'DIAGONAL ESCUELA DE 17:00 A 23:00 Reservado'
    | 'DIAGONAL ACADEMY 9:00 A 17:00 Reservado'
    | 'RESERVA VALLE CHINO Reservado'
    | 'RESERVA PUNTA CHINO Reservado'
    | 'D.ADICIONAL MAÑANAS (A-D) Reservado'
    | 'Disponible'
    | 'Tiempo pasado';

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
}

export interface Reservation {
    id: string;
    locationId?: string; // Link reservation to a specific location tab
    courtId: string;
    courtName?: string; // Human-readable court name (e.g., "PISTA 3 CENTRAL")
    startTime: string; // e.g., "18:00"
    durationMinutes: number; // e.g., 90
    playerName: string;
    matchType?: string; // e.g., "Playtomic", "ESCUELA ASIATICA", "S7 TORNEOS"
    status: ReservationStatus;
    playerEmail?: string;
    totalPrice?: number;
    isPaidIcon?: boolean;
    paymentNumber?: number;
    hasYellowAlert?: boolean;
    detailedPlayers?: PlayerDetails[];
}
