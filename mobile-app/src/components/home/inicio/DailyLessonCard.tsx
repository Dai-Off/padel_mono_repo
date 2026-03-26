import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT } from './constants';
import { DASH, dash } from './dash';
import { androidReadableText } from './textStyles';

const WEEK_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

type Props = {
  /** Texto bonus (API); sin dato → `-`. */
  bonusText?: string | null;
  onPress?: () => void;
};

export function DailyLessonCard({ bonusText, onPress }: Props) {
  const bonus = dash(bonusText);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={['rgba(248,113,23,0.12)', 'rgba(223,30,36,0.22)', 'rgba(47,25,15,0.95)']}
        locations={[0, 0.4, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {Platform.OS === 'ios' ? (
        <BlurView intensity={24} tint="dark" style={[StyleSheet.absoluteFill, styles.blur]} />
      ) : null}
      <View style={styles.glassBorder} />
      <View
        style={[
          styles.inner,
          Platform.OS === 'android' && styles.innerAndroid,
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.iconCol}>
            <View style={styles.iconGlow} />
            <LinearGradient
              colors={['#f97316', ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconBox}
            >
              <Ionicons name="flame" size={28} color="#fff" />
            </LinearGradient>
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.title}>Lección diaria</Text>
            <Text style={styles.bonus}>
              Bonus: {bonus}
            </Text>
          </View>
        </View>

        <View style={styles.daysRow}>
          {WEEK_LABELS.map((label) => (
            <View key={label} style={styles.dayCol}>
              <Text style={styles.dayLabel}>{label}</Text>
              <View style={styles.dayCell}>
                <Text style={styles.dayPlaceholder}>{DASH}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footer} collapsable={false}>
          <View style={styles.ctaShell} collapsable={false}>
            <Text
              numberOfLines={1}
              textBreakStrategy={Platform.OS === 'android' ? 'simple' : undefined}
              style={[
                styles.cta,
                Platform.OS === 'android' ? styles.ctaAndroid : null,
              ]}
            >
              Empezar
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={ACCENT}
            style={styles.footerIcon}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 24,
    overflow: 'hidden',
    width: '100%',
  },
  pressed: { opacity: 0.95 },
  blur: { opacity: 0.85 },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  inner: { padding: 20, position: 'relative', zIndex: 2 },
  /** Más aire a la derecha: el borde redondeado + overflow:hidden recorta el trazo en Android. */
  innerAndroid: {
    paddingRight: 30,
    paddingLeft: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconCol: { position: 'relative' },
  iconGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(249,115,22,0.45)',
    left: -4,
    top: -4,
    opacity: 0.6,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: { flex: 1, marginLeft: 12, justifyContent: 'center', minWidth: 0 },
  title: androidReadableText({
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  }),
  bonus: androidReadableText({
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
  }),
  daysRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  dayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dayLabel: androidReadableText({
    fontSize: 9,
    fontWeight: '700',
    color: '#4b5563',
  }),
  dayCell: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPlaceholder: androidReadableText({
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
  }),
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    width: '100%',
  },
  /** Sin `gap`: en algunos builds Android el gap + flex-end mide mal el ancho del Text. */
  footerIcon: { marginLeft: 6 },
  ctaShell: {
    flexShrink: 0,
    flexGrow: 0,
  },
  cta: androidReadableText({
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT,
  }),
  /**
   * Sin paddingVertical extra (androidReadableText): reserva ancho real del glifo.
   * paddingRight: hueco antes del clip por overflow:hidden del card.
   */
  ctaAndroid: {
    includeFontPadding: false,
    paddingVertical: 0,
    paddingRight: 4,
    lineHeight: 20,
    flexShrink: 0,
  },
});
