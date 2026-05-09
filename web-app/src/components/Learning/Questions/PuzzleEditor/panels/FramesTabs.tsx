import { Plus, Play, X } from 'lucide-react';
import type { PuzzleContent } from '../../../../../types/learningContent';
import type { ActiveFrameKey } from '../lib/frames';

interface Props {
  content: PuzzleContent;
  active: ActiveFrameKey;
  onSelect: (key: ActiveFrameKey) => void;
  onAddRevealFrame: (optionIdx: number) => void;
  onRemoveRevealFrame: (optionIdx: number) => void;
  onPreview: (optionIdx: number) => void;
  previewing: boolean;
}

export function FramesTabs({
  content,
  active,
  onSelect,
  onAddRevealFrame,
  onRemoveRevealFrame,
  onPreview,
  previewing,
}: Props) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        disabled={previewing}
        onClick={() => onSelect('initial')}
        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
          active === 'initial'
            ? 'bg-[#1A1A1A] text-white'
            : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
        } ${previewing ? 'opacity-50 pointer-events-none' : ''}`}
      >
        Inicial
      </button>

      {content.options.map((opt, idx) => {
        const letter = String.fromCharCode(64 + opt.id);
        const has = !!opt.reveal_frame;
        const isActive = active === opt.id;
        return (
          <div key={opt.id} className="flex items-center gap-0.5">
            {has ? (
              <>
                <button
                  type="button"
                  disabled={previewing}
                  onClick={() => onSelect(opt.id)}
                  className={`px-3 py-1.5 rounded-l-xl text-[10px] font-bold transition-all ${
                    isActive ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
                  } ${previewing ? 'opacity-50 pointer-events-none' : ''}`}
                  title={`Editar reveal frame de ${letter}`}
                >
                  Reveal {letter}
                </button>
                <button
                  type="button"
                  disabled={previewing}
                  onClick={() => onPreview(idx)}
                  className="px-2 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
                  title="Previsualizar animación"
                >
                  <Play className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={previewing}
                  onClick={() => onRemoveRevealFrame(idx)}
                  className="px-2 py-1.5 rounded-r-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all"
                  title="Eliminar reveal frame"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={previewing}
                onClick={() => onAddRevealFrame(idx)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white text-gray-400 border border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-500 transition-all"
                title={`Añadir reveal frame para la opción ${letter}`}
              >
                <Plus className="w-3 h-3" />
                Reveal {letter}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
