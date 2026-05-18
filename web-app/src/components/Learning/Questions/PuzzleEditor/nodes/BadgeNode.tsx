// Squircle Konva para badges A/B/C en el editor. Estilo coherente con el visor
// mobile: fondo oscuro semitransparente (no blanco) para no tapar los elementos
// del frame. Draggable para reposicionar.
//
// Estado visual:
//   - normal: fondo negro 65% alpha + letra blanca.
//   - dimmed (otra opción activa): opacidad reducida.
//   - active (esta opción es la tab activa): borde naranja resaltado.

import { Group, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { m2px, px2m, snap, clampX, clampY, type ScaleInfo } from '../lib/coords';
import type { PuzzleOption } from '../../../../../types/learningContent';

const SIDE_M = 1.8;
const CORNER_M = 0.4;

interface Props {
  option: PuzzleOption;
  scale: ScaleInfo;
  onChange?: (next: PuzzleOption) => void;
  snapToGrid: boolean;
  draggable: boolean;
  // Modo editor — si está marcada como activa, el badge se destaca (borde naranja).
  active?: boolean;
  // Si hay alguna opción activa y esta no es la activa, atenuar al 40%.
  dimmed?: boolean;
  // Modo visor (PlayModal): estado del flujo de respuesta.
  //   undefined = modo editor (usa active/dimmed).
  //   number    = id de la opción seleccionada en el flujo.
  //   null      = no hay opción seleccionada.
  playerSelectedId?: 1 | 2 | 3 | null;
  playerConfirmed?: boolean;
  // Click handler en modo visor.
  onPlayerSelect?: (opt: PuzzleOption) => void;
}

function defaultBadgePos(optionId: 1 | 2 | 3) {
  return { x: 2 + 2.5 * optionId, y: 4 };
}

export function BadgeNode({
  option,
  scale,
  onChange,
  snapToGrid,
  draggable,
  active,
  dimmed,
  playerSelectedId,
  playerConfirmed,
  onPlayerSelect,
}: Props) {
  const pos = option.badge_position ?? defaultBadgePos(option.id);
  const sidePx = m2px(SIDE_M, scale);
  const cornerPx = m2px(CORNER_M, scale);
  const letter = String.fromCharCode(64 + option.id);

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (!onChange) return;
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

  // Determinar fill/stroke/text/opacity según modo (editor vs visor).
  let fill: string;
  let strokeColor: string;
  let textColor: string;
  let opacity = 1;

  if (playerSelectedId !== undefined) {
    // Modo visor: estados como en mobile.
    const isSelected = playerSelectedId === option.id;
    const anyActive = playerSelectedId !== null;
    const showCorrectReveal = playerConfirmed && !isSelected && option.is_correct;
    if (playerConfirmed && isSelected) {
      // Confirmed: verde/rojo según is_correct.
      fill = option.is_correct ? '#22c55e' : '#ef4444';
      strokeColor = 'rgba(0,0,0,0.55)';
      textColor = option.is_correct ? '#06210f' : '#2a0606';
    } else if (showCorrectReveal) {
      fill = '#22c55e';
      strokeColor = 'rgba(0,0,0,0.55)';
      textColor = '#06210f';
    } else if (isSelected) {
      fill = '#fb923c';
      strokeColor = 'rgba(0,0,0,0.55)';
      textColor = '#1a0a00';
    } else {
      // default: oscuro semitransparente.
      fill = 'rgba(0,0,0,0.65)';
      strokeColor = 'rgba(255,255,255,0.5)';
      textColor = '#ffffff';
    }
    if (anyActive && !isSelected && !showCorrectReveal) opacity = 0.4;
  } else {
    // Modo editor: active/dimmed.
    opacity = dimmed ? 0.4 : 1;
    fill = active ? '#F18F34' : 'rgba(0,0,0,0.65)';
    strokeColor = active ? '#F18F34' : 'rgba(255,255,255,0.5)';
    textColor = active ? '#1a0a00' : '#ffffff';
  }

  return (
    <Group
      x={m2px(pos.x, scale) - sidePx / 2}
      y={m2px(pos.y, scale) - sidePx / 2}
      draggable={draggable}
      onDragEnd={handleDragEnd}
      onClick={onPlayerSelect ? (e) => { e.cancelBubble = true; onPlayerSelect(option); } : undefined}
      onTap={onPlayerSelect ? (e) => { e.cancelBubble = true; onPlayerSelect(option); } : undefined}
      opacity={opacity}
    >
      <Rect
        width={sidePx}
        height={sidePx}
        cornerRadius={cornerPx}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={m2px(0.06, scale)}
      />
      <Text
        x={0}
        y={sidePx / 2 - m2px(0.6, scale)}
        width={sidePx}
        text={letter}
        fontSize={m2px(1.2, scale)}
        fontStyle="900"
        fill={textColor}
        align="center"
        listening={false}
      />
    </Group>
  );
}
