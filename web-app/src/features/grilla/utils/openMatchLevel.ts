/** Opciones 0.0–7.0 (paso 0.5) para selects de rango en partido abierto. */
export const LEVEL_OPTIONS = Array.from({ length: 15 }, (_, i) => (i * 0.5).toFixed(1));

/** Normaliza un nivel numérico al mismo formato que LEVEL_OPTIONS (p. ej. 3 → "3.0"). */
export function formatLevelSelectValue(raw: unknown): string {
    if (raw === null || raw === undefined || raw === '') return '';
    const n = Number(raw);
    if (!Number.isFinite(n)) return '';
    return n.toFixed(1);
}
