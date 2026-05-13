import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from 'react-native';
import Court from '../../../../assets/puzzles/court.svg';
import { AnimatedPlayer, StaticPlayer } from './AnimatedPlayer';
import { AnimatedBall, StaticBall } from './AnimatedBall';
import { Shapes, type PuzzleStateKey } from './Shapes';
import { Badges } from './Badges';
import {
  STAGE_ASPECT,
  courtConfig,
  m2pctX,
  m2pctY,
} from './lib/courtConfig';
import type { PuzzleFrame, PuzzleOption } from '../../../types/puzzle';

const STAGE_H_M = 20 + 2 * courtConfig.outerMargin;

type Props = {
  frame: PuzzleFrame;
  // Cuando es false, los actores se renderizan en posición fija sin animar
  // (útil para el render inicial estático antes de confirmar).
  animate?: boolean;
  // Estado actual del puzzle: gobierna el filtrado de shapes con
  // visible_only_after_confirmation. Default 'init' para que no se vean spoilers
  // cuando el caller no lo pasa.
  state?: PuzzleStateKey;
  // Si se pasan options + onSelectOption, se renderiza la capa de badges A/B/C
  // en pista. Si no se pasan, la capa se omite (caller solo quiere visor).
  options?: PuzzleOption[];
  selectedOptionId?: 1 | 2 | 3 | null;
  onSelectOption?: (opt: PuzzleOption) => void;
};

export function PuzzleStage({
  frame,
  animate = true,
  state = 'init',
  options,
  selectedOptionId = null,
  onSelectOption,
}: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const win = useWindowDimensions();

  // Defensa: si el frame está malformado (sin players o sin ball), no renderizamos
  // actores. Evita crashes ante datos corruptos. PuzzleQuestion ya filtra arriba pero
  // dejamos el guard aquí también para defensa en profundidad.
  const validFrame = !!frame && Array.isArray(frame.players) && !!frame.ball;

  // Calcular dimensiones del Stage. Se reserva un alto fijo para los demás
  // elementos verticales del visor (header lección, statement, bocadillo,
  // barra de acciones y márgenes) y la pista usa el resto. Más robusto que un
  // % fijo: se adapta a pantallas pequeñas/grandes y a statements de 2-3 líneas.
  const RESERVED_H = 340;
  const maxH = Math.max(260, win.height - RESERVED_H);
  const maxW = Math.min(win.width - 24, 440);
  const widthFromHeight = maxH * STAGE_ASPECT;
  const stageW = Math.min(maxW, widthFromHeight);
  const stageH = stageW / STAGE_ASPECT;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  // Ancho visual del jugador como fracción del ancho de la pista (~12% del ancho).
  // Más natural que escalar por radius porque los sprites tienen aspect ratio propio.
  const playerWidthPx = size ? size.w * 0.12 : 0;
  const ballSidePx = size ? ((courtConfig.ball.radius * 2) / STAGE_H_M) * size.h : 0;
  const durationMs = frame?.duration_ms ?? 1500;

  return (
    <View style={[styles.wrapper, { width: stageW, height: stageH }]}>
      <View style={styles.stage} onLayout={onLayout}>
        {/* Pista de fondo (incluye paredes y márgenes). */}
        <Court width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />

        {/* Capa de shapes: entre court y players. */}
        {size && validFrame && (
          <Shapes frame={frame} state={state} widthPx={size.w} heightPx={size.h} />
        )}

        {size && validFrame &&
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
                puzzleState={state}
              />
            ) : (
              <StaticPlayer
                key={p.id}
                player={p}
                cxPx={cxPx}
                cyPx={cyPx}
                widthPx={playerWidthPx}
                puzzleState={state}
              />
            );
          })}

        {size && validFrame && (
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

        {/* Capa de badges A/B/C en pista. Encima de players/ball. */}
        {size && options && onSelectOption && (
          <Badges
            options={options}
            selectedId={selectedOptionId}
            confirmed={state === 'confirmed'}
            onSelect={onSelectOption}
            widthPx={size.w}
            heightPx={size.h}
          />
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
