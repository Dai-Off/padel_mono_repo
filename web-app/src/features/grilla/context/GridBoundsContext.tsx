import { createContext, useContext, useMemo } from 'react';
import { gridBoundsForClubDay } from '../../../lib/clubTimeZone';

export type GridBoundsValue = {
    startHour: number;
    endHour: number;
    openMin: number;
    closeMin: number;
    closed: boolean;
};

const DEFAULT_BOUNDS: GridBoundsValue = {
    startHour: 7,
    endHour: 23,
    openMin: 7 * 60,
    closeMin: 23 * 60,
    closed: false,
};

/** Duración por defecto del turno (min) si el club no la define. */
export const DEFAULT_SLOT_DURATION_MIN = 90;

const GridBoundsContext = createContext<GridBoundsValue>(DEFAULT_BOUNDS);
// Duración del turno del club: define cuánto ocupa una reserva, necesario para
// saber si un turno entra completo antes del cierre (no alcanza el bloque de 30').
const ClubSlotDurationContext = createContext<number>(DEFAULT_SLOT_DURATION_MIN);

export function GridBoundsProvider({
    weeklySchedule,
    dateStr,
    slotDurationMin,
    children,
}: {
    weeklySchedule: unknown;
    dateStr: string;
    slotDurationMin?: number;
    children: React.ReactNode;
}) {
    const value = useMemo(
        () => gridBoundsForClubDay(weeklySchedule, dateStr),
        [weeklySchedule, dateStr],
    );
    const duration = Number.isFinite(slotDurationMin) && (slotDurationMin as number) > 0
        ? (slotDurationMin as number)
        : DEFAULT_SLOT_DURATION_MIN;
    return (
        <GridBoundsContext.Provider value={value}>
            <ClubSlotDurationContext.Provider value={duration}>
                {children}
            </ClubSlotDurationContext.Provider>
        </GridBoundsContext.Provider>
    );
}

export function useGridBounds(): GridBoundsValue {
    return useContext(GridBoundsContext);
}

export function useClubSlotDurationMin(): number {
    return useContext(ClubSlotDurationContext);
}

export function getGridIntervalsForBounds(bounds: GridBoundsValue): string[] {
    return Array.from({ length: (bounds.endHour - bounds.startHour) * 2 + 1 }, (_, i) => {
        const totalHours = bounds.startHour + Math.floor(i / 2);
        const mins = (i % 2) * 30;
        return `${String(totalHours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    });
}

export function parseTimeStrInBounds(time: string, bounds: GridBoundsValue): number {
    const [h, m] = time.split(':').map(Number);
    let absoluteH = h;
    if (h < bounds.startHour && bounds.startHour > 0) absoluteH += 24;
    return absoluteH * 60 + m;
}

export function gridContentHeightPx(bounds: GridBoundsValue, ppm: number): number {
    const intervals = getGridIntervalsForBounds(bounds);
    return (intervals.length - 1) * 30 * ppm;
}
