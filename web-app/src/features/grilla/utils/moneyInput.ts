export function centsToEuroInput(cents: number): string {
    if (cents <= 0) return '';
    if (cents % 100 === 0) return String(cents / 100);
    return (cents / 100).toFixed(2).replace('.', ',');
}

export function parseEuroInputToCents(raw: string): number {
    const normalized = raw.trim().replace(',', '.');
    if (!normalized || normalized === '.') return 0;
    const n = parseFloat(normalized);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
}

export function sanitizeEuroInput(raw: string): string {
    let cleaned = raw.replace(/[^0-9.,]/g, '');
    const sepIdx = cleaned.search(/[.,]/);
    if (sepIdx !== -1) {
        const intPart = cleaned.slice(0, sepIdx);
        const sep = cleaned[sepIdx];
        const decPart = cleaned.slice(sepIdx + 1).replace(/[.,]/g, '').slice(0, 2);
        cleaned = intPart + sep + decPart;
    }
    return cleaned;
}

export function formatEuroLabel(cents: number): string {
    if (cents % 100 === 0) return String(cents / 100);
    return (cents / 100).toFixed(2).replace('.', ',');
}

/** Reparte el total entre N jugadores (céntimos, redondeo al céntimo más cercano). */
export function shareCentsPerPlayer(totalCents: number, playerCount: number): number {
    if (playerCount <= 0 || totalCents <= 0) return 0;
    return Math.round(totalCents / playerCount);
}

export function countBookingPlayers(
    participants: Array<{ player_id?: string | null }> | undefined,
    organizerPlayerId?: string | null,
    fallbackUiCount = 0,
): number {
    const ids = new Set<string>();
    for (const p of participants ?? []) {
        if (p.player_id) ids.add(String(p.player_id));
    }
    if (organizerPlayerId) ids.add(String(organizerPlayerId));
    if (ids.size > 0) return ids.size;
    return fallbackUiCount;
}
