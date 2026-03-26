import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import type { PartidoItem, PartidoPlayer } from '../../screens/PartidosScreen';

function PlayerSlot({
  player,
  isPrivate,
  surface = 'light',
}: {
  player: PartidoPlayer;
  isPrivate?: boolean;
  surface?: 'light' | 'dark';
}) {
  const d = surface === 'dark';
  if (player.isFree) {
    return (
      <View style={styles.playerSlot}>
        <View
          style={[
            styles.playerAvatarFree,
            isPrivate && styles.playerAvatarFreePrivate,
            d && styles.playerAvatarFreeDark,
          ]}
        >
          <Text style={isPrivate ? styles.playerAvatarFreeDash : styles.playerAvatarFreePlus}>
            {isPrivate ? '—' : '+'}
          </Text>
        </View>
        <Text style={[styles.playerFreeLabel, isPrivate && styles.playerFreeLabelPrivate]}>
          Libre
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.playerSlot}>
      {player.avatar ? (
        <Image source={{ uri: player.avatar }} style={styles.playerAvatar} />
      ) : (
        <View style={styles.playerAvatarInitial}>
          <Text style={styles.playerInitialText}>{player.initial ?? player.name[0]}</Text>
        </View>
      )}
      <Text style={[styles.playerName, d && styles.playerNameDark]} numberOfLines={1}>
        {player.name}
      </Text>
      <View style={styles.levelBadge}>
        <Text style={styles.levelBadgeText}>{player.level}</Text>
      </View>
    </View>
  );
}

type PartidoCardProps = {
  item: PartidoItem;
  onPress: () => void;
  /** Lista sobre fondo oscuro (Mis partidos en Partidos). */
  surface?: 'light' | 'dark';
};

export function PartidoCard({
  item,
  onPress,
  surface = 'light',
}: PartidoCardProps) {
  const d = surface === 'dark';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        d && styles.cardDark,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardDateTime, d && styles.cardDateTimeDark]}>
          {item.dateTime}
        </Text>
        <View style={styles.cardBadgeWrap}>
          <View
            style={[
              styles.cardBadge,
              item.mode === 'competitivo' ? styles.cardBadgeCompetitivo : styles.cardBadgeAmistoso,
              d &&
                (item.mode === 'competitivo'
                  ? styles.cardBadgeCompetitivoOnDark
                  : styles.cardBadgeDark),
            ]}
          >
            <Text
              style={[
                styles.cardBadgeText,
                item.mode === 'competitivo' && styles.cardBadgeTextComp,
                d && item.mode !== 'competitivo' && styles.cardBadgeTextDark,
              ]}
            >
              {item.mode === 'competitivo' ? 'Competitivo' : 'Amistoso'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.cardMeta}>
        <View style={styles.cardMetaRow}>
          <Ionicons name="people-outline" size={12} color={d ? '#6b7280' : '#9ca3af'} />
          <Text style={[styles.cardMetaText, d && styles.cardMetaTextDark]}>
            {item.typeLabel}
          </Text>
        </View>
        <Text style={[styles.cardLevelRange, d && styles.cardLevelRangeDark]}>
          📊 {item.levelRange}
        </Text>
      </View>
      {item.visibility === 'private' ? (
        <View style={[styles.privateReservadoRow, d && styles.privateReservadoRowDark]}>
          <View style={styles.privateReservadoAvatar}>
            {(() => {
              const org = item.players.find((p) => !p.isFree);
              if (!org) return <Text style={styles.privateReservadoIcon}>✓</Text>;
              return org.avatar ? (
                <Image source={{ uri: org.avatar }} style={styles.privateReservadoImg} />
              ) : (
                <View style={styles.privateReservadoInitialWrap}>
                  <Text style={styles.privateReservadoInitial}>{org.initial ?? org.name[0] ?? '?'}</Text>
                </View>
              );
            })()}
          </View>
          <Text style={[styles.privateReservadoLabel, d && styles.privateReservadoLabelDark]}>
            Tu reserva
          </Text>
        </View>
      ) : (
        <View style={styles.playersRow}>
          {item.players.map((p, i) => (
            <PlayerSlot key={i} player={p} isPrivate={false} surface={surface} />
          ))}
        </View>
      )}
      <View style={[styles.venueRow, d && styles.venueRowDark]}>
        <View style={[styles.venueIconWrap, d && styles.venueIconWrapDark]}>
          <Text style={styles.venueEmoji}>🏢</Text>
        </View>
        <View style={styles.venueBody}>
          <Text style={[styles.venueName, d && styles.venueNameDark]} numberOfLines={1}>
            {item.venue}
          </Text>
          <Text style={[styles.venueLocation, d && styles.venueLocationDark]}>
            {item.location}
          </Text>
        </View>
        <View style={styles.venuePrice}>
          <Text style={[styles.venuePriceValue, d && styles.venuePriceValueDark]}>
            {item.price}
          </Text>
          <Text style={[styles.venueDuration, d && styles.venueDurationDark]}>
            {item.duration}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardDateTime: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  cardBadgeWrap: { flexDirection: 'row', gap: 6 },
  cardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cardBadgeAmistoso: { backgroundColor: '#f3f4f6' },
  cardBadgeCompetitivo: { backgroundColor: 'rgba(227,30,36,0.1)' },
  cardBadgeText: { fontSize: 10, fontWeight: '600', color: '#6b7280' },
  cardBadgeTextComp: { color: '#E31E24' },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaText: { fontSize: 10, color: '#6b7280' },
  cardLevelRange: { fontSize: 10, color: '#6b7280' },
  privateReservadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  privateReservadoAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(227,30,36,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateReservadoImg: { width: 36, height: 36, borderRadius: 10 },
  privateReservadoInitialWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateReservadoInitial: { fontSize: 12, fontWeight: '700', color: '#fff' },
  privateReservadoIcon: { fontSize: 16, fontWeight: '700', color: '#E31E24' },
  privateReservadoLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  playersRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: theme.spacing.md,
  },
  playerSlot: { alignItems: 'center', minWidth: 44 },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginBottom: 4,
  },
  playerAvatarInitial: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  playerInitialText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  playerAvatarFree: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  playerAvatarFreePlus: { fontSize: 18, color: '#d1d5db' },
  playerAvatarFreePrivate: { opacity: 0.7 },
  playerAvatarFreeDash: { fontSize: 16, color: '#9ca3af', fontWeight: '300' },
  playerFreeLabel: { fontSize: 9, fontWeight: '600', color: '#E31E24' },
  playerFreeLabelPrivate: { color: '#9ca3af' },
  playerName: { fontSize: 9, fontWeight: '600', color: '#1A1A1A', maxWidth: 50, textAlign: 'center' },
  levelBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#fef08a', marginTop: 2 },
  levelBadgeText: { fontSize: 9, fontWeight: '700', color: '#1A1A1A' },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  venueIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueEmoji: { fontSize: 16 },
  venueBody: { flex: 1, minWidth: 0 },
  venueName: { fontSize: 12, fontWeight: '700', color: '#1A1A1A' },
  venueLocation: { fontSize: 10, color: '#9ca3af' },
  venuePrice: { alignItems: 'flex-end' },
  venuePriceValue: { fontSize: theme.fontSize.base, fontWeight: '700', color: '#E31E24' },
  venueDuration: { fontSize: 10, color: '#9ca3af' },
  pressed: { opacity: 0.9 },
  cardDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardDateTimeDark: { color: '#fff' },
  cardBadgeDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardBadgeCompetitivoOnDark: {
    backgroundColor: 'rgba(227,30,36,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(227,30,36,0.35)',
  },
  cardBadgeTextDark: { color: '#d1d5db' },
  cardMetaTextDark: { color: '#9ca3af' },
  cardLevelRangeDark: { color: '#9ca3af' },
  privateReservadoRowDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  privateReservadoLabelDark: { color: '#d1d5db' },
  venueRowDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  venueIconWrapDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  venueNameDark: { color: '#fff' },
  venueLocationDark: { color: '#9ca3af' },
  venuePriceValueDark: { color: '#fb923c' },
  venueDurationDark: { color: '#9ca3af' },
  playerNameDark: { color: '#e5e7eb' },
  playerAvatarFreeDark: {
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
