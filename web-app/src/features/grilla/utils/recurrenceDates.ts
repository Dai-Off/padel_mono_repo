/** JS getDay(): 0=Domingo … 6=Sábado. Chips en orden europeo (L–D). */
export const WEEKDAY_CHIPS: { id: number; label: string }[] = [
    { id: 1, label: 'L' },
    { id: 2, label: 'M' },
    { id: 3, label: 'X' },
    { id: 4, label: 'J' },
    { id: 5, label: 'V' },
    { id: 6, label: 'S' },
    { id: 0, label: 'D' },
];

export function formatYmd(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function enumerateDatesInRange(startYmd: string, endYmd: string, weekdays: number[]): string[] {
    if (!startYmd || !endYmd || weekdays.length === 0) return [];
    const start = new Date(`${startYmd}T12:00:00`);
    const end = new Date(`${endYmd}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

    const result: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
        if (weekdays.includes(cur.getDay())) {
            result.push(formatYmd(cur));
        }
        cur.setDate(cur.getDate() + 1);
    }
    return result;
}

export function calcDurationMinutes(startTime: string, endTime: string): number {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;
    return diff;
}
