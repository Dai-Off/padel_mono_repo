import { useEffect, useRef, useState } from 'react';
import { Magnet } from 'lucide-react';
import { PuzzleStage, type SelectedItem } from './PuzzleStage';
import { MetaPanel } from './panels/MetaPanel';
import { OptionsPanel } from './panels/OptionsPanel';
import { FramesTabs } from './panels/FramesTabs';
import { RevealFramePanel } from './panels/RevealFramePanel';
import { ShapesToolbar } from './panels/ShapesToolbar';
import { ShapeInspector } from './panels/ShapeInspector';
import { cloneFrame, interpolateFrames, type ActiveFrameKey } from './lib/frames';
import type {
  PuzzleBall,
  PuzzleContent,
  PuzzleFrame,
  PuzzleOption,
  PuzzlePlayer,
  PuzzleShape,
} from '../../../../types/learningContent';

interface Props {
  content: PuzzleContent;
  onChange: (next: PuzzleContent) => void;
}

type Phase = 'select' | 'confirm';

export function PuzzleEditor({ content, onChange }: Props) {
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [activeFrame, setActiveFrame] = useState<ActiveFrameKey>('initial');

  // Preview animado: frame interpolado en cada tick. Si null, no estamos en preview.
  const [previewFrame, setPreviewFrame] = useState<PuzzleFrame | null>(null);
  const previewRafRef = useRef<number | null>(null);

  // Si la opción activa pierde su frame, volver a 'initial'.
  useEffect(() => {
    if (activeFrame === 'initial') return;
    const opt = content.options.find((o) => o.id === activeFrame.optionId);
    const hasFrame =
      activeFrame.phase === 'select' ? !!opt?.select_frame : !!opt?.confirmation_frame;
    if (!hasFrame) setActiveFrame('initial');
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
    const opt = content.options.find((o) => o.id === activeFrame.optionId);
    const frame =
      activeFrame.phase === 'select' ? opt?.select_frame : opt?.confirmation_frame;
    return frame ?? content.initial_frame;
  };

  const writeActiveFrame = (mut: (f: PuzzleFrame) => PuzzleFrame) => {
    if (activeFrame === 'initial') {
      onChange({ ...content, initial_frame: mut(content.initial_frame) });
      return;
    }
    const { optionId, phase } = activeFrame;
    onChange({
      ...content,
      options: content.options.map((o) => {
        if (o.id !== optionId) return o;
        if (phase === 'select' && o.select_frame) {
          return { ...o, select_frame: mut(o.select_frame) };
        }
        if (phase === 'confirm' && o.confirmation_frame) {
          return { ...o, confirmation_frame: mut(o.confirmation_frame) };
        }
        return o;
      }),
    });
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
  // Shapes del frame activo: añadir, borrar, editar.
  // ---------------------------------------------------------------------------

  const addShape = (shape: PuzzleShape) => {
    writeActiveFrame((f) => ({
      ...f,
      shapes: [...(f.shapes ?? []), shape],
    }));
    setSelected({ kind: 'shape', id: shape.id });
  };

  const removeShape = (id: string) => {
    writeActiveFrame((f) => ({
      ...f,
      shapes: (f.shapes ?? []).filter((s) => s.id !== id),
    }));
    if (selected?.kind === 'shape' && selected.id === id) setSelected(null);
  };

  const updateShape = (next: PuzzleShape) => {
    writeActiveFrame((f) => ({
      ...f,
      shapes: (f.shapes ?? []).map((s) => (s.id === next.id ? next : s)),
    }));
  };

  // ---------------------------------------------------------------------------
  // Add / remove frames por opción y fase
  // ---------------------------------------------------------------------------

  const addFrame = (optionIdx: number, phase: Phase) => {
    const next = [...content.options];
    const opt = next[optionIdx];
    if (!opt) return;
    // Si ya existe la otra fase, clonamos de ahí; si no, del initial_frame.
    const source: PuzzleFrame =
      phase === 'select'
        ? opt.select_frame ?? opt.confirmation_frame ?? content.initial_frame
        : opt.confirmation_frame ?? opt.select_frame ?? content.initial_frame;
    const cloned: PuzzleFrame = { ...cloneFrame(source), duration_ms: source.duration_ms ?? 1500 };

    next[optionIdx] = (
      phase === 'select'
        ? { ...opt, select_frame: cloned }
        : { ...opt, confirmation_frame: cloned }
    ) as PuzzleOption;
    onChange({ ...content, options: next });
    setActiveFrame({ optionId: opt.id, phase });
    setSelected(null);
  };

  const removeFrame = (optionIdx: number, phase: Phase) => {
    const next = [...content.options];
    const opt = next[optionIdx];
    if (!opt) return;
    if (phase === 'select') {
      const { select_frame: _omit, ...rest } = opt;
      void _omit;
      next[optionIdx] = rest as PuzzleOption;
    } else {
      const { confirmation_frame: _omit, ...rest } = opt;
      void _omit;
      next[optionIdx] = rest as PuzzleOption;
    }
    onChange({ ...content, options: next });
    if (
      activeFrame !== 'initial' &&
      activeFrame.optionId === opt.id &&
      activeFrame.phase === phase
    ) {
      setActiveFrame('initial');
    }
  };

  // ---------------------------------------------------------------------------
  // Preview animado: initial → select → confirm (encadenado).
  // ---------------------------------------------------------------------------

  const runPreview = (optionIdx: number) => {
    const opt = content.options[optionIdx];
    if (!opt) return;
    const stages: { from: PuzzleFrame; to: PuzzleFrame; duration: number }[] = [];
    if (opt.select_frame) {
      stages.push({
        from: content.initial_frame,
        to: opt.select_frame,
        duration: Math.max(200, opt.select_frame.duration_ms ?? 1500),
      });
    }
    if (opt.confirmation_frame) {
      stages.push({
        from: opt.select_frame ?? content.initial_frame,
        to: opt.confirmation_frame,
        duration: Math.max(200, opt.confirmation_frame.duration_ms ?? 1500),
      });
    }
    if (stages.length === 0) return;

    setSelected(null);
    let stageIdx = 0;
    let stageStart = performance.now();

    const tick = (now: number) => {
      const stage = stages[stageIdx];
      const elapsed = now - stageStart;
      const t = Math.min(1, elapsed / stage.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setPreviewFrame(interpolateFrames(stage.from, stage.to, eased));
      if (t < 1) {
        previewRafRef.current = requestAnimationFrame(tick);
        return;
      }
      // Stage actual terminado: pasar al siguiente o cerrar.
      if (stageIdx < stages.length - 1) {
        stageIdx++;
        stageStart = now;
        previewRafRef.current = requestAnimationFrame(tick);
      } else {
        // Mantener el último frame medio segundo y salir.
        previewRafRef.current = window.setTimeout(() => {
          setPreviewFrame(null);
          previewRafRef.current = null;
        }, 600) as unknown as number;
      }
    };
    setPreviewFrame(stages[0].from);
    previewRafRef.current = requestAnimationFrame(tick);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const previewing = previewFrame !== null;
  const frameToShow = previewing ? previewFrame! : getActiveFrame();

  const activeLetter =
    activeFrame !== 'initial' ? String.fromCharCode(64 + activeFrame.optionId) : null;
  const activePhaseLabel =
    activeFrame !== 'initial' ? (activeFrame.phase === 'select' ? 'select' : 'confirmation') : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 h-[70vh] min-h-[600px]">
      {/* Canvas + controles */}
      <div className="flex flex-col h-full min-h-0">
        <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
          <FramesTabs
            content={content}
            active={activeFrame}
            onSelect={setActiveFrame}
            onAddFrame={addFrame}
            onRemoveFrame={removeFrame}
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
            options={content.options}
            onOptionChange={(next) =>
              onChange({
                ...content,
                options: content.options.map((o) => (o.id === next.id ? next : o)),
              })
            }
            showConfirmShapes={
              activeFrame !== 'initial' && activeFrame.phase === 'confirm'
            }
          />
        </div>

        {activeFrame !== 'initial' && !previewing && (
          <p className="text-[10px] text-amber-600 mt-2">
            Estás editando el frame <strong>{activePhaseLabel}</strong> de la opción {activeLetter}.
            Mueve los jugadores y la pelota a la posición que tendrá esta fase.
          </p>
        )}
      </div>

      {/* Paneles laterales */}
      <div className="space-y-4 overflow-y-auto pr-1">
        <MetaPanel content={content} onChange={onChange} />
        {activeFrame !== 'initial' && (
          <>
            <div className="border-t border-gray-100" />
            <RevealFramePanel
              content={content}
              activeFrame={activeFrame}
              onChange={onChange}
            />
          </>
        )}
        <div className="border-t border-gray-100" />
        <ShapesToolbar
          shapes={frameToShow.shapes ?? []}
          selectedShapeId={selected?.kind === 'shape' ? selected.id : null}
          onSelectShape={(id) => setSelected(id ? { kind: 'shape', id } : null)}
          onAdd={addShape}
          onRemove={removeShape}
        />
        {selected?.kind === 'shape' &&
          (() => {
            const shape = (frameToShow.shapes ?? []).find((s) => s.id === selected.id);
            return shape ? (
              <>
                <div className="border-t border-gray-100" />
                <ShapeInspector shape={shape} onChange={updateShape} />
              </>
            ) : null;
          })()}
        <div className="border-t border-gray-100" />
        <OptionsPanel content={content} onChange={onChange} />
      </div>
    </div>
  );
}
