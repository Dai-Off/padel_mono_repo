// Render Konva read-only de los 6 tipos de shape. Las shapes con
// `visible_only_after_confirmation` se ocultan a no ser que la fase activa
// del editor sea 'confirm'.

import { Arrow, Circle, Group, Line, Rect, Text } from 'react-konva';
import { m2px, type ScaleInfo } from '../lib/coords';
import type { PuzzleShape } from '../../../../../types/learningContent';

interface Props {
  shape: PuzzleShape;
  scale: ScaleInfo;
}

export function ShapeNode({ shape, scale }: Props) {
  const stroke = shape.color ?? '#ffcf68';
  const strokeWidth = m2px(0.12, scale);

  switch (shape.type) {
    case 'circle': {
      const dash = shape.dashed ? [m2px(0.3, scale), m2px(0.2, scale)] : undefined;
      return (
        <Circle
          x={m2px(shape.x, scale)}
          y={m2px(shape.y, scale)}
          radius={m2px(shape.radius, scale)}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
          listening={false}
        />
      );
    }

    case 'arrow': {
      const { startPoint: s, endPoint: e, controlPoint: c } = shape;
      const dash = shape.dashed ? [m2px(0.3, scale), m2px(0.2, scale)] : undefined;
      const points = c
        ? [
            m2px(s.x, scale),
            m2px(s.y, scale),
            m2px(c.x, scale),
            m2px(c.y, scale),
            m2px(e.x, scale),
            m2px(e.y, scale),
          ]
        : [
            m2px(s.x, scale),
            m2px(s.y, scale),
            m2px(e.x, scale),
            m2px(e.y, scale),
          ];
      return (
        <Arrow
          points={points}
          tension={c ? 0.5 : 0}
          stroke={stroke}
          fill={stroke}
          strokeWidth={strokeWidth}
          pointerLength={m2px(0.5, scale)}
          pointerWidth={m2px(0.36, scale)}
          pointerAtBeginning={shape.pointerAtBeginning ?? false}
          dash={dash}
          listening={false}
        />
      );
    }

    case 'rect': {
      return (
        <Rect
          x={m2px(shape.x, scale)}
          y={m2px(shape.y, scale)}
          width={m2px(shape.width, scale)}
          height={m2px(shape.height, scale)}
          fill={shape.fillColor ?? 'transparent'}
          opacity={shape.fillOpacity ?? 1}
          stroke={stroke}
          strokeWidth={strokeWidth}
          listening={false}
        />
      );
    }

    case 'line': {
      const pts: number[] = [];
      for (let i = 0; i < shape.points.length - 1; i += 2) {
        pts.push(m2px(shape.points[i], scale), m2px(shape.points[i + 1], scale));
      }
      return (
        <Line
          points={pts}
          stroke={stroke}
          strokeWidth={m2px(shape.strokeWidth ?? 0.12, scale)}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      );
    }

    case 'text': {
      const sizeM = Math.max(0.45, (shape.fontSize ?? 14) * 0.05);
      const sizePx = m2px(sizeM, scale);
      return (
        <Text
          x={m2px(shape.x, scale) - sizePx * shape.text.length * 0.25}
          y={m2px(shape.y, scale) - sizePx / 2}
          text={shape.text}
          fontSize={sizePx}
          fontStyle="bold"
          fill={stroke}
          stroke="#000"
          strokeWidth={m2px(0.04, scale)}
          listening={false}
        />
      );
    }

    case 'triangle': {
      const pts: number[] = [];
      for (let i = 0; i < 6; i += 2) {
        pts.push(m2px(shape.points[i], scale), m2px(shape.points[i + 1], scale));
      }
      return (
        <Line
          points={pts}
          closed
          fill={shape.fillColor ?? 'transparent'}
          opacity={shape.fillOpacity ?? 1}
          stroke={stroke}
          strokeWidth={strokeWidth}
          listening={false}
        />
      );
    }

    default: {
      // Exhaustive guard
      const _exhaustive: never = shape;
      void _exhaustive;
      return <Group />;
    }
  }
}
