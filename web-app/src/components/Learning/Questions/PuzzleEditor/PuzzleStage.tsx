import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Group } from 'react-konva';
import { CourtBackground } from './nodes/CourtBackground';
import { PlayerNode } from './nodes/PlayerNode';
import { BallNode } from './nodes/BallNode';
import { computeScale, m2px, type ScaleInfo } from './lib/coords';
import { courtConfig } from './lib/courtConfig';
import type { PuzzleBall, PuzzleFrame, PuzzlePlayer } from '../../../../types/learningContent';

export type SelectedItem =
  | { kind: 'player'; id: number }
  | { kind: 'ball' }
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
}

export function PuzzleStage({ frame, selected, onSelect, onPlayerChange, onBallChange, snapToGrid, draggable }: Props) {
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
        </Stage>
      )}
    </div>
  );
}
