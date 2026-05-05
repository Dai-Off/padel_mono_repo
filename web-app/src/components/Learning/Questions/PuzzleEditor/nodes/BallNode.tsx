import { Circle } from 'react-konva';
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
}

export function BallNode({ ball, scale, selected, onSelect, onChange, snapToGrid }: Props) {
  const radiusPx = m2px(courtConfig.ball.radius, scale);

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    let xMeters = clampX(px2m(e.target.x(), scale));
    let yMeters = clampY(px2m(e.target.y(), scale));
    if (snapToGrid) {
      xMeters = snap(xMeters);
      yMeters = snap(yMeters);
    }
    e.target.position({ x: m2px(xMeters, scale), y: m2px(yMeters, scale) });
    onChange({ ...ball, x: xMeters, y: yMeters });
  };

  return (
    <Circle
      x={m2px(ball.x, scale)}
      y={m2px(ball.y, scale)}
      radius={radiusPx}
      fill={courtConfig.ball.color}
      stroke={selected ? '#10b981' : 'rgba(0,0,0,0.45)'}
      strokeWidth={selected ? 3 : 1.5}
      shadowColor="#000"
      shadowBlur={2}
      shadowOpacity={0.25}
      shadowOffsetY={1}
      draggable
      onDragEnd={handleDragEnd}
      onClick={onSelect}
      onTap={onSelect}
    />
  );
}
