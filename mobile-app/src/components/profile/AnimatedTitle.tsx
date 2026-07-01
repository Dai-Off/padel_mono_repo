import React, { useEffect } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { RARITY_CONFIG } from '../../design/rarity';
import { getTitleById } from '../../design/profileCatalog';

interface AnimatedTitleProps {
  /** Id del título equipado (del catálogo). Si es nulo/no existe, no renderiza. */
  titleId: string | null | undefined;
  style?: ViewStyle;
}

/**
 * Muestra el título equipado con el color de su rareza y un glow animado
 * (reanimated). Las rarezas rare/epic/legendary "respiran"; common es estático.
 */
export const AnimatedTitle: React.FC<AnimatedTitleProps> = ({ titleId, style }) => {
  const reward = getTitleById(titleId);
  const rarity = reward?.rarity ?? 'common';
  const animated = rarity !== 'common';

  const glow = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(glow);
    if (animated) {
      glow.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      glow.value = 0;
    }
    return () => cancelAnimation(glow);
  }, [animated, glow]);

  const textAnimStyle = useAnimatedStyle(() => ({
    textShadowRadius: 2 + glow.value * 10,
    opacity: animated ? 0.85 + glow.value * 0.15 : 1,
  }));

  if (!reward) return null;
  const conf = RARITY_CONFIG[rarity];

  return (
    <View style={[styles.row, style]}>
      <Animated.Text
        style={[styles.text, { color: conf.color, textShadowColor: conf.glow }, textAnimStyle]}
        numberOfLines={1}
      >
        {reward.title}
      </Animated.Text>
      {conf.symbol ? <Text style={[styles.symbol, { color: conf.color }]}>{conf.symbol}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    textShadowOffset: { width: 0, height: 0 },
  },
  symbol: {
    fontSize: 9,
    fontWeight: '900',
  },
});
