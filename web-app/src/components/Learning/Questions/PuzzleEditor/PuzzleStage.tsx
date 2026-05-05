import { useEffect, useRef, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import { CourtBackground } from './nodes/CourtBackground';
import { PlayerNode } from './nodes/PlayerNode';
import { BallNode } from './nodes/BallNode';
import { computeScale, type ScaleInfo } from './lib/coords';
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
}

export function PuzzleStage({ frame, selected, onSelect, onPlayerChange, onBallChange, snapToGrid }: Props) {
  // El stage ocupa el contenedor padre. Observamos el resize para recalcular la escala.
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

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gray-100 rounded-2xl overflow-hidden">
      {scale && (
        <Stage
          width={scale.widthPx}
          height={scale.heightPx}
          onClick={(e) => {
            // Click en zona vacía → deseleccionar
            if (e.target === e.target.getStage()) onSelect(null);
          }}
        >
          <Layer>
            <CourtBackground scale={scale} />
          </Layer>
          <Layer>
            {frame.players.map((p) => (
              <PlayerNode
                key={p.id}
                player={p}
                scale={scale}
                selected={selected?.kind === 'player' && selected.id === p.id}
                onSelect={() => onSelect({ kind: 'player', id: p.id })}
                onChange={onPlayerChange}
                snapToGrid={snapToGrid}
              />
            ))}
            <BallNode
              ball={frame.ball}
              scale={scale}
              selected={selected?.kind === 'ball'}
              onSelect={() => onSelect({ kind: 'ball' })}
              onChange={onBallChange}
              snapToGrid={snapToGrid}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
