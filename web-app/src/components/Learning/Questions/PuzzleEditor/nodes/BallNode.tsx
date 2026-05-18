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
  // Progreso 0..1 de la animación en curso. Si está definido y < 1 y el ball
  // tiene shot_type lob/chiquita, la bola se escala según una parábola que
  // simula la altura del tiro (igual que en mobile AnimatedBall).
  animationProgress?: number;
}

export function BallNode({ ball, scale, selected, onSelect, onChange, snapToGrid, draggable, animationProgress }: Props) {
  const [image] = useImage('/puzzles/ball.svg');
  const sizePx = m2px(courtConfig.ball.radius * 2, scale);

  // Escala animada según shot_type. Misma fórmula que mobile:
  //   lob: peak scale 2.5 en t=0.5
  //   chiquita: peak scale 1.25 en t=0.5
  //   otros / completo: 1
  let scaleFactor = 1;
  if (animationProgress !== undefined && animationProgress < 1) {
    const peak = ball.shot_type === 'lob' ? 2.5 : ball.shot_type === 'chiquita' ? 1.25 : 1;
    if (peak > 1) {
      // Parábola simétrica: 1 → peak → 1.
      const t = animationProgress;
      scaleFactor = 1 + (peak - 1) * (1 - Math.pow(2 * t - 1, 2));
    }
  }
  const scaledSize = sizePx * scaleFactor;
  // Offset para mantener el centro de la bola en su posición lógica.
  const offset = (scaledSize - sizePx) / 2;

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
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
        <KonvaImage
          image={image}
          x={-offset}
          y={-offset}
          width={scaledSize}
          height={scaledSize}
        />
      ) : (
        <Circle
          x={sizePx / 2}
          y={sizePx / 2}
          radius={scaledSize / 2}
          fill="#daf843"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={1.5}
        />
      )}
    </Group>
  );
}
