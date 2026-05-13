/** IANA zone used to align GET /bookings?date=… with local calendar times from the UI. */
export function browserIanaTimeZone(): string {
    try {
        const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (typeof z === 'string' && z.trim()) return z.trim();
    } catch {
        /* ignore */
    }
    return 'Europe/Madrid';
}
