import type { WarningKind } from '../../../types/learningContent';

export type WarningFilter = 'all' | WarningKind;

interface Props {
  value: WarningFilter;
  onChange: (next: WarningFilter) => void;
  counts: Record<WarningKind, number>;
}

const OPTIONS: { key: WarningFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'too_easy', label: 'Fáciles' },
  { key: 'too_hard', label: 'Difíciles' },
  { key: 'low_quality', label: 'Calidad' },
];

/**
 * Pills compactos para filtrar la lista de avisos por tipo. Muestra el
 * contador de cada categoría entre paréntesis para que el admin sepa de un
 * vistazo dónde mirar.
 */
export function WarningTypeFilter({ value, onChange, counts }: Props) {
  const total = counts.too_easy + counts.too_hard + counts.low_quality;
  return (
    <div className="flex flex-wrap gap-1.5">
      {OPTIONS.map((opt) => {
        const count = opt.key === 'all' ? total : counts[opt.key as WarningKind];
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
              value === opt.key ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
            }`}
          >
            {opt.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${value === opt.key ? 'bg-white/20' : 'bg-white text-gray-500'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
