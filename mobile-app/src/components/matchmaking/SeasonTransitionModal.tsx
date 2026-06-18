import type { ComponentProps } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../../i18n';
import type { SeasonTransition } from '../../api/matchmaking';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Color/escudo por liga (no hay mapeo compartido en el repo). */
const LIGA_THEME: Record<string, { colors: [string, string]; label: string; icon: IoniconName }> = {
  bronce: { colors: ['#C0843E', '#7B4B23'], label: 'Bronce', icon: 'shield' },
  plata: { colors: ['#C7CED6', '#7E8A99'], label: 'Plata', icon: 'shield' },
  oro: { colors: ['#F0C04A', '#B8860B'], label: 'Oro', icon: 'shield' },
  elite: { colors: ['#9B6BF2', '#4C1D95'], label: 'Élite', icon: 'diamond' },
};
function ligaTheme(liga: string) {
  return LIGA_THEME[(liga ?? '').toLowerCase()] ?? LIGA_THEME.bronce;
}

type Props = {
  visible: boolean;
  transition: SeasonTransition | null;
  onClose: () => void;
};

/**
 * Modal animado de fin de temporada, en dos pasos:
 *  1) "Fin de temporada · {temporada} · Quedaste en {liga}" (liga con la que cerró)
 *  2) "Nueva temporada · {temporada} · Tu liga es {liga}" (liga tras el soft reset) + CTA
 */
export function SeasonTransitionModal({ visible, transition, onClose }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<0 | 1>(0);
  const anim = useRef(new Animated.Value(0)).current;
  const badgePulse = useRef(new Animated.Value(1)).current;

  const animateIn = useCallback(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  useEffect(() => {
    if (!visible) return;
    setStep(0);
    animateIn();
  }, [visible, animateIn]);

  // Avanzar del paso 1 (fin de temporada) al paso 2 (nueva temporada) con el botón.
  const goNext = useCallback(() => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setStep(1);
      animateIn();
    });
  }, [anim, animateIn]);

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, badgePulse]);

  if (!transition) return null;

  const isEnd = step === 0;
  const liga = isEnd ? transition.previous_liga : transition.new_liga;
  const theme = ligaTheme(liga);
  const seasonName = isEnd ? transition.previous_season_name : transition.new_season_name;
  const kicker = isEnd ? t('competitive.season.endKicker') : t('competitive.season.newKicker');
  const ligaLine = isEnd
    ? t('competitive.season.endedIn', { liga: theme.label })
    : t('competitive.season.newLiga', { liga: theme.label });

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.card, { opacity: anim, transform: [{ translateY }, { scale }] }]}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.season} numberOfLines={2}>
            {seasonName}
          </Text>

          <Animated.View style={[styles.badgeWrap, { transform: [{ scale: badgePulse }] }]}>
            <LinearGradient colors={theme.colors} style={styles.badge}>
              <Ionicons name={theme.icon} size={46} color="#fff" />
            </LinearGradient>
          </Animated.View>

          <Text style={styles.ligaLine} numberOfLines={2}>
            {ligaLine}
          </Text>

          <View style={styles.dots}>
            <View style={[styles.dot, isEnd && styles.dotActive]} />
            <View style={[styles.dot, !isEnd && styles.dotActive]} />
          </View>

          <Pressable style={styles.ctaWrap} onPress={isEnd ? goNext : onClose}>
            <LinearGradient colors={['#F18F34', '#E95F32']} style={styles.ctaGrad}>
              <Text style={styles.ctaText}>
                {isEnd ? t('competitive.season.next') : t('competitive.season.cta')}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { alignItems: 'center', width: '100%', maxWidth: 360 },
  kicker: {
    color: '#F18F34',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  season: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  badgeWrap: { marginVertical: 26 },
  badge: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 12,
  },
  ligaLine: { color: 'rgba(255,255,255,0.92)', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 8, marginTop: 22 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)' },
  dotActive: { backgroundColor: '#F18F34', width: 18 },
  ctaWrap: { marginTop: 28, borderRadius: 14, overflow: 'hidden', width: '100%' },
  ctaGrad: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
