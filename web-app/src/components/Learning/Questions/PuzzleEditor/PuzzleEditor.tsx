import { useEffect, useRef, useState } from 'react';
import { Magnet } from 'lucide-react';
import { PuzzleStage, type SelectedItem } from './PuzzleStage';
import { MetaPanel } from './panels/MetaPanel';
import { OptionsPanel } from './panels/OptionsPanel';
import { FramesTabs } from './panels/FramesTabs';
import { cloneFrame, interpolateFrames, type ActiveFrameKey } from './lib/frames';
import type {
  PuzzleBall,
  PuzzleContent,
  PuzzleFrame,
  PuzzleOption,
  PuzzlePlayer,
} from '../../../../types/learningContent';

interface Props {
  content: PuzzleContent;
  onChange: (next: PuzzleContent) => void;
}

export function PuzzleEditor({ content, onChange }: Props) {
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [activeFrame, setActiveFrame] = useState<ActiveFrameKey>('initial');

  // Preview animado: frame interpolado en cada tick. Si null, no estamos en preview.
  const [previewFrame, setPreviewFrame] = useState<PuzzleFrame | null>(null);
  const previewRafRef = useRef<number | null>(null);

  // Si la opción activa pierde su reveal_frame (porque la borraron), volver a initial.
  useEffect(() => {
    if (activeFrame !== 'initial') {
      const opt = content.options.find((o) => o.id === activeFrame);
      if (!opt?.reveal_frame) setActiveFrame('initial');
    }
  }, [content.options, activeFrame]);

  // Limpieza del rAF al desmontar.
  useEffect(() => () => {
    if (previewRafRef.current != null) cancelAnimationFrame(previewRafRef.current);
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers para escribir en el frame activo
  // ---------------------------------------------------------------------------

  const getActiveFrame = (): PuzzleFrame => {
    if (activeFrame === 'initial') return content.initial_frame;
    const opt = content.options.find((o) => o.id === activeFrame);
    return opt?.reveal_frame ?? content.initial_frame;
  };

  const writeActiveFrame = (mut: (f: PuzzleFrame) => PuzzleFrame) => {
    if (activeFrame === 'initial') {
      onChange({ ...content, initial_frame: mut(content.initial_frame) });
    } else {
      onChange({
        ...content,
        options: content.options.map((o) =>
          o.id === activeFrame && o.reveal_frame
            ? { ...o, reveal_frame: mut(o.reveal_frame) }
            : o,
        ),
      });
    }
  };

  const updatePlayer = (next: PuzzlePlayer) => {
    writeActiveFrame((f) => ({
      ...f,
      players: f.players.map((p) => (p.id === next.id ? next : p)),
    }));
  };

  const updateBall = (next: PuzzleBall) => {
    writeActiveFrame((f) => ({ ...f, ball: next }));
  };

  // ---------------------------------------------------------------------------
  // Reveal frames: añadir / eliminar
  // ---------------------------------------------------------------------------

  const addRevealFrame = (optionIdx: number) => {
    const next = [...content.options];
    const opt = next[optionIdx];
    if (!opt || opt.reveal_frame) return;
    next[optionIdx] = {
      ...opt,
      reveal_frame: { ...cloneFrame(content.initial_frame), duration_ms: 800 },
    } as PuzzleOption;
    onChange({ ...content, options: next });
    setActiveFrame(opt.id);
    setSelected(null);
  };

  const removeRevealFrame = (optionIdx: number) => {
    const next = [...content.options];
    const opt = next[optionIdx];
    if (!opt) return;
    const { reveal_frame: _omit, ...rest } = opt;
    void _omit;
    next[optionIdx] = rest as PuzzleOption;
    onChange({ ...content, options: next });
    if (activeFrame === opt.id) setActiveFrame('initial');
  };

  // ---------------------------------------------------------------------------
  // Preview animado
  // ---------------------------------------------------------------------------

  const runPreview = (optionIdx: number) => {
    const opt = content.options[optionIdx];
    if (!opt?.reveal_frame) return;
    const from = content.initial_frame;
    const to = opt.reveal_frame;
    const duration = Math.max(200, opt.reveal_frame.duration_ms ?? 800);
    const start = performance.now();

    setSelected(null);

    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / duration);
      // Easing ease-out cúbico para que la transición se sienta natural.
      const eased = 1 - Math.pow(1 - t, 3);
      setPreviewFrame(interpolateFrames(from, to, eased));
      if (t >= 1) {
        // Mantener el frame final visible un instante y luego salir del preview.
        previewRafRef.current = window.setTimeout(() => {
          setPreviewFrame(null);
          previewRafRef.current = null;
        }, 600) as unknown as number;
      } else {
        previewRafRef.current = requestAnimationFrame(tick);
      }
    };
    setPreviewFrame(from);
    previewRafRef.current = requestAnimationFrame(tick);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const previewing = previewFrame !== null;
  const frameToShow = previewing ? previewFrame! : getActiveFrame();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 h-[70vh] min-h-[600px]">
      {/* Canvas + controles */}
      <div className="flex flex-col h-full min-h-0">
        <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
          <FramesTabs
            content={content}
            active={activeFrame}
            onSelect={setActiveFrame}
            onAddRevealFrame={addRevealFrame}
            onRemoveRevealFrame={removeRevealFrame}
            onPreview={runPreview}
            previewing={previewing}
          />
          <button
            type="button"
            disabled={previewing}
            onClick={() => setSnapToGrid((v) => !v)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
              snapToGrid ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#1A1A1A] border border-gray-200'
            } ${previewing ? 'opacity-50 pointer-events-none' : ''}`}
            title="Snap a grid de 0.25 m"
          >
            <Magnet className="w-3 h-3" />
            Snap {snapToGrid ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="relative flex-1 min-h-0">
          {previewing && (
            <div className="absolute top-2 left-2 z-10 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl shadow">
              Reproduciendo preview…
            </div>
          )}
          <PuzzleStage
            frame={frameToShow}
            selected={selected}
            onSelect={setSelected}
            onPlayerChange={updatePlayer}
            onBallChange={updateBall}
            snapToGrid={snapToGrid}
            draggable={!previewing}
          />
        </div>

        {activeFrame !== 'initial' && !previewing && (
          <p className="text-[10px] text-amber-600 mt-2">
            Estás editando el frame de revelación de la opción {String.fromCharCode(64 + activeFrame)}.
            Mueve los jugadores y la pelota a la posición final tras confirmar esta opción.
          </p>
        )}
      </div>

      {/* Paneles laterales */}
      <div className="space-y-4 overflow-y-auto pr-1">
        <MetaPanel content={content} onChange={onChange} />
        <div className="border-t border-gray-100" />
        <OptionsPanel content={content} onChange={onChange} />
      </div>
    </div>
  );
}
