import { Image as KonvaImage, Circle, Group, Text } from 'react-konva';
import useImage from 'use-image';
import type { KonvaEventObject } from 'konva/lib/Node';
import { courtConfig } from '../lib/courtConfig';
import { m2px, px2m, snap, clampX, clampY, type ScaleInfo } from '../lib/coords';
import type { PuzzlePlayer } from '../../../../../types/learningContent';

interface Props {
  player: PuzzlePlayer;
  scale: ScaleInfo;
  selected: boolean;
  onSelect: () => void;
  onChange: (next: PuzzlePlayer) => void;
  snapToGrid: boolean;
  draggable: boolean;
}

// Aspect ratio del sprite original (alto/ancho). Mismo valor que en mobile.
const SPRITE_ASPECT = 3054 / 1408;

export function PlayerNode({ player, scale, selected, onSelect, onChange, snapToGrid, draggable }: Props) {
  // Silueta "back" para el equipo del usuario (mira hacia la red, espalda al espectador).
  // Silueta "front" para el rival arriba (mira hacia el espectador).
  const isUserTeam = player.team === 1;
  const src = isUserTeam ? '/puzzles/player_back.svg' : '/puzzles/player_front.svg';
  const [image] = useImage(src);

  // Ancho visual del jugador como fracción del ancho de la pista (~12% del Stage),
  // igual que en mobile. Alto respeta el aspect ratio del sprite original
  // (no es cuadrado).
  const widthPx = m2px(courtConfig.surface.width, scale) * 0.12;
  const heightPx = widthPx * SPRITE_ASPECT;

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const cx = e.target.x() + widthPx / 2;
    const cy = e.target.y() + heightPx / 2;
    let xMeters = clampX(px2m(cx, scale));
    let yMeters = clampY(px2m(cy, scale));
    if (snapToGrid) {
      xMeters = snap(xMeters);
      yMeters = snap(yMeters);
    }
    e.target.position({
      x: m2px(xMeters, scale) - widthPx / 2,
      y: m2px(yMeters, scale) - heightPx / 2,
    });
    onChange({ ...player, x: xMeters, y: yMeters });
  };

  const cxPx = m2px(player.x, scale);
  const cyPx = m2px(player.y, scale);

  return (
    <Group
      x={cxPx - widthPx / 2}
      y={cyPx - heightPx / 2}
      draggable={draggable}
      onDragEnd={handleDragEnd}
      onClick={onSelect}
      onTap={onSelect}
    >
      {selected && (
        <Circle
          x={widthPx / 2}
          y={heightPx / 2}
          radius={Math.max(widthPx, heightPx) / 2 + 4}
          stroke="#10b981"
          strokeWidth={3}
          listening={false}
        />
      )}
      {image ? (
        <KonvaImage image={image} width={widthPx} height={heightPx} />
      ) : (
        <Circle
          x={widthPx / 2}
          y={heightPx / 2}
          radius={widthPx / 2.5}
          fill={isUserTeam ? '#ffffff' : '#1a1a1a'}
          stroke="#000"
          strokeWidth={1}
        />
      )}
      {/* Solo mostramos texto bajo el jugador del usuario ("YOU"). El resto no
          lleva label — quita ruido visual del editor. */}
      {player.is_user && (
        <Text
          x={0}
          y={heightPx + 2}
          text="YOU"
          fontSize={Math.max(10, widthPx / 6)}
          fill="#fbbf24"
          fontStyle="bold"
          width={widthPx}
          align="center"
          listening={false}
        />
      )}
    </Group>
  );
}
