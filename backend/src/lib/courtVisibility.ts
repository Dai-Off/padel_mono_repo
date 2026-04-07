export type VisibilityWindow = {
  days_of_week: number[];
  start_minutes: number;
  end_minutes: number;
};

export function parseVisibilityWindows(raw: unknown): VisibilityWindow[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: VisibilityWindow[] = [];
  for (const w of raw) {
    if (typeof w !== 'object' || !w) continue;
    const o = w as Record<string, unknown>;
    const dow = o.days_of_week;
    if (!Array.isArray(dow) || dow.length === 0) continue;
    if (!dow.every((x) => typeof x === 'number' && x >= 1 && x <= 7)) continue;
    const sm = Number(o.start_minutes);
    const em = Number(o.end_minutes);
    if (!Number.isFinite(sm) || !Number.isFinite(em) || sm < 0 || em > 1440 || sm >= em) continue;
    out.push({ days_of_week: dow.map(Number), start_minutes: sm, end_minutes: em });
  }
  return out;
}

export function normalizeStoredVisibilityWindows(
  raw: unknown
): { ok: true; value: VisibilityWindow[] | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null };
  const parsed = parseVisibilityWindows(raw);
  if (parsed == null) return { ok: false, error: 'visibility_windows debe ser un array JSON válido' };
  return { ok: true, value: parsed.length ? parsed : null };
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** ISO weekday 1 = Monday … 7 = Sunday (UTC date anchor). */
export function dateStringToIsoDowUtc(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

export function courtVisibleInGridForDate(
  visibilityWindows: unknown,
  dateStr: string,
  gridStartMinutes: number,
  gridEndMinutes: number
): boolean {
  if (visibilityWindows == null) return true;
  const windows = parseVisibilityWindows(visibilityWindows);
  if (windows == null || windows.length === 0) return true;
  const dow = dateStringToIsoDowUtc(dateStr);
  for (const w of windows) {
    if (!w.days_of_week.includes(dow)) continue;
    if (rangesOverlap(gridStartMinutes, gridEndMinutes, w.start_minutes, w.end_minutes)) return true;
  }
  return false;
}
