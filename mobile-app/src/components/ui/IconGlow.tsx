import { useId } from 'react';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

type Props = {
  /** Color base de la luz (se desvanece a transparente en el borde). */
  color: string;
  /** Tamaño del lienzo cuadrado en px. */
  size?: number;
  /** Opacidad del centro del degradado (0-1). */
  intensity?: number;
};

/**
 * Halo de luz difusa para colocar detrás de un icono. Usa un RadialGradient que
 * va de color sólido en el centro a transparente en el borde — el mismo patrón
 * que la card de la Home (`DailyLessonIconBackdropSvg`), en vez de un círculo
 * sólido que queda plano. Pensado para envolverse en un Animated.View si se
 * quiere animar (respiración via scale/opacity).
 *
 * El centro está ligeramente sesgado hacia arriba (cy 42%) para simular una
 * fuente de luz desde arriba, algo más premium que un halo perfectamente plano.
 */
export function IconGlow({ color, size = 240, intensity = 0.5 }: Props) {
  const gid = useId().replace(/:/g, '_');
  const gradId = `icon_glow_${gid}`;
  const r = size / 2;
  // Caída gradual (tipo gaussiana) con muchas paradas y una cola larga que se
  // desvanece a casi nada bastante antes del borde: así no hay un "borde" de
  // círculo perceptible, solo una luz que se difumina.
  return (
    <Svg width={size} height={size} pointerEvents="none">
      <Defs>
        <RadialGradient id={gradId} cx="50%" cy="42%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={intensity} />
          <Stop offset="15%" stopColor={color} stopOpacity={intensity * 0.78} />
          <Stop offset="30%" stopColor={color} stopOpacity={intensity * 0.5} />
          <Stop offset="45%" stopColor={color} stopOpacity={intensity * 0.28} />
          <Stop offset="60%" stopColor={color} stopOpacity={intensity * 0.13} />
          <Stop offset="75%" stopColor={color} stopOpacity={intensity * 0.05} />
          <Stop offset="88%" stopColor={color} stopOpacity={intensity * 0.015} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={`url(#${gradId})`} />
    </Svg>
  );
}
