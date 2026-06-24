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
