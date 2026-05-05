import { Group, Rect, Line } from 'react-konva';
import { courtConfig } from '../lib/courtConfig';
import { m2px, type ScaleInfo } from '../lib/coords';

interface Props {
  scale: ScaleInfo;
}

// Fondo de la pista: superficie azul + líneas blancas + red horizontal.
export function CourtBackground({ scale }: Props) {
  const { surface, line, net, serviceLines, centerServiceLine } = courtConfig;
  const W = m2px(surface.width, scale);
  const H = m2px(surface.height, scale);
  const lw = m2px(line.width, scale);

  return (
    <Group listening={false}>
      {/* Superficie */}
      <Rect x={0} y={0} width={W} height={H} fill={surface.color} />

      {/* Bordes laterales y de fondo */}
      <Rect x={0} y={0} width={W} height={H} stroke={line.color} strokeWidth={lw} listening={false} />

      {/* Líneas de saque */}
      <Line
        points={[0, m2px(serviceLines.topY, scale), W, m2px(serviceLines.topY, scale)]}
        stroke={line.color}
        strokeWidth={lw}
      />
      <Line
        points={[0, m2px(serviceLines.bottomY, scale), W, m2px(serviceLines.bottomY, scale)]}
        stroke={line.color}
        strokeWidth={lw}
      />

      {/* Línea central de saque (vertical, sólo entre líneas de saque) */}
      <Line
        points={[
          m2px(centerServiceLine.x, scale),
          m2px(centerServiceLine.fromY, scale),
          m2px(centerServiceLine.x, scale),
          m2px(centerServiceLine.toY, scale),
        ]}
        stroke={line.color}
        strokeWidth={lw}
      />

      {/* Red (horizontal central, más gruesa) */}
      <Line
        points={[0, m2px(net.y, scale), W, m2px(net.y, scale)]}
        stroke={net.color}
        strokeWidth={lw * 2.5}
      />
    </Group>
  );
}
