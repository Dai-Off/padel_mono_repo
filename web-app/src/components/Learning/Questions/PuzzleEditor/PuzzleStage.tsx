import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Group, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { createShapeFromDrag } from './lib/shapeFactory';
import { generateAutoShapes } from './lib/autoTrajectory';
import { CourtBackground } from './nodes/CourtBackground';
import { PlayerNode } from './nodes/PlayerNode';
import { BallNode } from './nodes/BallNode';
import { ShapeNode } from './nodes/ShapeNode';
import { BadgeNode } from './nodes/BadgeNode';
import { computeScale, m2px, type ScaleInfo } from './lib/coords';
import { courtConfig } from './lib/courtConfig';
import type {
  PuzzleBall,
  PuzzleFrame,
  PuzzleOption,
  PuzzlePlayer,
} from '../../../../types/learningContent';

export type SelectedItem =
  | { kind: 'player'; id: number }
  | { kind: 'ball' }
  | { kind: 'shape'; id: string }
  | null;

interface Props {
  frame: PuzzleFrame;
  selected: SelectedItem;
  onSelect: (s: SelectedItem) => void;
  onPlayerChange: (player: PuzzlePlayer) => void;
  onBallChange: (ball: PuzzleBall) => void;
  snapToGrid: boolean;
  // Cuando está en preview, los nodos no son draggable y no se selecciona nada.
  draggable: boolean;
  // Opciones del puzzle. Si vienen, se renderizan los badges A/B/C en pista
  // (draggable para reposicionar). Si no, la capa se omite.
  options?: PuzzleOption[];
  onOptionChange?: (next: PuzzleOption) => void;
  // Callback para actualizar una shape (drag/edit). Si no se pasa, las shapes
  // no son interactivas.
  onShapeChange?: (next: import('../../../../types/learningContent').PuzzleShape) => void;
  // Id de la opción activa en el editor (tab activa). Si está definido, el badge
  // de esa opción se resalta y los demás se atenúan al 40%.
  activeOptionId?: 1 | 2 | 3 | null;
  // Si false, los badges no son draggable (solo se mueven en la tab Inicial).
  badgesDraggable?: boolean;
  // Modo visor (PlayModal): cuando se pasa, los badges se renderizan con los
  // estados del flujo de respuesta (selected/confirmed) como en mobile.
  playerSelectedId?: 1 | 2 | 3 | null;
  playerConfirmed?: boolean;
  // Modo dibujo: cuando se pasa un tipo, el stage captura mousedown/move/up
  // para crear una shape con las dimensiones del drag.
  drawingType?: import('./lib/shapeFactory').ShapeType | null;
  onDrawingComplete?: (shape: import('../../../../types/learningContent').PuzzleShape) => void;
  // Progress 0..1 para sincronizar las trayectorias con la pelota durante
  // animaciones (preview, play). Default 1 = todas las flechas completas.
  trajectoryProgress?: number;
  // Modo visor: callback al hacer click en un badge A/B/C (selección de opción).
  onPlayerSelect?: (opt: PuzzleOption) => void;
  // Color del fondo alrededor del campo (default: gris claro del editor).
  // Útil en RUN/visor donde el modal es oscuro.
  backgroundClass?: string;
  // Frame anterior. Si está definido y frame.auto_trajectory !== false, se
  // generan trajectory + highlights automáticamente desde la pelota previa.
  prevFrame?: PuzzleFrame | null;
  // Visor (PlayModal): si true, los badges se ocultan con opacity 0 y no son
  // pulsables. Se usa durante la animación intro→initial.
  badgesHidden?: boolean;
}

export function PuzzleStage({
  frame,
  selected,
  onSelect,
  onPlayerChange,
  onBallChange,
  snapToGrid,
  draggable,
  options,
  onOptionChange,
  onShapeChange,
  activeOptionId,
  playerSelectedId,
  playerConfirmed,
  drawingType,
  onDrawingComplete,
  badgesDraggable = true,
  trajectoryProgress,
  onPlayerSelect,
  backgroundClass = 'bg-gray-100',
  prevFrame,
  badgesHidden,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<ScaleInfo | null>(null);

  // Opacidad animada de la capa de badges (fade in/out al cambiar badgesHidden).
  const [badgesOpacity, setBadgesOpacity] = useState(badgesHidden ? 0 : 1);
  useEffect(() => {
    const target = badgesHidden ? 0 : 1;
    const from = badgesOpacity;
    if (from === target) return;
    const dur = 350;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setBadgesOpacity(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badgesHidden]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setScale(computeScale({ widthPx: w, heightPx: h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Offset interior: las coordenadas en metros de los actores empiezan
  // en la esquina interior de la pista (no de las paredes). Por eso
  // los desplazamos por outerMargin dentro del Stage.
  const innerOffsetPx = scale ? m2px(courtConfig.outerMargin, scale) : 0;

  // Estado del drag de dibujo: punto inicial + punto actual en metros.
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);

  // Convierte un evento de Konva a coords en metros (interior del campo).
  const eventToMeters = (e: KonvaEventObject<MouseEvent>) => {
    if (!scale) return null;
    const stage = e.target.getStage();
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    // Restar el offset del Group interno + dividir por pixelsPerMeter.
    const xM = (pos.x - innerOffsetPx) / scale.pixelsPerMeter;
    const yM = (pos.y - innerOffsetPx) / scale.pixelsPerMeter;
    return { x: Math.max(0, Math.min(courtConfig.surface.width, xM)), y: Math.max(0, Math.min(courtConfig.surface.height, yM)) };
  };

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (!drawingType) {
      // Sin modo dibujo: click sobre fondo deselecciona.
      if (e.target === e.target.getStage()) onSelect(null);
      return;
    }
    const pt = eventToMeters(e);
    if (!pt) return;
    setDrawStart(pt);
    setDrawEnd(pt);
  };

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!drawingType || !drawStart) return;
    const pt = eventToMeters(e);
    if (pt) setDrawEnd(pt);
  };

  const handleStageMouseUp = () => {
    if (!drawingType || !drawStart || !drawEnd) {
      setDrawStart(null);
      setDrawEnd(null);
      return;
    }
    // Si el drag es minúsculo (<0.3m), trata como click-default (centro + tamaño mínimo).
    const dist = Math.hypot(drawEnd.x - drawStart.x, drawEnd.y - drawStart.y);
    let shape;
    if (dist < 0.3) {
      // Click puntual: shape pequeña centrada en el click.
      const cx = drawStart.x;
      const cy = drawStart.y;
      const r = 0.5;
      shape = createShapeFromDrag(drawingType, cx - r, cy - r, cx + r, cy + r);
    } else {
      shape = createShapeFromDrag(drawingType, drawStart.x, drawStart.y, drawEnd.x, drawEnd.y);
    }
    onDrawingComplete?.(shape);
    setDrawStart(null);
    setDrawEnd(null);
  };

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex items-center justify-center ${backgroundClass} rounded-2xl overflow-hidden`}
      style={drawingType ? { cursor: 'crosshair' } : undefined}
    >
      {scale && (
        <Stage
          width={scale.widthPx}
          height={scale.heightPx}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onClick={(e) => {
            // Click sin modo dibujo: deselecciona si pulsa el fondo.
            if (!drawingType && e.target === e.target.getStage()) onSelect(null);
          }}
        >
          <Layer listening={false}>
            <CourtBackground scale={scale} />
          </Layer>

          {/* Capa de badges A/B/C. En el editor van DETRÁS de shapes/players
              (no tapar el contenido). En el visor (PlayModal) van con estados
              selected/confirmed y son clicables. */}
          {options && (
            <Layer
              listening={!drawingType && badgesOpacity > 0.5 && (draggable || !!onPlayerSelect)}
              opacity={badgesOpacity}
            >
              <Group x={innerOffsetPx} y={innerOffsetPx}>
                {options.map((opt) => {
                  const isActive = activeOptionId === opt.id;
                  const isDimmed = activeOptionId != null && !isActive;
                  return (
                    <BadgeNode
                      key={opt.id}
                      option={opt}
                      scale={scale}
                      onChange={onOptionChange}
                      snapToGrid={snapToGrid}
                      draggable={draggable && badgesDraggable && !drawingType}
                      active={isActive}
                      dimmed={isDimmed}
                      playerSelectedId={playerSelectedId}
                      playerConfirmed={playerConfirmed}
                      onPlayerSelect={onPlayerSelect}
                    />
                  );
                })}
              </Group>
            </Layer>
          )}

          {/* Capa de shapes (interactiva: drag + click). Auto-shapes primero
              (no interactivas), luego las manuales encima. */}
          <Layer>
            <Group x={innerOffsetPx} y={innerOffsetPx}>
              {generateAutoShapes(prevFrame ?? null, frame).map((s) => (
                <ShapeNode
                  key={s.id}
                  shape={s}
                  scale={scale}
                  draggable={false}
                  ballShotType={frame.ball.shot_type === 'lob' || frame.ball.shot_type === 'chiquita' ? frame.ball.shot_type : undefined}
                  trajectoryProgress={trajectoryProgress}
                />
              ))}
              {(frame.shapes ?? []).map((s) => (
                <ShapeNode
                  key={s.id}
                  shape={s}
                  scale={scale}
                  selected={selected?.kind === 'shape' && selected.id === s.id}
                  onSelect={() => onSelect({ kind: 'shape', id: s.id })}
                  onChange={(next) => onShapeChange?.(next)}
                  draggable={draggable && !drawingType}
                  ballShotType={frame.ball.shot_type === 'lob' || frame.ball.shot_type === 'chiquita' ? frame.ball.shot_type : undefined}
                  trajectoryProgress={trajectoryProgress}
                />
              ))}

              {/* Preview del dibujo en curso: rect punteado entre drawStart y drawEnd. */}
              {drawingType && drawStart && drawEnd && (
                <Rect
                  x={m2px(Math.min(drawStart.x, drawEnd.x), scale)}
                  y={m2px(Math.min(drawStart.y, drawEnd.y), scale)}
                  width={m2px(Math.abs(drawEnd.x - drawStart.x), scale)}
                  height={m2px(Math.abs(drawEnd.y - drawStart.y), scale)}
                  stroke="#F18F34"
                  strokeWidth={2}
                  dash={[6, 4]}
                  fill="rgba(241,143,52,0.1)"
                  listening={false}
                />
              )}
            </Group>
          </Layer>

          <Layer listening={!drawingType}>
            <Group x={innerOffsetPx} y={innerOffsetPx}>
              {frame.players.map((p) => (
                <PlayerNode
                  key={p.id}
                  player={p}
                  scale={scale}
                  selected={selected?.kind === 'player' && selected.id === p.id}
                  onSelect={() => onSelect({ kind: 'player', id: p.id })}
                  onChange={onPlayerChange}
                  snapToGrid={snapToGrid}
                  draggable={draggable && !drawingType}
                />
              ))}
              <BallNode
                ball={frame.ball}
                scale={scale}
                selected={selected?.kind === 'ball'}
                onSelect={() => onSelect({ kind: 'ball' })}
                onChange={onBallChange}
                snapToGrid={snapToGrid}
                draggable={draggable && !drawingType}
                animationProgress={trajectoryProgress}
              />
            </Group>
          </Layer>

        </Stage>
      )}
    </div>
  );
}
