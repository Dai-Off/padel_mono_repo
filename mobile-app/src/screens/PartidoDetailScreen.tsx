import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { fetchMatchById, joinMatch } from '../api/matches';
import { fetchMyPlayerId } from '../api/players';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { theme } from '../theme';
import type { PartidoItem } from './PartidosScreen';

type PartidoDetailScreenProps = {
  partido: PartidoItem;
  onBack: () => void;
};

function StatusDot({ color }: { color: string }) {
  return (
    <View style={[styles.statusDot, { backgroundColor: color }]} />
  );
}

export function PartidoDetailScreen({ partido: initialPartido, onBack }: PartidoDetailScreenProps) {
  const { session } = useAuth();
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [partido, setPartido] = useState<PartidoItem>(initialPartido);
  const [joiningSlotIndex, setJoiningSlotIndex] = useState<number | null>(null);

  useEffect(() => {
    if (session?.access_token) {
      fetchMyPlayerId(session.access_token).then(setCurrentPlayerId);
    } else {
      setCurrentPlayerId(null);
    }
  }, [session?.access_token]);

  const isInMatch = currentPlayerId != null && (partido.playerIds ?? []).includes(currentPlayerId);

  const handleJoin = useCallback(async (slotIndex: number) => {
    const token = session?.access_token;
    if (!token) {
      Alert.alert('Iniciar sesión', 'Necesitas iniciar sesión para unirte al partido.');
      return;
    }
    setJoiningSlotIndex(slotIndex);
    const result = await joinMatch(partido.id, token, slotIndex);
    setJoiningSlotIndex(null);
    if (!result.ok) {
      Alert.alert('Error', result.error ?? 'No se pudo unir al partido.');
      return;
    }
    const match = await fetchMatchById(partido.id, token);
    if (match) {
      const updated = mapMatchToPartido(match);
      if (updated) setPartido(updated);
    }
  }, [partido.id, session?.access_token]);

  const teamA = partido.players.slice(0, 2);
  const teamB = partido.players.slice(2, 4);
  const venueImage = partido.venueImage;
  const venueAddress = partido.venueAddress ?? partido.location;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={20} color="#1A1A1A" />
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
            <Ionicons name="share-social-outline" size={16} color="#1A1A1A" />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
            <Ionicons name="ellipsis-horizontal" size={16} color="#1A1A1A" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoCard}>
          <View style={styles.infoTop}>
            <View style={styles.sportIconWrap}>
              <Text style={styles.sportEmoji}>🎾</Text>
            </View>
            <View style={styles.infoTopBody}>
              <Text style={styles.sportTitle}>PÁDEL</Text>
              <Text style={styles.sportDate}>{partido.dateTime}</Text>
            </View>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>GÉNERO</Text>
              <Text style={styles.infoCellValue}>{partido.typeLabel}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>NIVEL</Text>
              <Text style={styles.infoCellValue}>{partido.levelRange}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>PRECIO</Text>
              <Text style={styles.infoCellValue}>{partido.price}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <StatusDot color="#9ca3af" />
            <Text style={styles.statusText}>Partido Abierto</Text>
          </View>
          <View style={styles.statusBadge}>
            <StatusDot color="#22c55e" />
            <Text style={styles.statusText}>Pista reservada</Text>
          </View>
        </View>

        <View style={styles.playersCard}>
          <Text style={styles.playersTitle}>Jugadores</Text>
          <View style={styles.teamsRow}>
            <View style={styles.teamColumn}>
              {teamA.map((p, i) => (
                <PlayerSlotDetail
                  key={i}
                  player={p}
                  onJoin={p.isFree && !isInMatch && (joiningSlotIndex == null || joiningSlotIndex === i) ? () => handleJoin(i) : undefined}
                  joining={joiningSlotIndex === i}
                />
              ))}
              <Text style={styles.teamLabel}>A</Text>
            </View>
            <Text style={styles.vsLabel}>VS</Text>
            <View style={styles.teamColumn}>
              {teamB.map((p, i) => {
                const slotIdx = i + 2;
                return (
                  <PlayerSlotDetail
                    key={i}
                    player={p}
                    onJoin={p.isFree && !isInMatch && (joiningSlotIndex == null || joiningSlotIndex === slotIdx) ? () => handleJoin(slotIdx) : undefined}
                    joining={joiningSlotIndex === slotIdx}
                  />
                );
              })}
              <Text style={styles.teamLabel}>B</Text>
            </View>
          </View>
        </View>

        <Pressable style={({ pressed }) => [styles.venueBtn, pressed && styles.pressed]}>
          {venueImage ? (
            <Image source={{ uri: venueImage }} style={styles.venueImage} />
          ) : (
            <View style={[styles.venueImage, styles.venueImagePlaceholder]} />
          )}
          <View style={styles.venueBody}>
            <Text style={styles.venueName}>{partido.venue}</Text>
            <Text style={styles.venueAddress} numberOfLines={1}>{venueAddress}</Text>
          </View>
          <View style={styles.venueMapBtn}>
            <Ionicons name="location" size={16} color="#fff" />
          </View>
        </Pressable>

        <Pressable style={({ pressed }) => [styles.chatBtn, pressed && styles.pressed]}>
          <Ionicons name="chatbubble-outline" size={18} color="#fff" />
          <Text style={styles.chatBtnText}>Chat del partido</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function PlayerSlotDetail({
  player,
  onJoin,
  joining,
}: {
  player: { name: string; avatar?: string; initial?: string; level: string; isFree: boolean };
  onJoin?: () => void;
  joining?: boolean;
}) {
  if (player.isFree) {
    return (
      <View style={styles.detailPlayerSlot}>
        <Pressable
          style={({ pressed }) => [styles.detailAvatarFree, pressed && styles.pressed]}
          onPress={onJoin}
          disabled={joining}
        >
          {joining ? (
            <ActivityIndicator size="small" color="#E31E24" />
          ) : (
            <Text style={styles.detailAvatarFreePlus}>+</Text>
          )}
        </Pressable>
        <Text style={styles.detailUnirseLabel}>{joining ? 'Uniendo...' : (onJoin ? 'Unirse' : 'Libre')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.detailPlayerSlot}>
      {player.avatar ? (
        <Image source={{ uri: player.avatar }} style={styles.detailAvatar} />
      ) : (
        <View style={styles.detailAvatarInitial}>
          <Text style={styles.detailInitialText}>{player.initial ?? player.name[0]}</Text>
        </View>
      )}
      <Text style={styles.detailPlayerName} numberOfLines={1}>{player.name}</Text>
      <View style={styles.detailLevelBadge}>
        <Text style={styles.detailLevelText}>{player.level}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    ...theme.headerPadding,
    backgroundColor: '#FAFAFA',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: { flexDirection: 'row', gap: 8 },
  pressed: { opacity: 0.9 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.scrollBottomPadding,
    gap: theme.spacing.md,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: theme.spacing.lg,
  },
  infoTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sportIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(227,30,36,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportEmoji: { fontSize: 24 },
  infoTopBody: { flex: 1 },
  sportTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  sportDate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  infoCell: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
  },
  infoCellLabel: {
    fontSize: 10,
    color: '#9ca3af',
    letterSpacing: 1,
    marginBottom: 2,
  },
  infoCellValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: { fontSize: 12, fontWeight: '500', color: '#6b7280' },
  playersCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: theme.spacing.lg,
  },
  playersTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: theme.spacing.md,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
  },
  teamLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#d1d5db',
    marginTop: 4,
  },
  vsLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e5e7eb',
    marginHorizontal: 8,
  },
  detailPlayerSlot: { alignItems: 'center' },
  detailAvatar: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginBottom: 6,
  },
  detailAvatarInitial: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  detailInitialText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  detailAvatarFree: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  detailAvatarFreePlus: { fontSize: 20, color: '#d1d5db' },
  detailUnirseLabel: { fontSize: 10, fontWeight: '600', color: '#E31E24' },
  detailPlayerName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1A1A1A',
    maxWidth: 60,
    textAlign: 'center',
  },
  detailLevelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#fef08a',
    marginTop: 2,
  },
  detailLevelText: { fontSize: 10, fontWeight: '700', color: '#1A1A1A' },
  venueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
    padding: theme.spacing.md,
  },
  venueImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  venueImagePlaceholder: {
    backgroundColor: '#e5e7eb',
  },
  venueBody: { flex: 1, marginLeft: 16, minWidth: 0 },
  venueName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  venueAddress: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  venueMapBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E31E24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
  },
  chatBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#fff',
  },
});
