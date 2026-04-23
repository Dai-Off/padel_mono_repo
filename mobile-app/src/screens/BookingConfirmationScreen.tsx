import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BookingSuccessRadialBg } from '../components/partido/BookingSuccessRadialBg';
import { useSlotPrice } from '../hooks/useSlotPrice';

const ORANGE = '#F18F34';
const ORANGE_END = '#C46A20';
const BLUE = '#3B82F6';

export type BookingConfirmationData = {
  courtName: string;
  clubName: string;
  dateTimeFormatted: string;
  duration: string;
  priceFormatted: string;
  /** Público: pantalla «unirse»; privado: confirmación de reserva (detalle + email). */
  matchVisibility: 'public' | 'private';
  /** Solo público: sustituye la línea bajo el CTA. */
  playersLine?: string;
  /** Modal de club / torneo: badge «Partido» vs «Torneo». */
  confirmationKind?: 'match' | 'tournament';
  /** Ej. «15/16» en inscripción a torneo. */
  spotsLine?: string;
  // Props para consumo de precio dinámico
  clubId?: string;
  courtId?: string;
  date?: string;
  slot?: string;
  durationMinutes?: number;
};

type Props = {
  data: BookingConfirmationData;
  onClose: () => void;
};

function resolvePlayersHint(data: BookingConfirmationData): string {
  if (data.playersLine != null && data.playersLine.trim() !== '') {
    return data.playersLine;
  }
  return '1 de 4 jugadores\u00A0confirmados';
}

function androidLabel(base: TextStyle): TextStyle {
  if (Platform.OS !== 'android') return base;
  return {
    ...base,
    includeFontPadding: false,
    textBreakStrategy: 'simple',
  } as TextStyle;
}

function splitDateTime(raw: string): { date: string; time: string } {
  const parts = raw.split(' · ');
  if (parts.length >= 2) {
    return { date: parts[0]?.trim() ?? raw, time: parts[1]?.trim() ?? '' };
  }
  return { date: raw.trim(), time: '' };
}

function AvatarSlot({
  initials,
  gradientColors,
  level,
}: {
  initials: string;
  gradientColors: [string, string];
  level: string;
}) {
  return (
    <View style={styles.avatarCol}>
      <View style={styles.avatarRing}>
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarCircle}>
          <Text style={[styles.avatarInitials, androidLabel({})]}>{initials}</Text>
        </LinearGradient>
        <View style={styles.levelBadge}>
          <LinearGradient
            colors={['#FBBF24', '#F59E0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.levelBadgeInner}
          >
            <Text style={[styles.levelBadgeText, androidLabel({})]}>{level}</Text>
          </LinearGradient>
        </View>
      </View>
    </View>
  );
}

function EmptySlot({ small }: { small?: boolean }) {
  return (
    <View style={[styles.avatarCol, small && styles.avatarColSm]}>
      <View style={[styles.emptyCircle, small && styles.emptyCircleSm]}>
        <Ionicons name="add" size={small ? 12 : 16} color="rgba(255,255,255,0.35)" />
      </View>
    </View>
  );
}

/** Partido público / unirse: «¡TE HAS UNIDO!» + equipos + meta + CTA. */
function PublicMatchJoinedConfirmation({ data, onClose }: Props) {
  const { date: datePart, time: timePart } = splitDateTime(data.dateTimeFormatted);
  const playersLine = resolvePlayersHint(data);

  const { priceData, loading } = useSlotPrice({
    clubId: data.clubId,
    courtId: data.courtId,
    date: data.date,
    slot: data.slot,
    durationMinutes: data.durationMinutes,
  });

  const renderPrice = () => {
    if (loading) return ' · Calculando precio...';
    if (priceData) {
      if (priceData.source === 'none') {
        return ' · Precio no disponible, contacta al club.';
      }
      return ` · ${(priceData.total_price_cents / 100).toFixed(2)} €`;
    }
    return data.priceFormatted ? ` · ${data.priceFormatted}` : '';
  };

  return (
    <View style={styles.column}>
      <View style={styles.pill}>
        <Ionicons name="trophy" size={14} color="#FACC15" />
        <Text style={[styles.pillText, androidLabel({})]} numberOfLines={1}>
          ¡TE HAS UNIDO!
        </Text>
        <Ionicons name="trophy" size={14} color="#FACC15" />
      </View>

      <View style={styles.cardOuter}>
        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.cardBorder} />

        <View style={styles.topBar}>
          <LinearGradient
            colors={[ORANGE, 'rgba(241,143,52,0.35)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topBarHalf}
          />
          <LinearGradient
            colors={['rgba(59,130,246,0.35)', BLUE]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topBarHalf}
          />
        </View>

        <View style={styles.cardInner}>
          <View style={styles.teamsRow}>
            <View style={styles.teamCol}>
              <Text style={[styles.teamLabelA, androidLabel({})]}>Equipo A</Text>
              <View style={styles.teamAvatars}>
                <AvatarSlot initials="TÚ" gradientColors={[ORANGE, ORANGE_END]} level="1.0" />
              </View>
            </View>

            <View style={styles.vsWrap}>
              <View style={styles.vsGlow} />
              <LinearGradient colors={['#1A1A1A', '#0A0A0A']} style={styles.vsCircle}>
                <Text style={[styles.vsText, androidLabel({})]}>VS</Text>
              </LinearGradient>
            </View>

            <View style={styles.teamCol}>
              <Text style={[styles.teamLabelB, androidLabel({})]}>Equipo B</Text>
              <View style={styles.teamAvatars}>
                <EmptySlot small />
                <EmptySlot small />
              </View>
            </View>
          </View>
        </View>

        <LinearGradient
          colors={['rgba(227,30,36,0.15)', 'rgba(255,255,255,0.06)', 'rgba(59,130,246,0.15)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.divider}
        />

        <View style={styles.metaBlock}>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="flash" size={12} color={ORANGE} />
              <Text style={[styles.metaStrong, androidLabel({})]}>Pádel</Text>
            </View>
          </View>
          <View style={styles.metaClubRow}>
            <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.4)" style={styles.metaClubIcon} />
            <Text style={[styles.metaSoft, androidLabel({})]}>{data.clubName}</Text>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.35)" />
              <Text style={[styles.metaMuted, androidLabel({})]}>{datePart}</Text>
            </View>
            <Text style={styles.metaDotDim}>·</Text>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.35)" />
              <Text style={[styles.metaMuted, androidLabel({})]}>{timePart || '—'}</Text>
            </View>
          </View>
          <Text style={[styles.courtHint, androidLabel({})]}>
            {data.courtName}
            {data.duration ? ` · ${data.duration}` : ''}
            {renderPrice()}
          </Text>
        </View>
      </View>

      <View style={styles.ctaBlock}>
        <Pressable onPress={onClose} style={({ pressed }) => [pressed && styles.pressed]}>
          <LinearGradient colors={[ORANGE, ORANGE_END]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctaGradient}>
            <Ionicons name="flash" size={18} color="#fff" />
            <Text style={[styles.ctaLabel, androidLabel({})]}>¡Vamos a jugar!</Text>
          </LinearGradient>
        </Pressable>
        <Text style={[styles.playersHint, androidLabel({})]}>{playersLine}</Text>
      </View>
    </View>
  );
}

/** Solo partido público / unirse (pantalla completa). La reserva privada usa `PrivateReservationModal`. */
export function BookingConfirmationScreen({ data, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  return (
    <View style={styles.root}>
      <View style={styles.radialLayer} pointerEvents="none">
        <BookingSuccessRadialBg width={winW} height={winH} />
      </View>

      <Pressable
        onPress={onClose}
        style={[styles.closeBtn, { top: insets.top + 8, right: 16 }]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
      >
        <Ionicons name="close" size={22} color="rgba(255,255,255,0.85)" />
      </Pressable>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            minHeight: winH,
            justifyContent: 'center',
            paddingTop: insets.top + 8,
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        <PublicMatchJoinedConfirmation data={data} onClose={onClose} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  radialLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  closeBtn: {
    position: 'absolute',
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  column: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    flexShrink: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 20,
    flexShrink: 0,
    maxWidth: '100%',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  cardOuter: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    zIndex: 2,
    pointerEvents: 'none',
  },
  topBar: {
    flexDirection: 'row',
    height: 3,
    width: '100%',
  },
  topBarHalf: {
    flex: 1,
  },
  cardInner: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  teamCol: {
    flex: 1,
    minWidth: 0,
  },
  teamLabelA: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(241,143,52,0.7)',
    textAlign: 'center',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  teamLabelB: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(96,165,250,0.85)',
    textAlign: 'center',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  teamAvatars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  avatarCol: {
    alignItems: 'center',
    width: 52,
  },
  avatarColSm: {
    width: 40,
  },
  avatarRing: {
    position: 'relative',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 13,
    fontWeight: '900',
    color: '#fff',
  },
  levelBadge: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
  },
  levelBadgeInner: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  levelBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#1A1A1A',
  },
  emptyCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  emptyCircleSm: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  vsWrap: {
    width: 56,
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 28,
  },
  vsGlow: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(227,30,36,0.12)',
    opacity: 0.6,
  },
  vsCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  vsText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
    opacity: 0.95,
  },
  metaBlock: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    width: '100%',
  },
  metaClubRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingHorizontal: 4,
  },
  metaClubIcon: {
    marginTop: Platform.OS === 'android' ? 2 : 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
    paddingHorizontal: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    flexShrink: 1,
  },
  metaStrong: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  metaSoft: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    flex: 1,
    flexShrink: 1,
    textAlign: 'left',
  },
  metaMuted: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'capitalize',
    flexShrink: 1,
  },
  metaDotDim: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 11,
  },
  courtHint: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginTop: 4,
    width: '100%',
    alignSelf: 'center',
  },
  ctaBlock: {
    marginTop: 28,
    width: '100%',
    gap: 10,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(227,30,36,0.45)',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 14,
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  ctaLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  playersHint: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 8,
  },
  pressed: {
    opacity: 0.88,
  },
});
