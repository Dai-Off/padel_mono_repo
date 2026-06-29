import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { RARITY_CONFIG, type AchievementRarity } from '../../design/rarity';
import { getFrameStyle, frameGradient } from '../../design/frames';
import { normalizePlayerAvatarUrl } from '../../api/playerAvatar';

// Familias de animación (v1): rotación del degradado vs glow pulsante.
// El resto de animation_type se mapean a la más cercana; afinaremos por tipo luego.
const ROTATE_ANIMS = new Set(['rotate', 'orbit', 'warp', 'glitch']);

export interface FrameAttrs {
  rarity: AchievementRarity;
  style: string | null;
  animationType: string | null;
  colors: string[] | null;
}

interface AvatarWithFrameProps {
  initials: string;
  avatarUrl?: string | null;
  /** Tamaño del avatar interior (px). */
  size?: number;
  /** Atributos del marco equipado; null o style 'none' = sin marco. */
  frame?: FrameAttrs | null;
  /** Permite desactivar la animación (p.ej. en grids con muchos marcos). */
  animate?: boolean;
}

export const AvatarWithFrame: React.FC<AvatarWithFrameProps> = ({
  initials,
  avatarUrl,
  size = 80,
  frame,
  animate = true,
}) => {
  const noFrame = !frame || frame.style === 'none' || frame.style == null;
  const st = getFrameStyle(frame?.style);
  const grad = frameGradient(frame?.colors, frame?.rarity ?? 'common');
  const innerR = Math.round(size * 0.22);
  const pad = noFrame ? 0 : st.borderWidth + (st.double ? 4 : 0);
  const outer = size + pad * 2;
  const outerR = innerR + pad;

  const animType = frame?.animationType ?? null;
  const isRotate = animate && !noFrame && !!animType && ROTATE_ANIMS.has(animType);
  const isPulse = animate && !noFrame && !!animType && !ROTATE_ANIMS.has(animType);
  const hasGlow = !noFrame && (st.glow || isPulse);

  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(spin);
    cancelAnimation(pulse);
    if (isRotate) {
      spin.value = withRepeat(withTiming(1, { duration: 5000, easing: Easing.linear }), -1, false);
    }
    if (isPulse) {
      pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, true);
    }
    return () => {
      cancelAnimation(spin);
      cancelAnimation(pulse);
    };
  }, [isRotate, isPulse, spin, pulse]);

  const gradStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: isPulse ? interpolate(pulse.value, [0, 1], [0.35, 0.7]) : 0.45,
    transform: [{ scale: isPulse ? interpolate(pulse.value, [0, 1], [1, 1.12]) : 1 }],
  }));

  // Tile interior reutilizable (foto o iniciales sobre degradado naranja).
  const uri = normalizePlayerAvatarUrl(avatarUrl);
  const tile = (
    <View style={[styles.tile, { width: size, height: size, borderRadius: innerR }]}>
      <LinearGradient
        colors={['#F18F34', '#E95F32']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.tileFill, { borderRadius: innerR }]}
      >
        <Text style={[styles.initials, { fontSize: Math.round(size * 0.3) }]}>{(initials || '?').slice(0, 2).toUpperCase()}</Text>
      </LinearGradient>
      {uri ? (
        <Image source={{ uri }} style={[styles.photo, { width: size, height: size, borderRadius: innerR }]} resizeMode="cover" />
      ) : null}
    </View>
  );

  if (noFrame) return tile;

  // Capa de degradado más grande que el contenedor, para que la rotación no
  // descubra los bordes (clip en el contenedor).
  const gradSize = outer * 1.7;

  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      {hasGlow ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            { width: outer + 12, height: outer + 12, borderRadius: outerR + 6, backgroundColor: grad[0] },
            haloStyle,
          ]}
        />
      ) : null}

      <View style={[styles.ringClip, { width: outer, height: outer, borderRadius: outerR }]}>
        <Animated.View style={[styles.gradLayer, { width: gradSize, height: gradSize, left: (outer - gradSize) / 2, top: (outer - gradSize) / 2 }, isRotate ? gradStyle : undefined]}>
          <LinearGradient
            colors={grad as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={st.bevel ? { x: 1, y: 0 } : { x: 1, y: 1 }}
            style={{ width: gradSize, height: gradSize }}
          />
        </Animated.View>
        {/* Tile con borde oscuro fino para sugerir el gap del doble anillo */}
        <View style={st.double ? { borderWidth: 2, borderColor: '#141414', borderRadius: innerR + 2 } : undefined}>
          {tile}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    overflow: 'hidden',
  },
  tileFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontWeight: '700',
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  halo: {
    position: 'absolute',
  },
  ringClip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradLayer: {
    position: 'absolute',
  },
});
