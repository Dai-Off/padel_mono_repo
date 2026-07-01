export type MatchPlayerRow = {
    id?: string;
    team?: string;
    slot_index?: number | null;
    created_at?: string;
    players?: {
        id?: string;
        first_name?: string;
        last_name?: string;
        elo_rating?: number | null;
    } | null;
};

export function slotIndexFromTeamPosition(team: 'A' | 'B', index: number): number {
    return team === 'A' ? index : index + 2;
}

export function teamFromSlotIndex(slotIndex: number): 'A' | 'B' {
    return slotIndex <= 1 ? 'A' : 'B';
}

export function resolveMatchPlayerSlots(matchPlayers: MatchPlayerRow[]): Array<MatchPlayerRow | null> {
    const slots: Array<MatchPlayerRow | null> = [null, null, null, null];
    const used = new Set<number>();
    const mps = [...(matchPlayers ?? [])];
    const hasSlotIndex = mps.some((mp) => mp?.slot_index != null);

    if (hasSlotIndex) {
        mps.sort((a, b) => (a.slot_index ?? 99) - (b.slot_index ?? 99));
    } else {
        mps.sort((a, b) => {
            if (a.team !== b.team) return a.team === 'A' ? -1 : 1;
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            return aTime - bTime;
        });
    }

    const resolveSlot = (preferred: number, fallbackOrder: number): number => {
        if (preferred >= 0 && preferred <= 3 && !used.has(preferred)) return preferred;
        for (let i = 0; i < 4; i++) {
            const idx = (fallbackOrder + i) % 4;
            if (!used.has(idx)) return idx;
        }
        return -1;
    };

    mps.forEach((mp, i) => {
        const preferred =
            hasSlotIndex && mp.slot_index != null && mp.slot_index >= 0 && mp.slot_index <= 3
                ? mp.slot_index
                : i;
        const idx = resolveSlot(preferred, i);
        if (idx < 0) return;
        used.add(idx);
        slots[idx] = mp;
    });

    return slots;
}

export function nextFreeSlotIndex(usedSlots: Set<number>): number | null {
    for (let i = 0; i < 4; i++) {
        if (!usedSlots.has(i)) return i;
    }
    return null;
}

export function usedSlotIndexes(matchPlayers: MatchPlayerRow[]): Set<number> {
    const used = new Set<number>();
    for (const mp of matchPlayers ?? []) {
        const slot = mp.slot_index;
        if (slot != null && slot >= 0 && slot <= 3) used.add(slot);
    }
    return used;
}

export function buildSyntheticMatchPlayer(
    participant: { id?: string; players?: MatchPlayerRow['players'] | MatchPlayerRow['players'][] },
    slotIndex: number,
): MatchPlayerRow {
    const person = Array.isArray(participant.players) ? participant.players[0] : participant.players;
    return {
        id: participant.id,
        team: teamFromSlotIndex(slotIndex),
        slot_index: slotIndex,
        players: {
            id: person?.id,
            first_name: person?.first_name,
            last_name: person?.last_name,
            elo_rating: person?.elo_rating,
        },
    };
}
