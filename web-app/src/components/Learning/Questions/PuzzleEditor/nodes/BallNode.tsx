import { Group, Image as KonvaImage, Circle } from 'react-konva';
import useImage from 'use-image';
import type { KonvaEventObject } from 'konva/lib/Node';
import { courtConfig } from '../lib/courtConfig';
import { m2px, px2m, snap, clampX, clampY, type ScaleInfo } from '../lib/coords';
import type { PuzzleBall } from '../../../../../types/learningContent';

interface Props {
  ball: PuzzleBall;
  scale: ScaleInfo;
  selected: boolean;
  onSelect: () => void;
  onChange: (next: PuzzleBall) => void;
  snapToGrid: boolean;
  draggable: boolean;
}

export function BallNode({ ball, scale, selected, onSelect, onChange, snapToGrid, draggable }: Props) {
  const [image] = useImage('/puzzles/ball.svg');
  // Tamaño visual = diámetro = 2 × radius en metros.
  const sizePx = m2px(courtConfig.ball.radius * 2, scale);

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    // Posición central a partir de la esquina del Group.
    const cx = e.target.x() + sizePx / 2;
    const cy = e.target.y() + sizePx / 2;
    let xMeters = clampX(px2m(cx, scale));
    let yMeters = clampY(px2m(cy, scale));
    if (snapToGrid) {
      xMeters = snap(xMeters);
      yMeters = snap(yMeters);
    }
    e.target.position({
      x: m2px(xMeters, scale) - sizePx / 2,
      y: m2px(yMeters, scale) - sizePx / 2,
    });
    onChange({ ...ball, x: xMeters, y: yMeters });
  };

  return (
    <Group
      x={m2px(ball.x, scale) - sizePx / 2}
      y={m2px(ball.y, scale) - sizePx / 2}
      draggable={draggable}
      onDragEnd={handleDragEnd}
      onClick={onSelect}
      onTap={onSelect}
    >
      {selected && (
        <Circle
          x={sizePx / 2}
          y={sizePx / 2}
          radius={sizePx / 2 + 4}
          stroke="#10b981"
          strokeWidth={3}
          listening={false}
        />
      )}
      {image ? (
        <KonvaImage image={image} width={sizePx} height={sizePx} />
      ) : (
        <Circle
          x={sizePx / 2}
          y={sizePx / 2}
          radius={sizePx / 2}
          fill="#daf843"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={1.5}
        />
      )}
    </Group>
  );
}
