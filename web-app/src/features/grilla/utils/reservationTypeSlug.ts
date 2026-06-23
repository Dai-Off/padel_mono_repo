/** Mapea display names o variantes legacy al slug de sistema en `bookings.reservation_type`. */
const DISPLAY_OR_ALIAS_TO_SLUG: Record<string, string> = {
    'partido abierto': 'open_match',
    'pista privada': 'standard',
    'pozo / americanas': 'pozo',
    americanas: 'pozo',
    'turno fijo': 'fixed_recurring',
    'escuela grupo': 'school_group',
    'clase particular': 'school_individual',
    'tarifa plana': 'flat_rate',
    torneo: 'tournament',
    bloqueado: 'blocked',
    'bloqueo administrativo': 'blocked',
};

export function normalizeReservationTypeSlug(type: string | null | undefined): string {
    if (!type?.trim()) return 'standard';
    const trimmed = type.trim();
    const fromDisplay = DISPLAY_OR_ALIAS_TO_SLUG[trimmed.toLowerCase()];
    return fromDisplay ?? trimmed;
}

export function isOpenMatchType(type: string | null | undefined): boolean {
    return normalizeReservationTypeSlug(type) === 'open_match';
}
