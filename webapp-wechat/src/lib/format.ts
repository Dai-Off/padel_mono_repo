export function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
}

export function playerDisplayName(player: { first_name?: string | null; last_name?: string | null }): string {
    const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
    return name || 'Sin nombre';
}

export function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

const PLAYER_STATUS_LABELS: Record<string, string> = {
    active: 'Activo',
    blocked: 'Bloqueado',
    deleted: 'Eliminado',
};

export function playerStatusLabel(status: string): string {
    return PLAYER_STATUS_LABELS[status] ?? status;
}

const STORE_CATEGORY_LABELS: Record<string, string> = {
    palas: 'Palas',
    pelotas: 'Pelotas',
    calzado: 'Calzado',
    ropa: 'Ropa',
    accesorios: 'Accesorios',
};

export function storeCategoryLabel(category: string): string {
    return STORE_CATEGORY_LABELS[category] ?? category;
}

export function formatMoney(cents: number, currency = 'EUR'): string {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(cents / 100);
}

export function eurosToCents(value: string): number | null {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
}

export function centsToEurosInput(cents: number): string {
    return (cents / 100).toFixed(2);
}
