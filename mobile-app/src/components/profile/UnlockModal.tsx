import React, { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  cancelAnimation,
  interpolate,
  Extrapolation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { RARITY_CONFIG } from '../../design/rarity';
import type { PendingUnlock } from '../../api/unlockables';

const KIND_LABEL: Record<PendingUnlock['kind'], string> = {
  trophy: '¡Nuevo trofeo!',
  badge: '¡Nueva insignia!',
  course: '¡Curso completado!',
  title: '¡Nuevo título!',
  frame: '¡Nuevo marco!',
};

const SPARKLE_COUNT = 8;
const SPARKLE_ANGLES = Array.from({ length: SPARKLE_COUNT }, (_, i) => (i * Math.PI * 2) / SPARKLE_COUNT);

// ─── Destello individual que estalla hacia afuera ───
function Sparkle({ angle, color, burst }: { angle: number; color: string; burst: SharedValue<number> }) {
  const R = 58;
  const style = useAnimatedStyle(() => {
    const d = burst.value;
    const p = Math.min(d / 0.55, 1); // recorrido hacia afuera durante el primer 55%
    const opacity = interpolate(d, [0, 0.08, 0.55, 0.6], [0, 1, 0, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [
        { translateX: Math.cos(angle) * R * p },
        { translateY: Math.sin(angle) * R * p },
        { scale: 0.4 + p * 0.9 },
      ],
    };
  });
  return <Animated.View style={[styles.sparkle, { backgroundColor: color }, style]} />;
}

interface UnlockModalProps {
  unlock: PendingUnlock;
  /** Omitir: cierra y marca como visto. */
  onClose: () => void;
  /** Ir a mi vitrina: marca como visto y navega a la Vitrina. */
  onGoToVitrina: () => void;
}

/** Modal global de "¡Desbloqueado!" con entrada de celebración (sin rebote jelly). */
export const UnlockModal: React.FC<UnlockModalProps> = ({ unlock, onClose, onGoToVitrina }) => {
  const conf = RARITY_CONFIG[unlock.rarity];

  const enter = useSharedValue(0); // tarjeta: escala + opacidad
  const pop = useSharedValue(0); // icono: pop con leve overshoot
  const ring = useSharedValue(0); // anillo expansivo (pulso)
  const burst = useSharedValue(0); // destellos

  useEffect(() => {
    enter.value = 0;
    pop.value = 0;
    ring.value = 0;
    burst.value = 0;

    enter.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    pop.value = withDelay(60, withTiming(1, { duration: 460, easing: Easing.out(Easing.back(1.5)) }));
    ring.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.out(Easing.ease) }), -1, false);
    burst.value = withDelay(120, withRepeat(withTiming(1, { duration: 1900, easing: Easing.out(Easing.cubic) }), -1, false));

    return () => {
      cancelAnimation(enter);
      cancelAnimation(pop);
      cancelAnimation(ring);
      cancelAnimation(burst);
    };
  }, [unlock.id, enter, pop, ring, burst]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.94 + Math.min(enter.value, 1) * 0.06 }],
  }));
  const popStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pop.value, [0, 0.5], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: pop.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.15, 1], [0, 0.45, 0], Extrapolation.CLAMP),
    transform: [{ scale: 0.7 + ring.value * 1.05 }],
  }));

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar" />
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.kicker}>✦ {KIND_LABEL[unlock.kind] ?? '¡Desbloqueado!'} ✦</Text>

          {/* Zona del icono con celebración */}
          <View style={styles.iconArea}>
            <Animated.View style={[styles.ring, { borderColor: conf.color }, ringStyle]} pointerEvents="none" />
            {SPARKLE_ANGLES.map((a, i) => (
              <Sparkle key={i} angle={a} color={conf.color} burst={burst} />
            ))}
            <Animated.View style={[styles.iconBox, { backgroundColor: conf.bg, borderColor: conf.border }, popStyle]}>
              <Ionicons name={(unlock.icon ?? 'trophy-outline') as keyof typeof Ionicons.glyphMap} size={44} color={conf.color} />
            </Animated.View>
          </View>

          <Text style={styles.title}>{unlock.title}</Text>
          {unlock.description ? <Text style={styles.desc}>{unlock.description}</Text> : null}

          <View style={[styles.rarityChip, { backgroundColor: conf.bg, borderColor: conf.border }]}>
            <Text style={[styles.rarityText, { color: conf.color }]}>
              {conf.symbol ? `${conf.symbol} ` : ''}
              {conf.label.toUpperCase()}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.btnGhost} onPress={onClose}>
              <Text style={styles.btnGhostText}>Omitir</Text>
            </Pressable>
            <Pressable style={styles.btnPrimary} onPress={onGoToVitrina}>
              <Text style={styles.btnPrimaryText}>Ir a mi vitrina</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const ICON_AREA = 120;
const ICON_BOX = 88;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 24,
    alignItems: 'center',
  },
  kicker: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#F18F34',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  iconArea: {
    width: ICON_AREA,
    height: ICON_AREA,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  ring: {
    position: 'absolute',
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: 22,
    borderWidth: 2,
  },
  sparkle: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  iconBox: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
  },
  desc: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 12,
  },
  rarityChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 20,
  },
  rarityText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btnGhost: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  btnPrimary: {
    flex: 1.4,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F18F34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
