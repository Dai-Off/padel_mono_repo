import { Image as KonvaImage, Rect } from 'react-konva';
import useImage from 'use-image';
import { OUTER_DIMENSIONS, m2px, type ScaleInfo } from '../lib/coords';

interface Props {
  scale: ScaleInfo;
}

// Fondo de la pista: court.svg ocupa todo el Stage (incluye paredes/margen).
// Las posiciones de jugadores/pelota se renderizan en una capa interior
// desplazada por outerMargin para alinearse con la superficie de juego.
export function CourtBackground({ scale }: Props) {
  const [image] = useImage('/puzzles/court.svg');
  const W = m2px(OUTER_DIMENSIONS.width, scale);
  const H = m2px(OUTER_DIMENSIONS.height, scale);

  if (!image) {
    // Fallback mientras carga: rectángulo azul
    return <Rect x={0} y={0} width={W} height={H} fill="#3b82f6" listening={false} />;
  }

  return <KonvaImage image={image} x={0} y={0} width={W} height={H} listening={false} />;
}
