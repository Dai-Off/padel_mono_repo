import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { fetchMatches } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyPlayerId } from '../api/players';
import { CrearPartidoLocationSheet } from '../components/partido/CrearPartidoLocationSheet';
import { theme } from '../theme';

export type PartidoMode = 'automático' | 'competitivo';
export type PartidoPlayer = {
  name: string;
  avatar?: string;
  initial?: string;
  level: string;
  isFree: boolean;
};
export type PartidoItem = {
  id: string;
  dateTime: string;
  mode: PartidoMode;
  typeLabel: string;
  levelRange: string;
  players: PartidoPlayer[];
  /** IDs de jugadores ya en el partido (para ocultar Unirse al organizador/jugadores) */
  playerIds?: string[];
  venue: string;
  location: string;
  price: string;
  duration: string;
  venueImage?: string;
  venueAddress?: string;
};

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

function PartidoCard({ item, onPress }: { item: PartidoItem; onPress: () => void }) {
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

type PartidosScreenProps = {
  onPartidoPress?: (partido: PartidoItem) => void;
  onCrearPartidoPress?: () => void;
};

export function PartidosScreen({ onPartidoPress, onCrearPartidoPress }: PartidosScreenProps) {
  const { session } = useAuth();
  const [organizerPlayerId, setOrganizerPlayerId] = useState<string | null>(null);
  const [locationSheetVisible, setLocationSheetVisible] = useState(false);
  const [items, setItems] = useState<PartidoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.access_token) {
      fetchMyPlayerId(session.access_token).then((id) => setOrganizerPlayerId(id));
    } else {
      setOrganizerPlayerId(null);
    }
  }, [session?.access_token]);
  const loadPartidos = useCallback(async () => {
    setLoading(true);
    const matches = await fetchMatches({ expand: true });
    const partidos = matches.map(mapMatchToPartido).filter((p): p is PartidoItem => p != null);
    setItems(partidos);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPartidos();
  }, [loadPartidos]);

  return (
    <View style={styles.wrapper}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Partidos</Text>
        <Text style={styles.sectionSubtitle}>Partidos abiertos para unirte</Text>
      </View>

      <View style={styles.list}>
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Cargando partidos...</Text>
          </View>
        ) : items.length > 0 ? (
          items.map((item) => (
            <PartidoCard
              key={item.id}
              item={item}
              onPress={() => onPartidoPress?.(item)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No hay partidos disponibles</Text>
          </View>
        )}
      </View>
    </ScrollView>
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          pressed && styles.pressed,
        ]}
        onPress={() => {
          setLocationSheetVisible(true);
          onCrearPartidoPress?.();
        }}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabLabel}>Comenzar un partido</Text>
      </Pressable>

      <CrearPartidoLocationSheet
        visible={locationSheetVisible}
        organizerPlayerId={organizerPlayerId}
        onClose={() => {
          setLocationSheetVisible(false);
          loadPartidos();
        }}
        onSiguiente={() => {
          setLocationSheetVisible(false);
          loadPartidos();
        }}
        onPartidoCreado={loadPartidos}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  content: {
    paddingBottom: theme.scrollBottomPadding,
  },
  pressed: { opacity: 0.9 },
  section: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    gap: 12,
  },
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
  playerSlot: {
    alignItems: 'center',
    minWidth: 44,
  },
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
  playerInitialText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
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
  playerName: {
    fontSize: 9,
    fontWeight: '600',
    color: '#1A1A1A',
    maxWidth: 50,
    textAlign: 'center',
  },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#fef08a',
    marginTop: 2,
  },
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
  emptyState: { paddingVertical: theme.spacing.xxl, alignItems: 'center' },
  emptyText: { fontSize: theme.fontSize.sm, color: '#9ca3af' },
  fab: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    marginLeft: -120,
    width: 240,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#E31E24',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  fabIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  fabLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
