// Bocadillo blanco con rabo hacia abajo apuntando al jugador.
// Se monta dentro de AnimatedPlayer en el extremo superior del sprite y
// aparece con fade-in.
//
// El ancho del bocadillo se calcula a partir del texto (longitud × tamaño de
// fuente) para que siempre quepa sin deformar. El SVG usa viewBox dinámico y
// preserveAspectRatio por defecto (xMidYMid meet) para evitar el "aplastado"
// que ocurría con preserveAspectRatio="none".

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

type Props = {
  text: string;
  // Ancho del sprite del jugador, en px. Solo se usa para anclar la posición
  // horizontal y como referencia mínima de tamaño.
  spriteWidthPx: number;
};

// Dimensiones expresadas en "unidades de bocadillo". El viewBox del SVG se
// ajusta a estas medidas y el wrapper exterior escala todo a píxeles.
const PADDING_X = 12;       // padding horizontal del rect
const PADDING_Y = 8;        // padding vertical del rect
const FONT_SIZE = 28;       // altura de la fuente
const CHAR_WIDTH = FONT_SIZE * 0.55;  // ancho aproximado por char (bold)
const CORNER_R = 10;
const TAIL_W = 12;
const TAIL_H = 10;

export function SpeechBubble({ text, spriteWidthPx }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [text, opacity]);

  // Ancho del rect: padding + texto. Mínimo el ancho del sprite para evitar
  // bocadillos diminutos en textos cortos ("YOU").
  const textWidth = Math.max(spriteWidthPx * 0.4, text.length * CHAR_WIDTH);
  const bodyW = textWidth + PADDING_X * 2;
  const bodyH = FONT_SIZE + PADDING_Y * 2;
  const totalH = bodyH + TAIL_H;
  const cx = bodyW / 2;

  // Path: rounded rect (cuerpo) + triángulo (rabo) apuntando hacia abajo.
  const r = CORNER_R;
  const bodyPath = [
    `M ${r} 0`,
    `H ${bodyW - r}`,
    `Q ${bodyW} 0 ${bodyW} ${r}`,
    `V ${bodyH - r}`,
    `Q ${bodyW} ${bodyH} ${bodyW - r} ${bodyH}`,
    `H ${cx + TAIL_W / 2}`,
    `L ${cx} ${totalH}`,
    `L ${cx - TAIL_W / 2} ${bodyH}`,
    `H ${r}`,
    `Q 0 ${bodyH} 0 ${bodyH - r}`,
    `V ${r}`,
    `Q 0 0 ${r} 0`,
    'Z',
  ].join(' ');

  // Escala a píxeles: tamaño de la unidad ≈ FONT_SIZE px ⇒ alto del cuerpo ≈
  // FONT_SIZE + 2·PADDING_Y. Mantenemos la unidad nativa del SVG y dejamos
  // que el wrapper exterior fije ancho/alto en píxeles proporcionales.
  // Tomamos 0.42px por unidad para que un bocadillo "YOU" sea similar al de
  // padelchess sobre un sprite estándar.
  const unitPx = 0.42;
  const widthPx = bodyW * unitPx;
  const heightPx = totalH * unitPx;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrapper,
        {
          width: widthPx,
          height: heightPx,
          left: spriteWidthPx / 2 - widthPx / 2,
          top: -heightPx - 4,
          opacity,
        },
      ]}
    >
      <Svg width={widthPx} height={heightPx} viewBox={`0 0 ${bodyW} ${totalH}`}>
        <Path d={bodyPath} fill="#ffffff" stroke="rgba(0,0,0,0.8)" strokeWidth={2} />
        <SvgText
          x={cx}
          y={bodyH / 2}
          fontSize={FONT_SIZE}
          fontWeight="bold"
          fill="#000"
          textAnchor="middle"
          alignmentBaseline="central"
        >
          {text}
        </SvgText>
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
  },
});
