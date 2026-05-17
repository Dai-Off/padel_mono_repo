// Inspector del jugador seleccionado: edita is_user, posición y permite
// añadir un bocadillo (que se crea como shape de tipo speechbubble, no como
// campo de player). El antiguo campo speech_label se ha eliminado porque el
// editor web no lo renderizaba — generaba confusión. La migración de datos
// antiguos se hace al cargar el puzzle en el editor (ver PuzzleEditor.tsx).

import { RotateCcw, MessageCircle } from 'lucide-react';
import type { PuzzlePlayer } from '../../../../../types/learningContent';

interface Props {
  player: PuzzlePlayer;
  onChange: (next: PuzzlePlayer) => void;
  // Si se pasa, muestra botón "Reset posición" que copia x/y del frame previo.
  onResetFromPrev?: () => void;
  // Si se pasa, muestra botón "Añadir bocadillo" que crea un shape speechbubble
  // encima de este jugador.
  onAddSpeech?: () => void;
}

export function PlayerInspector({ player, onChange, onResetFromPrev, onAddSpeech }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-bold text-gray-500 uppercase">
          Jugador {player.id} · Equipo {player.team}
        </h4>
        {onResetFromPrev && (
          <button
            type="button"
            onClick={onResetFromPrev}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-600 hover:bg-amber-100"
            title="Reset posición al frame anterior"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>

      {onAddSpeech && (
        <button
          type="button"
          onClick={onAddSpeech}
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-bold bg-white text-gray-600 border border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-500 transition-all"
        >
          <MessageCircle className="w-3 h-3" />
          Añadir bocadillo sobre el jugador
        </button>
      )}

      {player.team === 1 && (
        <label className="flex items-center gap-2 text-[10px] text-gray-600">
          <input
            type="checkbox"
            checked={!!player.is_user}
            onChange={(e) => {
              // Solo un jugador puede ser is_user. PuzzleEditor desactiva los
              // demás automáticamente cuando uno se marca.
              onChange({ ...player, is_user: e.target.checked || undefined });
            }}
          />
          Es el jugador del usuario ("YOU")
        </label>
      )}
    </div>
  );
}
