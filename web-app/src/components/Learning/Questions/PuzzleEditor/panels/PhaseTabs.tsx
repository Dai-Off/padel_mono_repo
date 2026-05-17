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
  // Fases con errores reciben un punto rojo.
  errorPhases?: Set<Phase>;
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
  errorPhases,
}: Props) {
  const phases: Phase[] = ['select', 'confirm'];
  const hasFrame = (p: Phase) =>
    p === 'select' ? !!option.select_frame : !!option.confirmation_frame;
  const hasError = (p: Phase) => !!errorPhases?.has(p);

  return (
    <div className={`flex items-center gap-1 flex-wrap ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {phases.map((phase) => {
        const label = phase === 'select' ? 'Selección' : 'Confirmación';
        if (!hasFrame(phase)) {
          // No se puede crear confirmación si todavía no existe selección:
          // forzamos el orden lógico (primero seleccionar, luego confirmar).
          const blocked = phase === 'confirm' && !hasFrame('select');
          return (
            <button
              key={phase}
              type="button"
              onClick={() => { if (!blocked) onAddPhase(phase); }}
              disabled={blocked}
              title={blocked ? 'Crea primero el frame de Selección' : undefined}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold border border-dashed transition-all ${
                blocked
                  ? 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-400 border-gray-300 hover:border-indigo-400 hover:text-indigo-500'
              }`}
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
              className={`relative px-2.5 py-1.5 rounded-l-xl text-[10px] font-bold transition-all ${
                isActive
                  ? phase === 'select'
                    ? 'bg-amber-500 text-white'
                    : option.is_correct
                      ? 'bg-emerald-500 text-white'
                      : 'bg-red-500 text-white'
                  : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
              }`}
            >
              {label}
              {hasError(phase) && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border border-white" title="Hay errores en este frame" />
              )}
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
