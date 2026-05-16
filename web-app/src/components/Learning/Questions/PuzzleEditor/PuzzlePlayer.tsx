// Visor interactivo del puzzle (modo "Play"). Replica el comportamiento del
// visor mobile: el usuario selecciona A/B/C → ver select_frame → confirmar
// → ver confirmation_frame. Usado por el editor para previsualizar el flujo
// completo antes de guardar.

import { useEffect, useRef, useState } from 'react';
import { X, SkipBack } from 'lucide-react';
import { PuzzleStage } from './PuzzleStage';
import { interpolateFrames } from './lib/frames';
import type { PuzzleContent, PuzzleFrame, PuzzleOption } from '../../../../types/learningContent';

interface Props {
  content: PuzzleContent;
  onClose: () => void;
}

export function PuzzlePlayer({ content, onClose }: Props) {
  const [selected, setSelected] = useState<PuzzleOption | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [transitionFrame, setTransitionFrame] = useState<PuzzleFrame | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  // Auto-reproducción del intro al cargar (declarado después de animateTo).
  const [introPlayed, setIntroPlayed] = useState(!content.intro_frame);

  // Frame destino según estado.
  const targetFrame: PuzzleFrame =
    confirmed && selected?.confirmation_frame
      ? selected.confirmation_frame
      : selected?.select_frame ?? selected?.confirmation_frame ?? content.initial_frame;

  // Arranca una animación de `from` a `to`.
  const animateTo = (from: PuzzleFrame, to: PuzzleFrame) => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const duration = Math.max(200, to.duration_ms ?? 1500);
    const start = performance.now();
    setTransitionProgress(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setTransitionFrame(interpolateFrames(from, to, eased));
      setTransitionProgress(eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else {
        setTransitionFrame(null);
        setTransitionProgress(1);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const handleSelect = (opt: PuzzleOption) => {
    if (confirmed) return;
    // El `from` debe ser el frame que se está VIENDO en pantalla en este
    // instante (puede ser una interpolación en curso). Así si el usuario
    // interrumpe la animación seleccionando otra opción, la nueva animación
    // arranca desde donde estaba la escena, sin salto.
    const currentVisual = transitionFrame ?? targetFrame;
    if (selected?.id === opt.id) {
      setSelected(null);
      animateTo(currentVisual, content.initial_frame);
      return;
    }
    const to = opt.select_frame ?? content.initial_frame;
    setSelected(opt);
    animateTo(currentVisual, to);
  };

  const handleConfirm = () => {
    if (!selected || confirmed) return;
    const currentVisual = transitionFrame ?? targetFrame;
    const to = selected.confirmation_frame ?? currentVisual;
    setConfirmed(true);
    animateTo(currentVisual, to);
  };

  const reset = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setTransitionFrame(null);
    setSelected(null);
    setConfirmed(false);
    setIntroPlayed(!content.intro_frame);
    setIntroAnimating(!!content.intro_frame);
  };

  const replayIntro = () => {
    if (!content.intro_frame || selected || confirmed) return;
    animateTo(content.intro_frame, content.initial_frame);
    setIntroAnimating(true);
  };

  // Cuando se monta y hay intro, dispara la animación intro → initial en el
  // siguiente tick (para que el primer render muestre el intro).
  useEffect(() => {
    if (introPlayed || !content.intro_frame) return;
    const raf = requestAnimationFrame(() => {
      animateTo(content.intro_frame!, content.initial_frame);
      setIntroPlayed(true);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introPlayed]);

  // Mantener flag de "animación de intro en curso" para ocultar badges.
  // Cubre: primer paint del intro + duración de la animación intro→initial.
  const [introAnimating, setIntroAnimating] = useState<boolean>(!!content.intro_frame);
  useEffect(() => {
    if (!introAnimating) return;
    const dur = content.initial_frame?.duration_ms ?? 1500;
    const t = setTimeout(() => setIntroAnimating(false), dur + 100);
    return () => clearTimeout(t);
  }, [introAnimating, content.initial_frame?.duration_ms]);

  // Primer paint con intro_frame si aún no se ha disparado el animateTo del
  // intro. Una vez `introPlayed === true`, `transitionFrame` toma el control.
  const frameToShow =
    transitionFrame ??
    (!introPlayed && content.intro_frame ? content.intro_frame : targetFrame);
  const state = confirmed ? 'confirmed' : selected ? 'select' : 'init';
  const correctOption = content.options.find((o) => o.is_correct) ?? null;

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-md bg-[#0a0a0c] rounded-2xl shadow-2xl flex flex-col my-auto" style={{ minHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-white text-sm font-bold">Preview interactiva</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="text-[10px] font-bold text-white/60 hover:text-white"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Statement + botón replay intro */}
        <div className="px-4 pt-3 flex items-start gap-2">
          <p className="text-white text-sm font-bold leading-snug flex-1">
            {content.statement}
          </p>
          {content.intro_frame && !selected && !confirmed && (
            <button
              type="button"
              onClick={replayIntro}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60"
              title="Repetir intro"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Stage */}
        <div className="flex-1 min-h-0 p-4 flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '10.8 / 20.8', maxHeight: '60vh' }}>
            <PuzzleStage
              frame={frameToShow}
              selected={null}
              onSelect={() => {}}
              onPlayerChange={() => {}}
              onBallChange={() => {}}
              snapToGrid={false}
              draggable={false}
              options={content.options}
              playerSelectedId={selected?.id ?? null}
              playerConfirmed={confirmed}
              trajectoryProgress={transitionProgress}
              onPlayerSelect={confirmed ? undefined : handleSelect}
              backgroundClass="bg-[#0a0a0c]"
              prevFrame={
                confirmed && selected
                  ? (selected.select_frame ?? content.initial_frame)
                  : selected
                    ? content.initial_frame
                    : null
              }
              // Ocultar badges A/B/C durante toda la animación intro→initial.
              // Aparecen con fade-in cuando termina.
              badgesHidden={introAnimating}
            />
          </div>
        </div>

        {/* Bubble + actions */}
        <div className="px-4 pb-4 space-y-3">
          <BubbleHint
            state={state}
            selected={selected}
            confirmed={confirmed}
            correctOption={correctOption}
          />

          <div className="flex items-center gap-2">
            {content.options.map((opt) => {
              const letter = String.fromCharCode(64 + opt.id);
              const isSelected = selected?.id === opt.id;
              const showCorrect = confirmed && opt.is_correct;
              const showWrong = confirmed && isSelected && !opt.is_correct;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  disabled={confirmed}
                  className={`w-11 h-11 rounded-xl text-sm font-black flex items-center justify-center transition-all ${
                    showCorrect
                      ? 'bg-emerald-500 text-white'
                      : showWrong
                        ? 'bg-red-500 text-white'
                        : isSelected
                          ? 'bg-[#1F2937] text-white border border-white/35'
                          : 'bg-white/5 text-gray-400 border border-white/10'
                  } ${confirmed ? 'cursor-default' : 'hover:bg-white/10'}`}
                >
                  {letter}
                </button>
              );
            })}
            {!confirmed && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!selected}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                  selected
                    ? 'bg-[#F18F34] text-white hover:bg-[#d97706]'
                    : 'bg-white/5 text-white/30 cursor-not-allowed'
                }`}
              >
                Confirmar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BubbleHint({
  state,
  selected,
  confirmed,
  correctOption,
}: {
  state: 'init' | 'select' | 'confirmed';
  selected: PuzzleOption | null;
  confirmed: boolean;
  correctOption: PuzzleOption | null;
}) {
  if (state === 'init') {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
        <p className="text-xs text-gray-400">Selecciona A, B o C y luego confirma.</p>
      </div>
    );
  }
  if (state === 'select' && selected) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
        <p className="text-xs font-bold text-white">
          {String.fromCharCode(64 + selected.id)} · {selected.text}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">Pulsa Confirmar para ver el resultado.</p>
      </div>
    );
  }
  if (confirmed && selected) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 space-y-1">
        <p className={`text-xs font-bold ${selected.is_correct ? 'text-emerald-400' : 'text-red-400'}`}>
          {String.fromCharCode(64 + selected.id)} · {selected.text}
        </p>
        {selected.explanation && (
          <p className="text-xs text-gray-300">{selected.explanation}</p>
        )}
        {!selected.is_correct && correctOption && (
          <p className="text-xs font-bold text-emerald-400">
            Correcta: {String.fromCharCode(64 + correctOption.id)} — {correctOption.text}
          </p>
        )}
      </div>
    );
  }
  return null;
}
