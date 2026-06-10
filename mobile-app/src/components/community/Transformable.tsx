import React, { useRef } from 'react';
import { Animated, StyleProp, ViewStyle, StyleSheet } from 'react-native';
import {
  PanGestureHandler,
  PinchGestureHandler,
  RotationGestureHandler,
  State,
  PanGestureHandlerStateChangeEvent,
  PinchGestureHandlerStateChangeEvent,
  RotationGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';

export interface TransformValues { x: number; y: number; scale: number; rotation: number }

interface TransformableProps {
  initX: number;          // px iniciales (desplazamiento)
  initY: number;
  initScale: number;
  initRotation: number;   // grados
  containerW: number;     // para convertir px -> fracción al confirmar
  containerH: number;
  panMinPointers?: number; // 1 = arrastrar con 1 dedo; 2 = solo 2 dedos (imagen)
  fill?: boolean;          // true = ocupa todo el contenedor (imagen); false = al tamaño del contenido (capas)
  onSelect?: () => void;
  onCommit: (t: TransformValues) => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Capa/imagen transformable con gestos fiables (react-native-gesture-handler):
 * arrastrar + pellizcar (escalar) + rotar, simultáneos. Cada gesto acumula
 * sobre su último valor confirmado, así funcionan combinados.
 */
export const Transformable: React.FC<TransformableProps> = ({
  initX, initY, initScale, initRotation, containerW, containerH,
  panMinPointers = 1, fill = false, onSelect, onCommit, style, children,
}) => {
  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const rotRef = useRef(null);

  const transX = useRef(new Animated.Value(initX)).current;
  const transY = useRef(new Animated.Value(initY)).current;
  const scaleA = useRef(new Animated.Value(initScale)).current;
  const rotA = useRef(new Animated.Value(initRotation)).current; // grados

  const last = useRef({ x: initX, y: initY, scale: initScale, rot: initRotation });

  const commit = () => {
    onCommit({
      x: last.current.x / containerW,
      y: last.current.y / containerH,
      scale: last.current.scale,
      rotation: last.current.rot,
    });
  };

  const onPan = (e: any) => {
    transX.setValue(last.current.x + e.nativeEvent.translationX);
    transY.setValue(last.current.y + e.nativeEvent.translationY);
  };
  const onPanState = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.BEGAN) onSelect?.();
    if (e.nativeEvent.oldState === State.ACTIVE) {
      last.current.x += e.nativeEvent.translationX;
      last.current.y += e.nativeEvent.translationY;
      commit();
    }
  };

  const onPinch = (e: any) => {
    scaleA.setValue(clamp(last.current.scale * e.nativeEvent.scale, 0.2, 8));
  };
  const onPinchState = (e: PinchGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.BEGAN) onSelect?.();
    if (e.nativeEvent.oldState === State.ACTIVE) {
      last.current.scale = clamp(last.current.scale * e.nativeEvent.scale, 0.2, 8);
      commit();
    }
  };

  const onRot = (e: any) => {
    rotA.setValue(last.current.rot + (e.nativeEvent.rotation * 180) / Math.PI);
  };
  const onRotState = (e: RotationGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      last.current.rot += (e.nativeEvent.rotation * 180) / Math.PI;
      commit();
    }
  };

  const rotate = rotA.interpolate({ inputRange: [-720, 720], outputRange: ['-720deg', '720deg'] });
  const innerFill = fill ? styles.fill : undefined;

  return (
    <PanGestureHandler
      ref={panRef}
      minPointers={panMinPointers}
      maxPointers={2}
      simultaneousHandlers={[pinchRef, rotRef]}
      onGestureEvent={onPan}
      onHandlerStateChange={onPanState}
    >
      <Animated.View style={[style, { transform: [{ translateX: transX }, { translateY: transY }, { scale: scaleA }, { rotate }] }]}>
        <PinchGestureHandler
          ref={pinchRef}
          simultaneousHandlers={[panRef, rotRef]}
          onGestureEvent={onPinch}
          onHandlerStateChange={onPinchState}
        >
          <Animated.View style={innerFill}>
            <RotationGestureHandler
              ref={rotRef}
              simultaneousHandlers={[panRef, pinchRef]}
              onGestureEvent={onRot}
              onHandlerStateChange={onRotState}
            >
              <Animated.View style={innerFill}>
                {children}
              </Animated.View>
            </RotationGestureHandler>
          </Animated.View>
        </PinchGestureHandler>
      </Animated.View>
    </PanGestureHandler>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
