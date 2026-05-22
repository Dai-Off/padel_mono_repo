import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { QuestionStatus } from '../../../types/learningContent';

/**
 * Chip clickable con popover para elegir entre los 3 estados de una pregunta
 * (publicada / borrador / inactiva). El padre decide qué hace cada acción —
 * en el panel admin abre un modal de notas, en el panel club ejecuta directo
 * (sin notas) tras un confirm en transiciones destructivas.
 */

const STATUS_PILL: Record<QuestionStatus, { label: string; bg: string; text: string; dot: string }> = {
  published: { label: 'Publicada', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  draft: { label: 'Borrador', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  inactive: { label: 'Inactiva', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
};

interface Props {
  status: QuestionStatus;
  onPickPublished: () => void;
  onPickDraft: () => void;
  onPickInactive: () => void;
}

export function StatusSwitcher({ status, onPickPublished, onPickDraft, onPickInactive }: Props) {
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

  const pill = STATUS_PILL[status];
  const pick = (target: QuestionStatus) => {
    setOpen(false);
    if (target === status) return;
    if (target === 'published') onPickPublished();
    else if (target === 'draft') onPickDraft();
    else onPickInactive();
  };

  const options: { key: QuestionStatus; label: string; dot: string }[] = [
    { key: 'published', label: 'Publicada', dot: 'bg-emerald-500' },
    { key: 'draft', label: 'Borrador', dot: 'bg-amber-500' },
    { key: 'inactive', label: 'Inactiva', dot: 'bg-red-500' },
  ];

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all ${pill.bg} ${pill.text} hover:brightness-95`}
        title="Cambiar estado"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />
        {pill.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 w-40 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => pick(opt.key)}
              className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-[#1A1A1A] hover:bg-gray-50 ${
                opt.key === status ? 'bg-gray-50' : ''
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
                {opt.label}
              </span>
              {opt.key === status && <Check className="w-3 h-3 text-gray-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
