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
}

export function PlayerNode({ player, scale, selected, onSelect, onChange, snapToGrid }: Props) {
  // El sprite "back" representa al equipo del usuario (mira hacia la red, espalda al espectador).
  // El sprite "face" se usa para el equipo rival arriba (mira hacia el espectador).
  const isUserTeam = player.team === 1;
  const src = isUserTeam ? '/puzzles/player-white-back.png' : '/puzzles/player-white-face.png';
  const [image] = useImage(src);

  // Tamaño visual del jugador: 3.5 × radius en metros, expresado en píxeles.
  const sizePx = m2px(courtConfig.player.radius * 3.5, scale);

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const cx = e.target.x() + sizePx / 2;
    const cy = e.target.y() + sizePx / 2;
    let xMeters = clampX(px2m(cx, scale));
    let yMeters = clampY(px2m(cy, scale));
    if (snapToGrid) {
      xMeters = snap(xMeters);
      yMeters = snap(yMeters);
    }
    // Reposicionar el nodo a la posición snapeada (visual).
    e.target.position({
      x: m2px(xMeters, scale) - sizePx / 2,
      y: m2px(yMeters, scale) - sizePx / 2,
    });
    onChange({ ...player, x: xMeters, y: yMeters });
  };

  const cxPx = m2px(player.x, scale);
  const cyPx = m2px(player.y, scale);

  return (
    <Group
      x={cxPx - sizePx / 2}
      y={cyPx - sizePx / 2}
      draggable
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
        <KonvaImage image={image} width={sizePx} height={sizePx} listening={false} />
      ) : (
        // Fallback mientras carga la imagen
        <Circle
          x={sizePx / 2}
          y={sizePx / 2}
          radius={sizePx / 2.5}
          fill={isUserTeam ? '#ffffff' : '#1a1a1a'}
          stroke="#000"
          strokeWidth={1}
          listening={false}
        />
      )}
      {/* Etiqueta con id para referencia visual */}
      <Text
        x={0}
        y={sizePx + 2}
        text={`P${player.id}`}
        fontSize={Math.max(10, sizePx / 8)}
        fill="#ffffff"
        width={sizePx}
        align="center"
        listening={false}
      />
    </Group>
  );
}
