import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/**
 * Paginador reutilizable para listados de preguntas. Muestra:
 *   < 1 ... 4 5 [6] 7 8 ... 12 >    [30 por página ▼]
 *
 * Las elipsis aparecen cuando hay >7 páginas. El selector de tamaño guarda
 * en localStorage en el componente padre (no aquí).
 */
export function Paginator({ page, pageSize, total, onPageChange, onPageSizeChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  // Calcular qué páginas mostrar: actual ± 2, con elipsis si hay gap.
  const pages: (number | '...')[] = [];
  const push = (p: number | '...') => {
    if (pages[pages.length - 1] !== p) pages.push(p);
  };
  push(1);
  if (page - 2 > 2) push('...');
  for (let p = Math.max(2, page - 2); p <= Math.min(totalPages - 1, page + 2); p++) push(p);
  if (page + 2 < totalPages - 1) push('...');
  if (totalPages > 1) push(totalPages);

  const showingFrom = (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-[10px] text-gray-400">
        {showingFrom}–{showingTo} de {total}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="p-1.5 rounded-lg text-[#1A1A1A] disabled:opacity-30 hover:bg-gray-50"
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ell-${i}`} className="px-1 text-[10px] text-gray-300">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`min-w-[28px] h-7 px-2 rounded-lg text-[10px] font-bold transition-all ${
                p === page
                  ? 'bg-[#1A1A1A] text-white'
                  : 'text-[#1A1A1A] hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="p-1.5 rounded-lg text-[#1A1A1A] disabled:opacity-30 hover:bg-gray-50"
          aria-label="Página siguiente"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        className="rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-bold bg-white"
      >
        {PAGE_SIZE_OPTIONS.map((s) => (
          <option key={s} value={s}>{s} por página</option>
        ))}
      </select>
    </div>
  );
}
