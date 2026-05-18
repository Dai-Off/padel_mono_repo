// Panel lateral de UNA opción concreta (la tab activa).
// Muestra texto, explicación, is_correct toggle.
// La gestión de añadir/eliminar opciones se hace desde MainTabs.

import { Check } from 'lucide-react';
import type { PuzzleContent, PuzzleOption } from '../../../../../types/learningContent';

interface Props {
  content: PuzzleContent;
  option: PuzzleOption;
  onChange: (next: PuzzleContent) => void;
}

export function OptionPanel({ content, option, onChange }: Props) {
  const letter = String.fromCharCode(64 + option.id);

  const update = (patch: Partial<PuzzleOption>) => {
    onChange({
      ...content,
      options: content.options.map((o) => (o.id === option.id ? { ...o, ...patch } as PuzzleOption : o)),
    });
  };

  const setIsCorrect = (isCorrect: boolean) => {
    if (!isCorrect) {
      update({ is_correct: false });
      return;
    }
    // Solo una opción puede ser correcta a la vez.
    onChange({
      ...content,
      options: content.options.map((o) => ({ ...o, is_correct: o.id === option.id })),
    });
  };

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold text-gray-500 uppercase">
        Opción {letter}
      </h4>

      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
          Texto corto
        </label>
        <input
          type="text"
          value={option.text}
          onChange={(e) => update({ text: e.target.value })}
          placeholder="ej: Globo"
          maxLength={40}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
          Explicación <span className="text-gray-300 font-normal">(se muestra al confirmar)</span>
        </label>
        <textarea
          value={option.explanation}
          onChange={(e) => update({ explanation: e.target.value })}
          rows={3}
          maxLength={500}
          placeholder="Por qué es correcta o incorrecta esta opción"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs resize-none"
        />
      </div>

      <button
        type="button"
        onClick={() => setIsCorrect(!option.is_correct)}
        className={`w-full px-3 py-2 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 ${
          option.is_correct
            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
        }`}
      >
        {option.is_correct && <Check className="w-3.5 h-3.5" />}
        {option.is_correct ? 'Opción correcta' : 'Marcar como correcta'}
      </button>
    </div>
  );
}
