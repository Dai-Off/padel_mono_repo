// Tabs principales del editor: Inicial | A | B | C | + (añadir opción).
// Click en una tab cambia la opción activa. Cada opción incluye sub-tabs
// internas para select/confirm (gestionadas por PhaseTabs).

import { Plus, Trash2 } from 'lucide-react';
import type { PuzzleContent, PuzzleOption } from '../../../../../types/learningContent';

export type MainTabKey = 'initial' | 1 | 2 | 3;

interface Props {
  content: PuzzleContent;
  active: MainTabKey;
  onSelect: (key: MainTabKey) => void;
  onAddOption: () => void;
  onRemoveOption: (optionId: 1 | 2 | 3) => void;
  disabled?: boolean;
}

function nextOptionLabel(content: PuzzleContent): string {
  const usedIds = new Set(content.options.map((o) => o.id));
  for (const id of [1, 2, 3] as const) {
    if (!usedIds.has(id)) return String.fromCharCode(64 + id);
  }
  return '';
}

export function MainTabs({ content, active, onSelect, onAddOption, onRemoveOption, disabled }: Props) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <TabButton
        active={active === 'initial'}
        onClick={() => onSelect('initial')}
        label="Inicial"
      />

      {content.options.map((opt: PuzzleOption) => {
        const letter = String.fromCharCode(64 + opt.id);
        const isActive = active === opt.id;
        const canRemove = content.options.length > 2;
        return (
          <div key={opt.id} className="flex items-center">
            <TabButton
              active={isActive}
              onClick={() => onSelect(opt.id)}
              label={`Opción ${letter}`}
              correct={opt.is_correct}
              rounded={canRemove ? 'left' : 'full'}
            />
            {canRemove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveOption(opt.id);
                }}
                className="px-1.5 py-1.5 rounded-r-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all"
                title={`Eliminar opción ${letter}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}

      {content.options.length < 3 && (
        <button
          type="button"
          onClick={onAddOption}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white text-gray-400 border border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-500 transition-all"
          title="Añadir opción"
        >
          <Plus className="w-3 h-3" />
          Opción {nextOptionLabel(content)}
        </button>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  correct,
  rounded = 'full',
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  correct?: boolean;
  rounded?: 'full' | 'left';
}) {
  const radius = rounded === 'full' ? 'rounded-xl' : 'rounded-l-xl';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 ${radius} text-[10px] font-bold transition-all ${
        active
          ? 'bg-[#1A1A1A] text-white'
          : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
      }`}
    >
      {label}
      {correct && <span className="text-emerald-400">✓</span>}
    </button>
  );
}
