// Sub-tabs dentro de la tab "Inicial": Intro (opcional) | Estático (obligatorio).
// Mismo patrón visual que PhaseTabs (que sirve a las opciones con select/confirm).

import { Plus, Play, X } from 'lucide-react';
import type { PuzzleContent } from '../../../../../types/learningContent';

export type InitialSubTab = 'intro' | 'static';

interface Props {
  content: PuzzleContent;
  active: InitialSubTab;
  onSelect: (sub: InitialSubTab) => void;
  onAddIntro: () => void;
  onRemoveIntro: () => void;
  onPreview: () => void;
  onPlayGlobal: () => void;
  disabled?: boolean;
  // Sub-tabs con errores reciben un punto rojo.
  errorSubTabs?: Set<InitialSubTab>;
}

export function InitialPhaseTabs({
  content,
  active,
  onSelect,
  onAddIntro,
  onRemoveIntro,
  onPreview,
  onPlayGlobal,
  disabled,
  errorSubTabs,
}: Props) {
  const hasIntro = !!content.intro_frame;
  const hasError = (s: InitialSubTab) => !!errorSubTabs?.has(s);

  return (
    <div className={`flex items-center gap-1 flex-wrap ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {hasIntro ? (
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => onSelect('intro')}
            className={`relative px-2.5 py-1.5 rounded-l-xl text-[10px] font-bold transition-all ${
              active === 'intro' ? 'bg-purple-500 text-white' : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
            }`}
          >
            Intro
            {hasError('intro') && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border border-white" title="Errores en intro" />
            )}
          </button>
          <button
            type="button"
            onClick={onRemoveIntro}
            className="px-1.5 py-1.5 rounded-r-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all"
            title="Eliminar frame intro"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAddIntro}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-white text-gray-400 border border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-500 transition-all"
          title="Añadir frame intro (se anima antes del estático al cargar)"
        >
          <Plus className="w-3 h-3" />
          Intro
        </button>
      )}

      <button
        type="button"
        onClick={() => onSelect('static')}
        className={`relative px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
          active === 'static' ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
        }`}
      >
        Estático
        {hasError('static') && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border border-white" title="Errores en frame estático" />
        )}
      </button>

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Preview contextual: solo cuando hay intro (anima intro → estático). */}
      {hasIntro && (
        <button
          type="button"
          onClick={onPreview}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all"
          title="Reproducir transición intro → estático"
        >
          <Play className="w-3 h-3" />
          Preview
        </button>
      )}

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
