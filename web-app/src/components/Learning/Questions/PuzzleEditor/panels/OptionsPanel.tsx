import { Plus, Trash2, Check } from 'lucide-react';
import type { PuzzleContent, PuzzleOption } from '../../../../../types/learningContent';

interface Props {
  content: PuzzleContent;
  onChange: (next: PuzzleContent) => void;
}

function nextOptionId(existing: PuzzleOption[]): 1 | 2 | 3 {
  const used = new Set(existing.map((o) => o.id));
  for (const id of [1, 2, 3] as const) if (!used.has(id)) return id;
  return 3;
}

export function OptionsPanel({ content, onChange }: Props) {
  const updateOption = (idx: number, patch: Partial<PuzzleOption>) => {
    const options = content.options.map((o, i) => (i === idx ? { ...o, ...patch } as PuzzleOption : o));
    onChange({ ...content, options });
  };

  const addOption = () => {
    if (content.options.length >= 3) return;
    const newOpt: PuzzleOption = {
      id: nextOptionId(content.options),
      text: '',
      explanation: '',
      is_correct: false,
    };
    onChange({ ...content, options: [...content.options, newOpt] });
  };

  const removeOption = (idx: number) => {
    if (content.options.length <= 2) return;
    onChange({ ...content, options: content.options.filter((_, i) => i !== idx) });
  };

  // Solo una opción puede ser correcta. Al marcarla, las otras se desmarcan.
  const setIsCorrect = (idx: number, isCorrect: boolean) => {
    if (!isCorrect) {
      updateOption(idx, { is_correct: false });
      return;
    }
    const options = content.options.map((o, i) => ({
      ...o,
      is_correct: i === idx,
    }));
    onChange({ ...content, options });
  };

  const correctCount = content.options.filter((o) => o.is_correct).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-gray-500 uppercase">Opciones</h4>
        {content.options.length < 3 && (
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-3 h-3" />
            Añadir opción
          </button>
        )}
      </div>

      {correctCount !== 1 && (
        <div className="text-[10px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          Debe haber exactamente 1 opción marcada como correcta. Actual: {correctCount}.
        </div>
      )}

      <div className="space-y-3">
        {content.options.map((opt, idx) => {
          const letter = String.fromCharCode(64 + opt.id); // 1→A, 2→B, 3→C
          return (
            <div key={opt.id} className="rounded-xl border border-gray-200 p-3 space-y-2 bg-white">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#1A1A1A] text-white text-xs font-black flex items-center justify-center">
                  {letter}
                </span>
                <input
                  type="text"
                  value={opt.text}
                  onChange={(e) => updateOption(idx, { text: e.target.value })}
                  placeholder="Texto corto (ej: Globo)"
                  maxLength={40}
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
                {content.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <textarea
                value={opt.explanation}
                onChange={(e) => updateOption(idx, { explanation: e.target.value })}
                rows={2}
                placeholder="Explicación (se muestra al confirmar la respuesta)"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs resize-none"
              />
              <button
                type="button"
                onClick={() => setIsCorrect(idx, !opt.is_correct)}
                className={`w-full px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-1 ${
                  opt.is_correct
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                }`}
              >
                {opt.is_correct && <Check className="w-3 h-3" />}
                {opt.is_correct ? 'Correcta' : 'Marcar como correcta'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
