import type { Reservation } from '../types';

export const MAINTENANCE_NOTE_PREFIX = '__COURT_MAINTENANCE__';

export type GridSlot = { courtId: string; courtName: string; startMins: number };

export function slotKey(courtId: string, startMins: number): string {
    return `${courtId}:${startMins}`;
}

export function minutesToTimeStr(startMins: number): string {
    const h = Math.floor(startMins / 60);
    const m = startMins % 60;
    const displayH = h >= 24 ? h - 24 : h;
    return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function timeStrToMinutes(time: string, gridStartHour: number): number {
    const [h, m] = time.split(':').map(Number);
    let absH = h;
    if (h < gridStartHour && gridStartHour > 0) absH += 24;
    return absH * 60 + m;
}

export type SlotConflict = {
    slot: GridSlot;
    reservation: Reservation;
    reason: string;
    skippable: boolean;
};

export function findSlotConflict(
    slot: GridSlot,
    reservations: Reservation[],
    gridStartHour: number,
): SlotConflict | null {
    const slotStart = slot.startMins;
    const slotEnd = slotStart + 30;
    for (const r of reservations) {
        if (r.courtId !== slot.courtId) continue;
        if (r.status === 'cancelled') continue;
        const rStart = timeStrToMinutes(r.startTime, gridStartHour);
        const rEnd = rStart + r.durationMinutes;
        if (slotStart >= rEnd || slotEnd <= rStart) continue;

        if (r.booking_type === 'blocked' && r.notes?.includes(MAINTENANCE_NOTE_PREFIX)) {
            return { slot, reservation: r, reason: 'Ya bloqueado por mantenimiento', skippable: true };
        }
        if (r.booking_type === 'blocked') {
            return { slot, reservation: r, reason: 'Slot ya bloqueado', skippable: true };
        }
        if (r.booking_type === 'school_course' || r.booking_type === 'school_individual' || r.booking_type === 'school_group') {
            const label = r.playerName?.trim() || r.matchType || 'curso escolar';
            return { slot, reservation: r, reason: `Curso escolar: ${label}`, skippable: true };
        }
        const label = r.playerName?.trim() || r.matchType || 'turno';
        return { slot, reservation: r, reason: `Reserva activa: ${label}`, skippable: true };
    }
    return null;
}

export function findMaintenanceAtSlot(
    slot: GridSlot,
    reservations: Reservation[],
    gridStartHour: number,
): Reservation | null {
    const slotStart = slot.startMins;
    const slotEnd = slotStart + 30;
    for (const r of reservations) {
        if (r.courtId !== slot.courtId) continue;
        if (r.status === 'cancelled') continue;
        if (r.booking_type !== 'blocked' || !r.notes?.includes(MAINTENANCE_NOTE_PREFIX)) continue;
        const rStart = timeStrToMinutes(r.startTime, gridStartHour);
        const rEnd = rStart + r.durationMinutes;
        if (slotStart < rEnd && slotEnd > rStart) return r;
    }
    return null;
}

export function collectMaintenanceBookingsForSlots(
    slots: GridSlot[],
    reservations: Reservation[],
    gridStartHour: number,
): Reservation[] {
    const found = new Map<string, Reservation>();
    for (const slot of slots) {
        const m = findMaintenanceAtSlot(slot, reservations, gridStartHour);
        if (m) found.set(m.id, m);
    }
    return [...found.values()];
}

export function computeMarqueeMenuPosition(
    anchorRect: DOMRect,
    menuWidth: number,
    menuHeight: number,
): { left: number; top: number } {
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.right - menuWidth;
    let top = anchorRect.bottom + 8;

    if (top + menuHeight > vh - pad) {
        top = anchorRect.top - menuHeight - 8;
    }
    if (top < pad) {
        top = Math.max(pad, (vh - menuHeight) / 2);
    }
    if (left < pad) left = pad;
    if (left + menuWidth > vw - pad) left = vw - menuWidth - pad;

    return { left, top };
}

export function isFullDayMaintenanceReservation(
    r: Reservation,
    openMin: number,
    closeMin: number,
    gridStartHour: number,
): boolean {
    if (r.status === 'cancelled') return false;
    if (r.booking_type !== 'blocked') return false;
    const isMaint =
        r.notes?.includes(MAINTENANCE_NOTE_PREFIX) || r.matchType === 'MANTENIMIENTO';
    if (!isMaint) return false;
    const start = timeStrToMinutes(r.startTime, gridStartHour);
    const end = start + r.durationMinutes;
    const window = closeMin - openMin;
    if (window <= 0) return false;
    const covered = Math.min(end, closeMin) - Math.max(start, openMin);
    return covered >= window * 0.85;
}

export function isCourtInFullDayMaintenance(
    reservations: Reservation[],
    courtId: string,
    openMin: number,
    closeMin: number,
    gridStartHour: number,
): boolean {
    return reservations.some((r) =>
        r.courtId === courtId && isFullDayMaintenanceReservation(r, openMin, closeMin, gridStartHour),
    );
}

export type MergedBlockRange = {
    courtId: string;
    courtName: string;
    startMins: number;
    endMins: number;
};

export function mergeSlotsToRanges(slots: GridSlot[]): MergedBlockRange[] {
    const byCourt = new Map<string, { courtName: string; mins: number[] }>();
    for (const s of slots) {
        const g = byCourt.get(s.courtId) ?? { courtName: s.courtName, mins: [] };
        g.mins.push(s.startMins);
        byCourt.set(s.courtId, g);
    }
    const ranges: MergedBlockRange[] = [];
    for (const [courtId, { courtName, mins }] of byCourt) {
        const sorted = [...new Set(mins)].sort((a, b) => a - b);
        if (sorted.length === 0) continue;
        let runStart = sorted[0];
        let runEnd = sorted[0] + 30;
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === runEnd) {
                runEnd += 30;
            } else {
                ranges.push({ courtId, courtName, startMins: runStart, endMins: runEnd });
                runStart = sorted[i];
                runEnd = sorted[i] + 30;
            }
        }
        ranges.push({ courtId, courtName, startMins: runStart, endMins: runEnd });
    }
    return ranges.sort((a, b) => a.courtName.localeCompare(b.courtName) || a.startMins - b.startMins);
}

export type CourtColumnRect = { courtId: string; courtName: string; rect: DOMRect };

export function getCourtsHorizontalBounds(
    columnRects: CourtColumnRect[],
): { left: number; right: number } | null {
    if (columnRects.length === 0) return null;
    return {
        left: Math.min(...columnRects.map((c) => c.rect.left)),
        right: Math.max(...columnRects.map((c) => c.rect.right)),
    };
}

/** Snap vertical marquee edges to 30-min slot boundaries inside the grid body. */
export function snapMarqueeVertical(
    top: number,
    bottom: number,
    bodyTop: number,
    bodyBottom: number,
    slotPx: number,
): { top: number; bottom: number } {
    const slotCount = Math.max(1, Math.round((bodyBottom - bodyTop) / slotPx));
    const clampedTop = Math.max(top, bodyTop);
    const clampedBottom = Math.min(Math.max(bottom, clampedTop + slotPx * 0.5), bodyBottom);
    const relTop = clampedTop - bodyTop;
    const relBottom = clampedBottom - bodyTop;
    let startIdx = Math.round(relTop / slotPx);
    let endIdx = Math.max(startIdx + 1, Math.round(relBottom / slotPx));
    startIdx = Math.min(Math.max(0, startIdx), slotCount - 1);
    endIdx = Math.min(Math.max(startIdx + 1, endIdx), slotCount);
    return {
        top: bodyTop + startIdx * slotPx,
        bottom: bodyTop + endIdx * slotPx,
    };
}

export function clientYToSlotMins(
    clientY: number,
    bodyTop: number,
    slotPx: number,
    gridStartMin: number,
    slotStepMin = 30,
): number {
    const rel = clientY - bodyTop;
    const idx = Math.max(0, Math.round(rel / slotPx));
    return gridStartMin + idx * slotStepMin;
}

export function collectSlotsInMarquee(
    marquee: DOMRect,
    columnRects: CourtColumnRect[],
    gridRect: DOMRect,
    headerPx: number,
    ppm: number,
    gridStartMin: number,
    gridEndMin: number,
    slotStepMin = 30,
): GridSlot[] {
    const slots: GridSlot[] = [];
    const bodyTop = gridRect.top + headerPx;
    const bodyBottom = bodyTop + (gridEndMin - gridStartMin) * ppm;
    const slotPx = slotStepMin * ppm;

    const snapped = snapMarqueeVertical(marquee.top, marquee.bottom, bodyTop, bodyBottom, slotPx);
    const relTop = snapped.top - bodyTop;
    const relBottom = snapped.bottom - bodyTop;
    const startIdx = Math.round(relTop / slotPx);
    const endIdx = Math.round(relBottom / slotPx);

    for (const col of columnRects) {
        if (marquee.right <= col.rect.left || marquee.left >= col.rect.right) continue;

        const startSlot = gridStartMin + startIdx * slotStepMin;
        const endSlot = gridStartMin + endIdx * slotStepMin;

        for (let m = startSlot; m < endSlot; m += slotStepMin) {
            if (m + slotStepMin <= gridEndMin) {
                slots.push({ courtId: col.courtId, courtName: col.courtName, startMins: m });
            }
        }
    }
    return slots;
}
