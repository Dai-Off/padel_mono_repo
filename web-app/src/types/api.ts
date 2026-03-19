export interface Player {
    id: string;
    created_at: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    elo_rating: number;
    status: 'active' | 'blocked' | 'deleted';
    auth_user_id?: string | null;
}

export interface ClubOwner {
    id: string;
    created_at: string;
    name: string;
    email: string;
    phone: string | null;
    stripe_connect_account_id: string;
    kyc_status: string;
    status: string;
}

export interface Club {
    id: string;
    created_at: string;
    owner_id: string;
    fiscal_tax_id: string;
    fiscal_legal_name: string;
    name: string;
    description: string | null;
    address: string;
    city: string;
    postal_code: string;
    lat: number | null;
    lng: number | null;
    base_currency: string;
    weekly_schedule?: any;
    schedule_exceptions?: any[];
}

export type BookingType =
    | 'standard'           // Pista privada normal
    | 'open_match'         // Partido abierto (ELO-based, hasta 4 jugadores)
    | 'pozo'               // Americanas / Melee
    | 'fixed_recurring'    // Turno fijo semanal por temporada
    | 'school_group'       // Clase de grupo con cuota mensual
    | 'school_individual'  // Clase particular (pago suelto o bono)
    | 'flat_rate'          // Tarifa plana (coste 0 en planilla, factura mensual)
    | 'tournament'         // Pistas bloqueadas para torneo externo
    | 'blocked';           // Bloqueo administrativo de pista

export type BookingSourceChannel = 'mobile' | 'web' | 'manual' | 'system';

export type BookingStatus =
    | 'pending_payment'  // Pendiente de cobro
    | 'partial_payment'  // Split en proceso
    | 'confirmed'        // Confirmada y pagada
    | 'flat_rate'        // Coste 0 en planilla (factura a mes vencido)
    | 'no_show'          // No se presentó sin avisar con 48h
    | 'completed'        // Jugada y finalizada
    | 'cancelled';       // Cancelada

export interface Booking {
    id: string;
    created_at: string;
    court_id: string;
    organizer_player_id: string | null;   // null para flat_rate, tournament, blocked
    instructor_player_id?: string | null; // para school_group / school_individual
    start_at: string;
    end_at: string;
    timezone: string;
    total_price_cents: number;
    currency: string;
    booking_type: BookingType;
    source_channel: BookingSourceChannel;
    status: BookingStatus;
    notes?: string | null;
    parent_booking_id?: string | null;          // turno fijo: apunta a la plantilla
    flat_rate_agreement_id?: string | null;     // tarifa plana
    school_group_id?: string | null;            // clase de grupo
    class_bono_id?: string | null;              // clase particular con bono
    pozo_event_id?: string | null;              // americanas / melee
}

// ── Tarifa Plana ─────────────────────────────────────────────

export interface FlatRateAgreement {
    id: string;
    club_id: string;
    counterparty_name: string;
    monthly_amount_cents: number;
    currency: string;
    season_start: string;
    season_end: string;
    notes?: string | null;
    status: 'active' | 'paused' | 'terminated';
    created_at: string;
    updated_at: string;
}

export interface FlatRateCourtSchedule {
    id: string;
    agreement_id: string;
    court_id: string;
    day_of_week: number;   // 1=lunes … 7=domingo
    start_minutes: number;
    end_minutes: number;
}

// ── Turno Fijo ───────────────────────────────────────────────

export interface BookingRecurrence {
    id: string;
    template_booking_id: string;
    rrule: string;          // RFC 5545, e.g. "FREQ=WEEKLY;BYDAY=TH"
    season_start: string;
    season_end: string;
    cancellation_notice_hours: number;
    prepaid_weeks: number;
    no_show_policy: 'charge_always' | 'charge_if_unsold' | 'refund_to_wallet';
    created_at: string;
}

// ── Escuelas ─────────────────────────────────────────────────

export interface SchoolGroup {
    id: string;
    club_id: string;
    name: string;
    instructor_player_id?: string | null;
    level_description?: string | null;
    max_students: number;
    monthly_fee_cents: number;
    currency: string;
    day_of_week: number;
    start_minutes: number;
    duration_minutes: number;
    season_start: string;
    season_end: string;
    status: 'active' | 'inactive';
    created_at: string;
    updated_at: string;
}

export interface SchoolGroupEnrollment {
    id: string;
    group_id: string;
    player_id: string;
    enrolled_at: string;
    left_at?: string | null;
    monthly_fee_override_cents?: number | null;
}

export interface ClassBono {
    id: string;
    player_id: string;
    club_id: string;
    total_classes: number;
    remaining_classes: number;
    price_cents: number;
    currency: string;
    expires_at?: string | null;
    purchased_at: string;
    status: 'active' | 'exhausted' | 'expired' | 'cancelled';
}

// ── Pozo / Americanas ────────────────────────────────────────

export interface PozoEvent {
    id: string;
    club_id: string;
    name: string;
    event_date: string;
    start_time: string;
    end_time: string;
    max_participants: number;
    current_participants: number;
    rotation_mode: 'americanas' | 'melee' | 'fixed_pairs' | 'custom';
    level_min?: number | null;
    level_max?: number | null;
    price_per_player_cents?: number | null;
    currency: string;
    additional_info?: string | null;
    status: 'draft' | 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';
    created_at: string;
    updated_at: string;
}

export interface PozoParticipant {
    id: string;
    pozo_event_id: string;
    player_id: string;
    registered_at: string;
    payment_status: 'pending' | 'paid' | 'refunded' | 'no_show';
}

export interface Match {
    id: string;
    created_at: string;
    booking_id: string;
    visibility: 'public' | 'private';
    elo_min: number | null;
    elo_max: number | null;
    gender: string;
    competitive: boolean;
    status: 'open' | 'full' | 'cancelled';
}

export interface ApiResponse<T> {
    ok: boolean;
    data?: T;
    error?: string;
    [key: string]: any; // Para soportar el formato { ok: true, players: [...] }
}
