export const START_HOUR = 7; // 07:00
export const END_HOUR = 23; // 23:00 (last slot is 23:00, no 23:30)
export const PIXELS_PER_MINUTE = 0.43; // 0.43px/min (-10% from 0.48)

// Generate intervals to draw the grid and axis
export function getGridIntervals(): string[] {
    return Array.from({ length: (END_HOUR - START_HOUR) * 2 + 1 }, (_, i) => {
        const totalHours = START_HOUR + Math.floor(i / 2);
        const mins = (i % 2) * 30;
        const displayHours = totalHours >= 24 ? totalHours - 24 : totalHours;
        return `${displayHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    });
}

export function parseTimeStr(time: string): number {
    const [h, m] = time.split(':').map(Number);
    let absoluteH = h;
    if (h < START_HOUR && START_HOUR > 0) {
        absoluteH += 24;
    }
    return absoluteH * 60 + m;
}

export function timeToPixels(time: string): number {
    const minSinceStart = parseTimeStr(time) - (START_HOUR * 60);
    return minSinceStart * PIXELS_PER_MINUTE;
}

// Convert Y pixel position to snapped 30-min time
export function pixelsToTime(pixels: number): string {
    const minSinceStart = pixels / PIXELS_PER_MINUTE;
    let totalMins = (START_HOUR * 60) + minSinceStart;

    // Bound checks
    if (totalMins < START_HOUR * 60) totalMins = START_HOUR * 60;
    if (totalMins > END_HOUR * 60) totalMins = END_HOUR * 60;

    // Snap to nearest 30 mins
    const snappedMins = Math.round(totalMins / 30) * 30;

    const h = Math.floor(snappedMins / 60);
    const m = snappedMins % 60;

    const displayH = h >= 24 ? h - 24 : h;
    return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
