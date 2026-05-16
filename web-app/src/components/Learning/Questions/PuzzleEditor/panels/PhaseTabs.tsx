// Sub-tabs dentro de una opción: select | confirm.
// Cada fase puede no existir aún (entonces se muestra un botón "+ Crear").

import { Plus, Play, X } from 'lucide-react';
import type { PuzzleOption } from '../../../../../types/learningContent';

export type Phase = 'select' | 'confirm';

interface Props {
  option: PuzzleOption;
  active: Phase;
  onSelect: (phase: Phase) => void;
  onAddPhase: (phase: Phase) => void;
  onRemovePhase: (phase: Phase) => void;
  onPreview: () => void;
  onPlayGlobal: () => void;
  disabled?: boolean;
}

export function PhaseTabs({
  option,
  active,
  onSelect,
  onAddPhase,
  onRemovePhase,
  onPreview,
  onPlayGlobal,
  disabled,
}: Props) {
  const phases: Phase[] = ['select', 'confirm'];
  const hasFrame = (p: Phase) =>
    p === 'select' ? !!option.select_frame : !!option.confirmation_frame;

  return (
    <div className={`flex items-center gap-1 flex-wrap ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {phases.map((phase) => {
        const label = phase === 'select' ? 'Selección' : 'Confirmación';
        if (!hasFrame(phase)) {
          return (
            <button
              key={phase}
              type="button"
              onClick={() => onAddPhase(phase)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-white text-gray-400 border border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-500 transition-all"
            >
              <Plus className="w-3 h-3" />
              {label}
            </button>
          );
        }
        const isActive = active === phase;
        return (
          <div key={phase} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(phase)}
              className={`px-2.5 py-1.5 rounded-l-xl text-[10px] font-bold transition-all ${
                isActive
                  ? phase === 'select'
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-500 text-white'
                  : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
            <button
              type="button"
              onClick={() => onRemovePhase(phase)}
              className="px-1.5 py-1.5 rounded-r-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all"
              title={`Eliminar frame ${label.toLowerCase()}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* Separador visual */}
      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Preview contextual: anima desde el frame anterior lógico hasta el activo. */}
      {hasFrame(active) && (
        <button
          type="button"
          onClick={onPreview}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all"
          title="Reproducir transición hacia este frame"
        >
          <Play className="w-3 h-3" />
          Preview
        </button>
      )}

      {/* Play global: abre el visor interactivo completo. */}
      <button
        type="button"
        onClick={onPlayGlobal}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-[#F18F34] text-white hover:bg-[#d97706] transition-all"
        title="Reproducir puzzle completo como en mobile"
      >
        <Play className="w-3 h-3" />
        Play
      </button>
    </div>
  );
}
