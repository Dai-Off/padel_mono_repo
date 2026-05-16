// Inspector del jugador seleccionado: edita speech_label, is_user, facing.
// El render del bocadillo en mobile usa `speech_label` (si está) o "YOU"
// automático cuando is_user=true && estado=init.

import type { PuzzlePlayer } from '../../../../../types/learningContent';

interface Props {
  player: PuzzlePlayer;
  onChange: (next: PuzzlePlayer) => void;
}

export function PlayerInspector({ player, onChange }: Props) {
  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold text-gray-500 uppercase">
        Jugador {player.id} · Equipo {player.team}
      </h4>

      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
          Bocadillo <span className="text-gray-300 font-normal">(opcional)</span>
        </label>
        <input
          type="text"
          value={player.speech_label ?? ''}
          onChange={(e) => onChange({ ...player, speech_label: e.target.value || undefined })}
          placeholder="ej: Mine!, Yours!"
          maxLength={20}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
        />
        <p className="text-[9px] text-gray-400 mt-1">
          Si está vacío y este jugador tiene <code>is_user</code> activo, se mostrará "YOU" automático en el frame inicial.
        </p>
      </div>

      {player.team === 1 && (
        <label className="flex items-center gap-2 text-[10px] text-gray-600">
          <input
            type="checkbox"
            checked={!!player.is_user}
            onChange={(e) => {
              // Solo un jugador puede ser is_user. Si activas este, el caller
              // debe desactivar los demás (no es responsabilidad de este panel).
              onChange({ ...player, is_user: e.target.checked || undefined });
            }}
          />
          Es el jugador del usuario ("YOU")
        </label>
      )}
    </div>
  );
}
