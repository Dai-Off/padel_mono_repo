import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { DASH, dash } from './dash';
import { androidReadableText } from './textStyles';
import { ScalePressable } from './ScalePressable';

const AMBER = '#f59e0b';
const AMBER_DARK = '#451a03';

/**
 * Como X7 `CompetitiveWidget`: capa `inset-0` con
 * `radial-gradient(ellipse at 30% 50%, rgba(245,158,11,0.3) 0%, transparent 70%)`
 * y opacidad animada 0.15↔0.25 en ~3s (no un círculo sólido en una esquina).
 */
function CompetitiveRadialPulse() {
  const gid = useId().replace(/:/g, '_');
  const gradId = `compGlow_${gid}`;
  const opacity = useRef(new Animated.Value(0.15)).current;
  useEffect(() => {
    let alive = true;
    const half = 1500;
    const run = () => {
      if (!alive) return;
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.15,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && alive) run();
      });
    };
    run();
    return () => {
      alive = false;
      opacity.stopAnimation();
    };
  }, [opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity }]}
      collapsable={false}
    >
      <Svg width="100%" height="100%" pointerEvents="none">
        <Defs>
          <RadialGradient
            id={gradId}
            cx="30%"
            cy="50%"
            rx="78%"
            ry="92%"
            fx="30%"
            fy="50%"
          >
            <Stop offset="0%" stopColor="rgb(245,158,11)" stopOpacity={0.3} />
            <Stop offset="70%" stopColor="rgb(245,158,11)" stopOpacity={0} />
            <Stop offset="100%" stopColor="rgb(15,15,15)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
      </Svg>
    </Animated.View>
  );
}

type Props = {
  /** Misma altura que `CompetitiveWidget` en el carrusel X7 (160px). */
  compact?: boolean;
  divisionName?: string | null;
  leaguePoints?: string | null;
  /** 0–100 para la barra; sin dato → 0. */
  ladderProgressPercent?: number | null;
  winsLabel?: string | null;
  lossesLabel?: string | null;
  modeLabel?: string | null;
  onPress?: () => void;
};

export function CompetitiveLeagueHomeCard({
  compact = false,
  divisionName,
  leaguePoints,
  ladderProgressPercent,
  winsLabel,
  lossesLabel,
  modeLabel,
  onPress,
}: Props) {
  const pct =
    ladderProgressPercent != null &&
    !Number.isNaN(ladderProgressPercent) &&
    ladderProgressPercent >= 0
      ? Math.min(100, ladderProgressPercent)
      : 0;

  return (
    <ScalePressable
      onPress={onPress}
      pressedScale={compact ? 0.97 : 0.985}
      style={({ pressed }) => [
        styles.wrap,
        compact && styles.wrapCompact,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={['rgba(69,26,3,0.94)', 'rgba(42,16,5,0.9)', '#0f0f0f']}
        locations={[0, 0.42, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <CompetitiveRadialPulse />
      <View style={[styles.inner, compact && styles.innerCompact]}>
        <View style={[styles.headerRow, compact && styles.headerRowCompact]}>
          <View style={[styles.left, compact && styles.leftCompact]}>
            <LinearGradient
              colors={[AMBER_DARK, AMBER]}
              style={[styles.medalBox, compact && styles.medalBoxCompact]}
            >
              <Text style={[styles.medalEmoji, compact && styles.medalEmojiCompact]}>
                🏅
              </Text>
            </LinearGradient>
            <View style={styles.titleBlock}>
              <View style={[styles.titleLine, compact && styles.titleLineCompact]}>
                <Text style={[styles.title, compact && styles.titleCompact]}>
                  Liga Competitiva
                </Text>
                <View style={[styles.badge2v2, compact && styles.badge2v2Compact]}>
                  <Text style={[styles.badge2v2Text, compact && styles.badge2v2TextCompact]}>
                    {modeLabel != null && String(modeLabel).trim() !== ''
                      ? modeLabel
                      : '2v2'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.sub, compact && styles.subCompact]}>
                Partidos rankeados por parejas
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={compact ? 18 : 22} color="#6b7280" />
        </View>

        <View style={[styles.midRow, compact && styles.midRowCompact]}>
          <View>
            <Text style={[styles.smallCap, compact && styles.smallCapCompact]}>Tu división</Text>
            <Text style={[styles.division, compact && styles.divisionCompact, { color: AMBER }]}>
              {dash(divisionName)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.smallCap, compact && styles.smallCapCompact]}>League Points</Text>
            <Text style={[styles.lp, compact && styles.lpCompact]}>{dash(leaguePoints)}</Text>
          </View>
        </View>

        <View style={[styles.barTrack, compact && styles.barTrackCompact]}>
          <LinearGradient
            colors={[AMBER_DARK, AMBER]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.barFill, { width: `${pct}%` }]}
          />
        </View>

        <View style={[styles.footer, compact && styles.footerCompact]}>
          <View style={styles.footerStats}>
            <View style={styles.stat}>
              <Ionicons
                name="trending-up"
                size={compact ? 12 : Platform.OS === 'android' ? 14 : 16}
                color="#34d399"
              />
              <Text style={[styles.statText, compact && styles.statTextCompact]}>
                {dash(winsLabel)}
              </Text>
            </View>
            <View style={styles.stat}>
              <Ionicons
                name="trending-down"
                size={compact ? 12 : Platform.OS === 'android' ? 14 : 16}
                color="#f87171"
              />
              <Text style={[styles.statText, compact && styles.statTextCompact]}>
                {dash(lossesLabel)}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.footerHintWrap,
              Platform.OS === 'android' && styles.footerHintWrapAndroid,
            ]}
            collapsable={false}
          >
            <Text
              numberOfLines={compact ? 1 : Platform.OS === 'android' ? 2 : 1}
              style={[
                compact && styles.footerHintCompact,
                !compact && (Platform.OS === 'ios' ? styles.footerHint : styles.footerHintAndroid),
              ]}
            >
              Toca para jugar ranked
            </Text>
          </View>
        </View>
      </View>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.27)',
    backgroundColor: '#0f0f0f',
  },
  wrapCompact: {
    height: 160,
    maxHeight: 160,
  },
  pressed: { opacity: 0.95 },
  inner: {
    position: 'relative',
    zIndex: 1,
    paddingVertical: 20,
    paddingHorizontal: Platform.select({ ios: 20, android: 14 }),
    backgroundColor: 'transparent',
  },
  innerCompact: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flex: 1,
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerRowCompact: { marginBottom: 6 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  leftCompact: { gap: 8 },
  medalBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: AMBER,
  },
  medalBoxCompact: {
    width: 40,
    height: 40,
    borderRadius: 14,
  },
  medalEmoji: { fontSize: 22 },
  medalEmojiCompact: { fontSize: 18 },
  titleBlock: { flex: 1, minWidth: 0 },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  titleLineCompact: { marginBottom: 2, gap: 6 },
  title: androidReadableText({ fontSize: 16, fontWeight: '900', color: '#fff' }),
  titleCompact: androidReadableText({ fontSize: 14 }),
  badge2v2: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(245,158,11,0.13)',
  },
  badge2v2Text: androidReadableText({
    fontSize: 9,
    fontWeight: '900',
    color: AMBER,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  }),
  badge2v2Compact: { paddingHorizontal: 6, paddingVertical: 1 },
  badge2v2TextCompact: androidReadableText({ fontSize: 8 }),
  sub: androidReadableText({ fontSize: 12, color: '#9ca3af' }),
  subCompact: androidReadableText({ fontSize: 10 }),
  midRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  midRowCompact: { marginBottom: 6 },
  smallCap: androidReadableText({
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  }),
  smallCapCompact: androidReadableText({ fontSize: 9, marginBottom: 2 }),
  division: androidReadableText({ fontSize: 18, fontWeight: '900' }),
  divisionCompact: androidReadableText({ fontSize: 15 }),
  lp: androidReadableText({ fontSize: 18, fontWeight: '900', color: '#fff' }),
  lpCompact: androidReadableText({ fontSize: 15 }),
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  barTrackCompact: { height: 8, marginBottom: 0 },
  barFill: { height: '100%', borderRadius: 999 },
  /** Misma fila: stats + hint; en Android gaps más ajustados para dar sitio al texto. */
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: Platform.select({ ios: 8, android: 4 }),
  },
  footerCompact: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
  },
  footerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.select({ ios: 8, android: 4 }),
    flexShrink: 0,
  },
  footerHintWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  footerHintWrapAndroid: {
    paddingLeft: 2,
    paddingRight: 1,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.select({ ios: 6, android: 4 }),
  },
  statText: androidReadableText({ fontSize: 12, color: '#9ca3af' }),
  statTextCompact: androidReadableText({ fontSize: 10 }),
  footerHint: androidReadableText({
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'right',
  }),
  /**
   * Sin androidReadableText: el paddingVertical extra ensancha el layout y recorta en Android.
   * Hasta 2 líneas si hace falta; tipografía un poco más compacta.
   */
  footerHintCompact: androidReadableText({
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '500',
    color: '#6b7280',
    textAlign: 'right',
    includeFontPadding: false,
    flexShrink: 1,
  }),
  footerHintAndroid: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '500',
    color: '#6b7280',
    textAlign: 'right',
    includeFontPadding: false,
    flexShrink: 0,
    letterSpacing: -0.15,
    paddingVertical: 0,
  },
});
