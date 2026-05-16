// Inspector de la pelota seleccionada: edita shot_type y spin.
// Estos campos afectan al render visual (lob/chiquita → bola crece durante
// la animación) y, si la shape trajectory no tiene controlPoint, también
// determinan la curvatura automática de la trayectoria.

import type { PuzzleBall, PuzzleShotType, PuzzleSpin } from '../../../../../types/learningContent';

interface Props {
  ball: PuzzleBall;
  onChange: (next: PuzzleBall) => void;
}

const SHOT_TYPES: { value: PuzzleShotType | 'none'; label: string; hint: string }[] = [
  { value: 'none', label: 'Recto', hint: 'Tiro plano sin altura' },
  { value: 'chiquita', label: 'Chiquita', hint: 'Curvatura suave' },
  { value: 'lob', label: 'Globo', hint: 'Curvatura pronunciada' },
];

const SPINS: { value: PuzzleSpin | 'none'; label: string }[] = [
  { value: 'none', label: 'Sin spin' },
  { value: 'clockwise', label: 'Horario' },
  { value: 'counter-clockwise', label: 'Antihorario' },
  { value: 'random', label: 'Aleatorio' },
];

export function BallInspector({ ball, onChange }: Props) {
  const shotType = ball.shot_type ?? 'none';
  const spin = ball.spin ?? 'none';

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold text-gray-500 uppercase">Pelota</h4>

      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
          Tipo de tiro
        </label>
        <div className="space-y-1">
          {SHOT_TYPES.map((st) => {
            const active = shotType === st.value;
            return (
              <button
                key={st.value}
                type="button"
                onClick={() =>
                  onChange({ ...ball, shot_type: st.value === 'none' ? undefined : st.value })
                }
                className={`w-full flex items-start gap-2 px-3 py-2 rounded-xl text-left text-[10px] transition-all ${
                  active
                    ? 'bg-[#1A1A1A] text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex-1">
                  <div className="font-bold">{st.label}</div>
                  <div className={active ? 'text-white/60' : 'text-gray-400'}>{st.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
          Spin
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {SPINS.map((sp) => (
            <button
              key={sp.value}
              type="button"
              onClick={() =>
                onChange({ ...ball, spin: sp.value === 'none' ? undefined : sp.value })
              }
              className={`px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
                spin === sp.value
                  ? 'bg-[#1A1A1A] text-white'
                  : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
              }`}
            >
              {sp.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
