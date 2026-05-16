import type {
  PuzzleContent,
  PuzzleFrame,
  PuzzleShotType,
  PuzzleSpin,
} from '../../../../../types/learningContent';
import type { ActiveFrameKey } from '../lib/frames';

interface Props {
  content: PuzzleContent;
  activeFrame: ActiveFrameKey;
  // Sub-tab cuando activeFrame === 'initial': 'intro' edita intro_frame,
  // 'static' edita initial_frame.
  initialSubTab?: 'intro' | 'static';
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

// Resuelve el (frame, label, isAnimatedDestination) según activeFrame + subtab.
// `isAnimatedDestination`: el frame es destino de una transición animada — solo
// entonces tienen sentido shot_type / spin / auto_trajectory.
function resolveTarget(
  content: PuzzleContent,
  activeFrame: ActiveFrameKey,
  initialSubTab: 'intro' | 'static' | undefined,
): {
  frame: PuzzleFrame;
  label: string;
  isAnimatedDestination: boolean;
  apply: (newFrame: PuzzleFrame) => PuzzleContent;
} | null {
  if (activeFrame === 'initial') {
    // Si hay intro, el initial se anima desde intro: es destino animado.
    const hasIntro = !!content.intro_frame;
    if (initialSubTab === 'intro' && content.intro_frame) {
      return {
        frame: content.intro_frame,
        label: 'Frame intro',
        // El intro es el origen, no se anima hacia él (lo mostramos al cargar).
        // Solo permitimos editar duración (cuánto se ve antes de la transición).
        isAnimatedDestination: false,
        apply: (f) => ({ ...content, intro_frame: f }),
      };
    }
    // initialSubTab === 'static' o no hay intro.
    return {
      frame: content.initial_frame,
      label: hasIntro ? 'Frame estático (desde intro)' : 'Frame inicial',
      isAnimatedDestination: hasIntro,
      apply: (f) => ({ ...content, initial_frame: f }),
    };
  }

  const { optionId, phase } = activeFrame;
  const opt = content.options.find((o) => o.id === optionId);
  const frame = phase === 'select' ? opt?.select_frame : opt?.confirmation_frame;
  if (!opt || !frame) return null;
  const letter = String.fromCharCode(64 + optionId);
  return {
    frame,
    label: `Frame ${phase === 'select' ? 'select' : 'confirmation'} de la opción ${letter}`,
    isAnimatedDestination: true,
    apply: (f) => ({
      ...content,
      options: content.options.map((o) =>
        o.id === optionId
          ? phase === 'select'
            ? { ...o, select_frame: f }
            : { ...o, confirmation_frame: f }
          : o,
      ),
    }),
  };
}

export function RevealFramePanel({ content, activeFrame, initialSubTab, onChange }: Props) {
  const target = resolveTarget(content, activeFrame, initialSubTab);
  if (!target) return null;
  const { frame, label, isAnimatedDestination, apply } = target;

  const updateFrame = (patch: Partial<PuzzleFrame> | ((f: PuzzleFrame) => PuzzleFrame)) => {
    const newFrame = typeof patch === 'function' ? patch(frame) : { ...frame, ...patch };
    onChange(apply(newFrame));
  };

  const duration = frame.duration_ms ?? 1500;
  const shotType = frame.ball.shot_type ?? 'none';
  const spin = frame.ball.spin ?? 'none';
  const autoTrajectory = frame.auto_trajectory !== false;

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold text-gray-500 uppercase">{label}</h4>

      {/* Trayectoria automática y tipo de tiro / spin: solo cuando este frame
          es destino animado de una transición (intro→initial o initial→select,
          select→confirm). Si no, son irrelevantes (frame estático). */}
      {isAnimatedDestination && (
        <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={autoTrajectory}
            onChange={(e) => updateFrame({ auto_trajectory: e.target.checked })}
          />
          <span className="font-bold">Trayectoria automática</span>
          <span
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold cursor-help"
            title="Genera flecha + highlights desde la posición de la pelota del frame anterior. Desactiva para casos especiales (rebotes en pared, trayectorias múltiples)."
          >
            ?
          </span>
        </label>
      )}

      {/* Duración: siempre disponible (también para intro: cuánto se ve antes
          de animar hacia el estático). */}
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

      {isAnimatedDestination && (
        <>
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
        </>
      )}
    </div>
  );
}
