import { Plus, Play, X } from 'lucide-react';
import type { PuzzleContent } from '../../../../../types/learningContent';
import type { ActiveFrameKey } from '../lib/frames';
import { frameKeyEq } from '../lib/frames';

type Phase = 'select' | 'confirm';

interface Props {
  content: PuzzleContent;
  active: ActiveFrameKey;
  onSelect: (key: ActiveFrameKey) => void;
  onAddFrame: (optionIdx: number, phase: Phase) => void;
  onRemoveFrame: (optionIdx: number, phase: Phase) => void;
  onPreview: (optionIdx: number) => void;
  previewing: boolean;
}

export function FramesTabs({
  content,
  active,
  onSelect,
  onAddFrame,
  onRemoveFrame,
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
        return (
          <div key={opt.id} className="flex items-center gap-1">
            <FrameButton
              label={`${letter}·sel`}
              title={`Editar select_frame de ${letter}`}
              hasFrame={!!opt.select_frame}
              isActive={frameKeyEq(active, { optionId: opt.id, phase: 'select' })}
              previewing={previewing}
              onSelect={() => onSelect({ optionId: opt.id, phase: 'select' })}
              onAdd={() => onAddFrame(idx, 'select')}
              onRemove={() => onRemoveFrame(idx, 'select')}
            />
            <FrameButton
              label={`${letter}·conf`}
              title={`Editar confirmation_frame de ${letter}`}
              hasFrame={!!opt.confirmation_frame}
              isActive={frameKeyEq(active, { optionId: opt.id, phase: 'confirm' })}
              previewing={previewing}
              onSelect={() => onSelect({ optionId: opt.id, phase: 'confirm' })}
              onAdd={() => onAddFrame(idx, 'confirm')}
              onRemove={() => onRemoveFrame(idx, 'confirm')}
            />
            {(opt.select_frame || opt.confirmation_frame) && (
              <button
                type="button"
                disabled={previewing}
                onClick={() => onPreview(idx)}
                className="px-2 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
                title={`Previsualizar animación de ${letter}`}
              >
                <Play className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FrameButton({
  label,
  title,
  hasFrame,
  isActive,
  previewing,
  onSelect,
  onAdd,
  onRemove,
}: {
  label: string;
  title: string;
  hasFrame: boolean;
  isActive: boolean;
  previewing: boolean;
  onSelect: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  if (!hasFrame) {
    return (
      <button
        type="button"
        disabled={previewing}
        onClick={onAdd}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-white text-gray-400 border border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-500 transition-all"
        title={title}
      >
        <Plus className="w-3 h-3" />
        {label}
      </button>
    );
  }
  return (
    <div className="flex items-center">
      <button
        type="button"
        disabled={previewing}
        onClick={onSelect}
        className={`px-2.5 py-1.5 rounded-l-xl text-[10px] font-bold transition-all ${
          isActive ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
        } ${previewing ? 'opacity-50 pointer-events-none' : ''}`}
        title={title}
      >
        {label}
      </button>
      <button
        type="button"
        disabled={previewing}
        onClick={onRemove}
        className="px-1.5 py-1.5 rounded-r-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all"
        title="Eliminar frame"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
