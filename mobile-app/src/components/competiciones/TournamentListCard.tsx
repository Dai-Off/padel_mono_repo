import { useMemo } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { PublicTournamentRow } from '../../api/tournaments';
import {
  clubLocationLabel,
  formatEloRange,
  formatFormatLabel,
  formatShortDateEs,
  formatTournamentInscriptionPrice,
  inferTournamentFormatKey,
  placeholderImageForId,
  tournamentTitle,
} from '../../domain/tournamentDisplay';
import { theme } from '../../theme';

const ACCENT = '#F18F34';

type TournamentListCardProps = {
  row: PublicTournamentRow;
  onPress?: () => void;
  userElo?: number | null;
  /**
   * Si true, dibuja un overlay de candado encima de la card para indicar que
   * la inscripción está bloqueada (típicamente: torneo competitivo + usuario
   * sin onboarding). La card sigue tappable para que pueda ver el detalle.
   */
  lockedByOnboarding?: boolean;
};

export function TournamentListCard({
  row,
  onPress,
  userElo,
  lockedByOnboarding = false,
}: TournamentListCardProps) {
  const title = tournamentTitle(row);
  const uri = placeholderImageForId(row.id);
  const formatKey = inferTournamentFormatKey(row.description);
  const formatLabel = formatFormatLabel(formatKey);
  const start = formatShortDateEs(row.start_at);
  const end = formatShortDateEs(row.end_at);
  const sameDay = start === end;
  const location = clubLocationLabel(row);
  const confirmed = row.confirmed_count ?? 0;
  const spotsLabel = `${confirmed}/${row.max_players}`;
  const priceLabel = formatTournamentInscriptionPrice(row.price_cents, row.currency ?? 'EUR');
  const registrationPair = row.registration_mode === 'pair';

  const eloMismatch = useMemo(() => {
    if (userElo == null) return false;
    const min = row.elo_min != null ? Number(row.elo_min) : null;
    const max = row.elo_max != null ? Number(row.elo_max) : null;
    if (min != null && userElo < min) return true;
    if (max != null && userElo > max) return true;
    return false;
  }, [userElo, row.elo_min, row.elo_max]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardOuter, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.03)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGradient}
      >
        <View style={styles.row}>
          <View style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
            <LinearGradient
              colors={['rgba(0,0,0,0.45)', 'transparent']}
              style={StyleSheet.absoluteFillObject}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
            />
            <View style={styles.priceBadge}>
              <Text style={styles.priceMain}>{priceLabel}</Text>
              <Text style={styles.priceSub}>
                {registrationPair ? '/equipo' : '/persona'}
              </Text>
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color="#737373" />
              <Text style={styles.metaStrong}>{start}</Text>
              {!sameDay ? (
                <>
                  <Text style={styles.dot}>•</Text>
                  <Text style={styles.metaSoft} numberOfLines={1}>
                    {end}
                  </Text>
                </>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color="#737373" />
              <Text style={styles.metaSoft} numberOfLines={1}>
                {location}
              </Text>
            </View>

            <View style={styles.chipsRow}>
              <View style={[styles.chip, styles.chipAccent]}>
                <Text style={styles.chipAccentText}>{formatLabel}</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipMutedText}>
                  📊 Nivel {formatEloRange(row.elo_min, row.elo_max)}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipMutedText}>👥 {spotsLabel}</Text>
              </View>
              {confirmed >= (row.max_players ?? 0) && (
                <View style={[styles.chip, styles.chipClosed]}>
                  <Text style={styles.chipClosedText}>CERRADO</Text>
                </View>
              )}
              {eloMismatch && (
                <View style={[styles.chip, styles.chipError]}>
                  <Text style={styles.chipErrorText}>Nivel no compatible</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Overlay candado: solo afecta a torneos competitivos cuando el
            usuario aún no ha completado el onboarding. El padre decide a qué
            cards aplicar esto. La card sigue tappable. */}
        {lockedByOnboarding && (
          <View pointerEvents="none" style={styles.lockOverlay}>
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={14} color="#FCD34D" />
              <Text style={styles.lockBadgeText}>Requiere nivel</Text>
            </View>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  pressed: { opacity: 0.92 },
  cardGradient: {
    borderRadius: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  thumbWrap: {
    width: 112,
    height: 112,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  priceBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  priceMain: {
    fontSize: theme.fontSize.xs,
    fontWeight: '900',
    color: '#fff',
  },
  priceSub: {
    fontSize: 9,
    color: '#d1d5db',
    fontWeight: '600',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
    lineHeight: theme.lineHeightFor(theme.fontSize.base),
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    minHeight: 18,
  },
  metaStrong: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#9ca3af',
  },
  metaSoft: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
  },
  dot: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.25)',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipAccent: {
    backgroundColor: 'rgba(241,143,52,0.2)',
    borderColor: 'rgba(241,143,52,0.3)',
  },
  chipAccentText: {
    fontSize: 9,
    fontWeight: '800',
    color: ACCENT,
    textTransform: 'uppercase',
  },
  chipMutedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#d1d5db',
    textTransform: 'uppercase',
  },
  chipClosed: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  chipClosedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F87171',
    textTransform: 'uppercase',
  },
  chipError: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  chipErrorText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F87171',
    textTransform: 'uppercase',
  },
  // Overlay translúcido encima de cards de torneos competitivos cuando el
  // usuario no tiene onboarding. Solo señalización visual: el tap sigue
  // funcionando para abrir el detalle (donde verá el banner sticky).
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 14,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: 10,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,15,15,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.45)',
  },
  lockBadgeText: {
    color: '#FCD34D',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
