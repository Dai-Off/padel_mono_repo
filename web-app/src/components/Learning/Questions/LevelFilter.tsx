import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type LevelRange = { min: number; max: number; label: string };

// Rangos pre-definidos sugeridos por el negocio. El "personalizado" se gestiona
// aparte con dos inputs numéricos en el mismo popover.
export const LEVEL_PRESETS: LevelRange[] = [
  { min: 0, max: 2, label: 'Principiante (0–2)' },
  { min: 2, max: 3.5, label: 'Intermedio (2–3.5)' },
  { min: 3.5, max: 4.5, label: 'Avanzado (3.5–4.5)' },
  { min: 4.5, max: 6, label: 'Competición (4.5–6)' },
  { min: 6, max: 7, label: 'Profesional (6–7)' },
];

interface Props {
  // Valor actual: null = "Todos los niveles".
  value: { min: number; max: number } | null;
  onChange: (next: { min: number; max: number } | null) => void;
}

/**
 * Dropdown de nivel con rangos pre-definidos por etiqueta + opción
 * "Personalizado" que abre dos inputs numéricos en el mismo popover.
 */
export function LevelFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMin, setCustomMin] = useState<string>(value ? String(value.min) : '');
  const [customMax, setCustomMax] = useState<string>(value ? String(value.max) : '');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const matchingPreset = value
    ? LEVEL_PRESETS.find((p) => p.min === value.min && p.max === value.max)
    : null;
  const isCustom = value && !matchingPreset;
  const active = value !== null;

  const display = !value
    ? 'Todos'
    : matchingPreset
      ? matchingPreset.label
      : `Personalizado (${value.min}–${value.max})`;

  const pickPreset = (p: LevelRange | null) => {
    setOpen(false);
    setCustomOpen(false);
    onChange(p ? { min: p.min, max: p.max } : null);
  };
  const applyCustom = () => {
    const mn = parseFloat(customMin);
    const mx = parseFloat(customMax);
    if (Number.isNaN(mn) || Number.isNaN(mx) || mn > mx) return;
    onChange({ min: mn, max: mx });
    setOpen(false);
    setCustomOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
          active ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
        }`}
      >
        <span className="opacity-70">Nivel:</span>
        <span>{display}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 min-w-[14rem] bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => pickPreset(null)}
            className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-[#1A1A1A] hover:bg-gray-50 ${
              !value ? 'bg-gray-50' : ''
            }`}
          >
            <span>Todos los niveles</span>
            {!value && <Check className="w-3 h-3 text-gray-400 shrink-0 ml-2" />}
          </button>
          {LEVEL_PRESETS.map((p) => {
            const selected = matchingPreset?.label === p.label;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => pickPreset(p)}
                className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-[#1A1A1A] hover:bg-gray-50 ${
                  selected ? 'bg-gray-50' : ''
                }`}
              >
                <span className="text-left">{p.label}</span>
                {selected && <Check className="w-3 h-3 text-gray-400 shrink-0 ml-2" />}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-[#1A1A1A] hover:bg-gray-50 border-t border-gray-100 ${
              isCustom ? 'bg-gray-50' : ''
            }`}
          >
            <span>Personalizado{isCustom ? ` (${value!.min}–${value!.max})` : '...'}</span>
            {isCustom && <Check className="w-3 h-3 text-gray-400 shrink-0 ml-2" />}
          </button>
          {customOpen && (
            <div className="px-3 py-2 space-y-2 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={7}
                  placeholder="Min"
                  value={customMin}
                  onChange={(e) => setCustomMin(e.target.value)}
                  className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-[11px]"
                />
                <span className="text-gray-400 text-[10px]">a</span>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={7}
                  placeholder="Max"
                  value={customMax}
                  onChange={(e) => setCustomMax(e.target.value)}
                  className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-[11px]"
                />
                <button
                  type="button"
                  onClick={applyCustom}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white bg-[#1A1A1A] hover:opacity-90"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
