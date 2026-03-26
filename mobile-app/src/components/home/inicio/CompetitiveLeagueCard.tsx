import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { DASH, dash } from './dash';
import { androidReadableText } from './textStyles';

const AMBER = '#f59e0b';
const AMBER_DARK = '#451a03';

type Props = {
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <View style={styles.radial} />
      <View style={styles.inner}>
        <View style={styles.headerRow}>
          <View style={styles.left}>
            <LinearGradient
              colors={[AMBER_DARK, AMBER]}
              style={styles.medalBox}
            >
              <Text style={styles.medalEmoji}>🏅</Text>
            </LinearGradient>
            <View style={styles.titleBlock}>
              <View style={styles.titleLine}>
                <Text style={styles.title}>Liga Competitiva</Text>
                <View style={styles.badge2v2}>
                  <Text style={styles.badge2v2Text}>
                    {modeLabel != null && String(modeLabel).trim() !== ''
                      ? modeLabel
                      : '2v2'}
                  </Text>
                </View>
              </View>
              <Text style={styles.sub}>Partidos rankeados por parejas</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#6b7280" />
        </View>

        <View style={styles.midRow}>
          <View>
            <Text style={styles.smallCap}>Tu división</Text>
            <Text style={[styles.division, { color: AMBER }]}>
              {dash(divisionName)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.smallCap}>League Points</Text>
            <Text style={styles.lp}>{dash(leaguePoints)}</Text>
          </View>
        </View>

        <View style={styles.barTrack}>
          <LinearGradient
            colors={[AMBER_DARK, AMBER]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.barFill, { width: `${pct}%` }]}
          />
        </View>

        <View style={styles.footer}>
          <View style={styles.footerStats}>
            <View style={styles.stat}>
              <Ionicons
                name="trending-up"
                size={Platform.OS === 'android' ? 14 : 16}
                color="#34d399"
              />
              <Text style={styles.statText}>{dash(winsLabel)}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons
                name="trending-down"
                size={Platform.OS === 'android' ? 14 : 16}
                color="#f87171"
              />
              <Text style={styles.statText}>{dash(lossesLabel)}</Text>
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
              numberOfLines={Platform.OS === 'android' ? 2 : 1}
              style={[
                Platform.OS === 'ios' ? styles.footerHint : styles.footerHintAndroid,
              ]}
            >
              Toca para jugar ranked
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
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
  pressed: { opacity: 0.95 },
  radial: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.2,
    backgroundColor: 'transparent',
  },
  inner: {
    paddingVertical: 20,
    paddingHorizontal: Platform.select({ ios: 20, android: 14 }),
    backgroundColor: 'rgba(69,26,3,0.35)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  medalBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: AMBER,
  },
  medalEmoji: { fontSize: 22 },
  titleBlock: { flex: 1, minWidth: 0 },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  title: androidReadableText({ fontSize: 16, fontWeight: '900', color: '#fff' }),
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
  sub: androidReadableText({ fontSize: 12, color: '#9ca3af' }),
  midRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  smallCap: androidReadableText({
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  }),
  division: androidReadableText({ fontSize: 18, fontWeight: '900' }),
  lp: androidReadableText({ fontSize: 18, fontWeight: '900', color: '#fff' }),
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
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
  footerHint: androidReadableText({
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'right',
  }),
  /**
   * Sin androidReadableText: el paddingVertical extra ensancha el layout y recorta en Android.
   * Hasta 2 líneas si hace falta; tipografía un poco más compacta.
   */
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
