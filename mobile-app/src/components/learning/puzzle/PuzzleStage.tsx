import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from 'react-native';
import Court from '../../../../assets/puzzles/court.svg';
import { AnimatedPlayer, StaticPlayer } from './AnimatedPlayer';
import { AnimatedBall, StaticBall } from './AnimatedBall';
import {
  STAGE_ASPECT,
  courtConfig,
  m2pctX,
  m2pctY,
} from './lib/courtConfig';
import type { PuzzleFrame } from '../../../types/puzzle';

const STAGE_H_M = 20 + 2 * courtConfig.outerMargin;

type Props = {
  frame: PuzzleFrame;
  // Cuando es false, los actores se renderizan en posición fija sin animar
  // (útil para el render inicial estático antes de confirmar).
  animate?: boolean;
};

export function PuzzleStage({ frame, animate = true }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const win = useWindowDimensions();

  // Calcular dimensiones del Stage limitadas por pantalla. Se reserva el resto
  // para enunciado/opciones/confirmar de modo que todo entre sin scroll.
  const maxH = win.height * 0.5;                 // 50% del alto disponible
  const maxW = Math.min(win.width - 24, 380);    // 12px de margen lateral, tope 380
  const widthFromHeight = maxH * STAGE_ASPECT;
  const stageW = Math.min(maxW, widthFromHeight);
  const stageH = stageW / STAGE_ASPECT;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const playerWidthPx = size ? ((courtConfig.player.radius * 3.5) / STAGE_H_M) * size.h : 0;
  const ballSidePx = size ? ((courtConfig.ball.radius * 2) / STAGE_H_M) * size.h : 0;
  const durationMs = frame.duration_ms ?? 1500;

  return (
    <View style={[styles.wrapper, { width: stageW, height: stageH }]}>
      <View style={styles.stage} onLayout={onLayout}>
        {/* Pista de fondo (incluye paredes y márgenes). */}
        <Court width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />

        {size &&
          frame.players.map((p) => {
            const cxPx = (m2pctX(p.x) / 100) * size.w;
            const cyPx = (m2pctY(p.y) / 100) * size.h;
            return animate ? (
              <AnimatedPlayer
                key={p.id}
                player={p}
                cxPx={cxPx}
                cyPx={cyPx}
                widthPx={playerWidthPx}
                durationMs={durationMs}
              />
            ) : (
              <StaticPlayer
                key={p.id}
                player={p}
                cxPx={cxPx}
                cyPx={cyPx}
                widthPx={playerWidthPx}
              />
            );
          })}

        {size && (
          animate ? (
            <AnimatedBall
              ball={frame.ball}
              cxPx={(m2pctX(frame.ball.x) / 100) * size.w}
              cyPx={(m2pctY(frame.ball.y) / 100) * size.h}
              sizePx={ballSidePx}
              durationMs={durationMs}
            />
          ) : (
            <StaticBall
              ball={frame.ball}
              cxPx={(m2pctX(frame.ball.x) / 100) * size.w}
              cyPx={(m2pctY(frame.ball.y) / 100) * size.h}
              sizePx={ballSidePx}
            />
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
  },
  stage: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#0d0d10',
  },
});
