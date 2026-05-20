import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Dropdown compacto para filtros. Se muestra como un chip horizontal con
 * "Label: valor actual" y abre un popover con las opciones al hacer click.
 * Cuando hay un valor distinto del "all" (filtro activo), el chip se resalta
 * para que se note de un vistazo.
 *
 * Diseñado para sustituir grupos de pills apilados verticalmente y ganar
 * espacio vertical en los listados de moderación / preguntas.
 */

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  value: T;
  // El primer option suele ser el "all" — se identifica por su value.
  allValue: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}

export function FilterDropdown<T extends string>({ label, value, allValue, options, onChange }: Props<T>) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const current = options.find((o) => o.value === value);
  const active = value !== allValue;

  const pick = (next: T) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
          active
            ? 'bg-[#1A1A1A] text-white'
            : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
        }`}
      >
        <span className="opacity-70">{label}:</span>
        <span>{current?.label ?? '—'}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 min-w-[12rem] max-h-72 overflow-y-auto bg-white rounded-xl border border-gray-100 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => pick(opt.value)}
              className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-[#1A1A1A] hover:bg-gray-50 ${
                opt.value === value ? 'bg-gray-50' : ''
              }`}
            >
              <span className="text-left">{opt.label}</span>
              {opt.value === value && <Check className="w-3 h-3 text-gray-400 shrink-0 ml-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
