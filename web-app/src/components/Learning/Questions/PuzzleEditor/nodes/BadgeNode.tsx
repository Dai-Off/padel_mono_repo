// Squircle Konva para badges A/B/C. Draggable para reposicionar.
// El estado visual en el editor es siempre 'default' (no hay flujo selected/confirmed
// — eso solo aplica en el visor del usuario).

import { Group, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { m2px, px2m, snap, clampX, clampY, type ScaleInfo } from '../lib/coords';
import type { PuzzleOption } from '../../../../../types/learningContent';

const SIDE_M = 1.8;
const CORNER_M = 0.4;

interface Props {
  option: PuzzleOption;
  scale: ScaleInfo;
  onChange: (next: PuzzleOption) => void;
  snapToGrid: boolean;
  draggable: boolean;
}

function defaultBadgePos(optionId: 1 | 2 | 3) {
  return { x: 2 + 2.5 * optionId, y: 4 };
}

export function BadgeNode({ option, scale, onChange, snapToGrid, draggable }: Props) {
  const pos = option.badge_position ?? defaultBadgePos(option.id);
  const sidePx = m2px(SIDE_M, scale);
  const cornerPx = m2px(CORNER_M, scale);
  const letter = String.fromCharCode(64 + option.id);

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const cx = e.target.x() + sidePx / 2;
    const cy = e.target.y() + sidePx / 2;
    let x = clampX(px2m(cx, scale));
    let y = clampY(px2m(cy, scale));
    if (snapToGrid) {
      x = snap(x);
      y = snap(y);
    }
    e.target.position({
      x: m2px(x, scale) - sidePx / 2,
      y: m2px(y, scale) - sidePx / 2,
    });
    onChange({ ...option, badge_position: { x, y } });
  };

  return (
    <Group
      x={m2px(pos.x, scale) - sidePx / 2}
      y={m2px(pos.y, scale) - sidePx / 2}
      draggable={draggable}
      onDragEnd={handleDragEnd}
    >
      {/* Sombra */}
      <Rect
        x={m2px(0.06, scale)}
        y={m2px(0.1, scale)}
        width={sidePx}
        height={sidePx}
        cornerRadius={cornerPx}
        fill="rgba(0,0,0,0.25)"
        listening={false}
      />
      {/* Cuerpo */}
      <Rect
        width={sidePx}
        height={sidePx}
        cornerRadius={cornerPx}
        fill="#ffffff"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={m2px(0.06, scale)}
      />
      <Text
        x={0}
        y={sidePx / 2 - m2px(0.6, scale)}
        width={sidePx}
        text={letter}
        fontSize={m2px(1.2, scale)}
        fontStyle="900"
        fill={option.is_correct ? '#06210f' : '#111111'}
        align="center"
        listening={false}
      />
    </Group>
  );
}
