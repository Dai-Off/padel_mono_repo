import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Group } from 'react-konva';
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
  // Si la fase activa del editor es 'confirm', se muestran también las shapes
  // con visible_only_after_confirmation. En 'initial' y 'select' se filtran.
  showConfirmShapes?: boolean;
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
  showConfirmShapes = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<ScaleInfo | null>(null);

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

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gray-100 rounded-2xl overflow-hidden">
      {scale && (
        <Stage
          width={scale.widthPx}
          height={scale.heightPx}
          onClick={(e) => {
            if (e.target === e.target.getStage()) onSelect(null);
          }}
        >
          <Layer listening={false}>
            <CourtBackground scale={scale} />
          </Layer>

          {/* Capa de shapes (no interactiva, filtrada por vOAC). */}
          <Layer listening={false}>
            <Group x={innerOffsetPx} y={innerOffsetPx}>
              {(frame.shapes ?? [])
                .filter((s) => showConfirmShapes || !s.visible_only_after_confirmation)
                .map((s) => (
                  <ShapeNode key={s.id} shape={s} scale={scale} />
                ))}
            </Group>
          </Layer>

          <Layer>
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
                  draggable={draggable}
                />
              ))}
              <BallNode
                ball={frame.ball}
                scale={scale}
                selected={selected?.kind === 'ball'}
                onSelect={() => onSelect({ kind: 'ball' })}
                onChange={onBallChange}
                snapToGrid={snapToGrid}
                draggable={draggable}
              />
            </Group>
          </Layer>

          {/* Capa de badges A/B/C (encima de players/ball). */}
          {options && onOptionChange && (
            <Layer>
              <Group x={innerOffsetPx} y={innerOffsetPx}>
                {options.map((opt) => (
                  <BadgeNode
                    key={opt.id}
                    option={opt}
                    scale={scale}
                    onChange={onOptionChange}
                    snapToGrid={snapToGrid}
                    draggable={draggable}
                  />
                ))}
              </Group>
            </Layer>
          )}
        </Stage>
      )}
    </div>
  );
}
