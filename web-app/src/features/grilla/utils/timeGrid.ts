export const START_HOUR = 7; // 07:00
export const END_HOUR = 23; // 23:00 (last slot is 23:00, no 23:30)
export const PIXELS_PER_MINUTE = 0.43; // 0.43px/min (-10% from 0.48)

/** Minimum court column width on mobile (readable labels + slot times). */
export const MOBILE_COURT_COLUMN_PX = 60;
/** Compact time axis width (matches Tailwind w-5 ≈ 20px). */
export const MOBILE_TIME_AXIS_PX = 20;
/** Viewports ≤ this width use the compact fill-and-pan grid (phones + tablets). */
export const GRILLA_COMPACT_LAYOUT_MAX_PX = 1024;

export type MobileCourtLayout = {
  columnWidthPx: number;
  canvasWidthPx: number;
  overflowsHorizontally: boolean;
};

/** Size courts to fill the viewport, or overflow to the right with pan when they cannot fit. */
export function computeMobileCourtLayout(
  viewportWidthPx: number,
  courtCount: number,
): MobileCourtLayout {
  const vw = Math.max(280, viewportWidthPx);
  if (courtCount <= 0) {
    return { columnWidthPx: MOBILE_COURT_COLUMN_PX, canvasWidthPx: vw, overflowsHorizontally: false };
  }
  const courtsArea = Math.max(120, vw - MOBILE_TIME_AXIS_PX * 2);
  const equalCol = courtsArea / courtCount;
  if (equalCol >= MOBILE_COURT_COLUMN_PX) {
    return {
      columnWidthPx: equalCol,
      canvasWidthPx: vw,
      overflowsHorizontally: false,
    };
  }
  return {
    columnWidthPx: MOBILE_COURT_COLUMN_PX,
    canvasWidthPx: courtCount * MOBILE_COURT_COLUMN_PX + MOBILE_TIME_AXIS_PX * 2,
    overflowsHorizontally: true,
  };
}

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

export function timeToPixels(time: string, ppm: number = PIXELS_PER_MINUTE): number {
    const minSinceStart = parseTimeStr(time) - (START_HOUR * 60);
    return minSinceStart * ppm;
}

/** Pixels-per-minute that fits the full day grid inside the available viewport height (mobile). */
export function computeCompactPxPerMinute(availableHeightPx: number): number {
    const totalMinutes = (END_HOUR - START_HOUR) * 60;
    const headerPx = 24;
    const usable = Math.max(100, availableHeightPx - headerPx - 8);
    const raw = usable / totalMinutes;
    return Math.min(PIXELS_PER_MINUTE, Math.max(0.2, raw));
}

export function estimateMobileGridViewportHeight(): number {
    const vh = typeof window !== 'undefined'
        ? (window.visualViewport?.height ?? window.innerHeight)
        : 600;
    return Math.max(180, vh - 200);
}

// Convert Y pixel position to snapped 30-min time
export function pixelsToTime(pixels: number, ppm: number = PIXELS_PER_MINUTE): string {
    const minSinceStart = pixels / ppm;
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
