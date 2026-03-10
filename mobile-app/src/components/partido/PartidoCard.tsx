import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import type { PartidoItem, PartidoPlayer } from '../../screens/PartidosScreen';

function PlayerSlot({ player }: { player: PartidoPlayer }) {
  if (player.isFree) {
    return (
      <View style={styles.playerSlot}>
        <View style={styles.playerAvatarFree}>
          <Text style={styles.playerAvatarFreePlus}>+</Text>
        </View>
        <Text style={styles.playerFreeLabel}>Libre</Text>
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
      <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
      <View style={styles.levelBadge}>
        <Text style={styles.levelBadgeText}>{player.level}</Text>
      </View>
    </View>
  );
}

type PartidoCardProps = {
  item: PartidoItem;
  onPress: () => void;
};

export function PartidoCard({ item, onPress }: PartidoCardProps) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardDateTime}>{item.dateTime}</Text>
        <View style={styles.cardBadgeWrap}>
          <View style={[styles.cardBadge, item.mode === 'competitivo' ? styles.cardBadgeCompetitivo : styles.cardBadgeAuto]}>
            <Text style={[styles.cardBadgeText, item.mode === 'competitivo' && styles.cardBadgeTextComp]}>
              {item.mode === 'competitivo' ? 'Competitivo' : 'Automático'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.cardMeta}>
        <View style={styles.cardMetaRow}>
          <Ionicons name="people-outline" size={12} color="#9ca3af" />
          <Text style={styles.cardMetaText}>{item.typeLabel}</Text>
        </View>
        <Text style={styles.cardLevelRange}>📊 {item.levelRange}</Text>
      </View>
      <View style={styles.playersRow}>
        {item.players.map((p, i) => (
          <PlayerSlot key={i} player={p} />
        ))}
      </View>
      <View style={styles.venueRow}>
        <View style={styles.venueIconWrap}>
          <Text style={styles.venueEmoji}>🏢</Text>
        </View>
        <View style={styles.venueBody}>
          <Text style={styles.venueName} numberOfLines={1}>{item.venue}</Text>
          <Text style={styles.venueLocation}>{item.location}</Text>
        </View>
        <View style={styles.venuePrice}>
          <Text style={styles.venuePriceValue}>{item.price}</Text>
          <Text style={styles.venueDuration}>{item.duration}</Text>
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
  cardBadgeAuto: { backgroundColor: '#f3f4f6' },
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
  playerFreeLabel: { fontSize: 9, fontWeight: '600', color: '#E31E24' },
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
});
