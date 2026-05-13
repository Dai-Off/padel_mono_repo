import type {
  PuzzleContent,
  PuzzleFrame,
  PuzzleShotType,
  PuzzleSpin,
} from '../../../../../types/learningContent';
import type { ActiveFrameKey } from '../lib/frames';

interface Props {
  content: PuzzleContent;
  activeFrame: Exclude<ActiveFrameKey, 'initial'>;
  onChange: (next: PuzzleContent) => void;
}

const SHOT_TYPES: { value: PuzzleShotType | 'none'; label: string }[] = [
  { value: 'none', label: 'Recto' },
  { value: 'lob', label: 'Lob' },
  { value: 'chiquita', label: 'Chiquita' },
];

const SPINS: { value: PuzzleSpin | 'none'; label: string }[] = [
  { value: 'none', label: 'Sin spin' },
  { value: 'clockwise', label: 'Horario' },
  { value: 'counter-clockwise', label: 'Antihorario' },
  { value: 'random', label: 'Aleatorio' },
];

const DURATION_MIN = 500;
const DURATION_MAX = 3000;
const DURATION_STEP = 100;

export function RevealFramePanel({ content, activeFrame, onChange }: Props) {
  const { optionId, phase } = activeFrame;
  const opt = content.options.find((o) => o.id === optionId);
  const frame = phase === 'select' ? opt?.select_frame : opt?.confirmation_frame;
  if (!opt || !frame) return null;

  const letter = String.fromCharCode(64 + optionId);
  const frameLabel = phase === 'select' ? 'select' : 'confirmation';

  const updateFrame = (patch: Partial<PuzzleFrame> | ((f: PuzzleFrame) => PuzzleFrame)) => {
    const newFrame = typeof patch === 'function' ? patch(frame) : { ...frame, ...patch };
    onChange({
      ...content,
      options: content.options.map((o) =>
        o.id === optionId
          ? phase === 'select'
            ? { ...o, select_frame: newFrame }
            : { ...o, confirmation_frame: newFrame }
          : o,
      ),
    });
  };

  const duration = frame.duration_ms ?? 1500;
  const shotType = frame.ball.shot_type ?? 'none';
  const spin = frame.ball.spin ?? 'none';

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold text-gray-500 uppercase">
        Frame {frameLabel} de la opción {letter}
      </h4>

      {/* Duración */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Duración</label>
          <span className="text-[10px] font-bold text-[#1A1A1A]">{duration} ms</span>
        </div>
        <input
          type="range"
          min={DURATION_MIN}
          max={DURATION_MAX}
          step={DURATION_STEP}
          value={duration}
          onChange={(e) => updateFrame({ duration_ms: Number(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
          <span>{DURATION_MIN} ms</span>
          <span>{DURATION_MAX} ms</span>
        </div>
      </div>

      {/* Tipo de tiro */}
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
          Tipo de tiro de la pelota
        </label>
        <div className="flex gap-1.5">
          {SHOT_TYPES.map((st) => (
            <button
              key={st.value}
              type="button"
              onClick={() =>
                updateFrame((f) => ({
                  ...f,
                  ball: { ...f.ball, shot_type: st.value === 'none' ? undefined : st.value },
                }))
              }
              className={`flex-1 px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
                shotType === st.value
                  ? 'bg-[#1A1A1A] text-white'
                  : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spin */}
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
          Spin de la pelota
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {SPINS.map((sp) => (
            <button
              key={sp.value}
              type="button"
              onClick={() =>
                updateFrame((f) => ({
                  ...f,
                  ball: { ...f.ball, spin: sp.value === 'none' ? undefined : sp.value },
                }))
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
