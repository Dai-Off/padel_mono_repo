import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  venue: string;
  location: string;
  price: string;
  duration: string;
  venueImage?: string;
  venueAddress?: string;
};

// TODO: reemplazar por datos de API (ej. usePartidos)
const MOCK_PARTIDOS: PartidoItem[] = [
  {
    id: '1',
    dateTime: 'lunes, 09 de febrero · 15:00',
    mode: 'automático',
    typeLabel: 'Todos los jugadores',
    levelRange: '0,25 - 1,25',
    players: [
      { name: 'Alvaro', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop', level: '0,5', isFree: false },
      { name: '', level: '', isFree: true },
      { name: '', level: '', isFree: true },
      { name: '', level: '', isFree: true },
    ],
    venue: 'Padel Family Indoor',
    location: '8km · Valdemoro',
    price: '7,99€',
    duration: '90min',
    venueImage: 'https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=400&h=300&fit=crop',
    venueAddress: 'Avenida de Madrid n°6 polígono industrial',
  },
  {
    id: '2',
    dateTime: 'lunes, 09 de febrero · 18:30',
    mode: 'competitivo',
    typeLabel: 'Mixto',
    levelRange: '0,41 - 1,41',
    players: [
      { name: 'Gema', initial: 'G', level: '0,7', isFree: false },
      { name: 'Inan Mac', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop', level: '0,9', isFree: false },
      { name: 'Adrian', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop', level: '0,7', isFree: false },
      { name: '', level: '', isFree: true },
    ],
    venue: 'Golden Pádel Club',
    location: '11km · Pinto',
    price: '11,23€',
    duration: '90min',
  },
  {
    id: '3',
    dateTime: 'martes, 10 de febrero · 10:00',
    mode: 'automático',
    typeLabel: 'Todos los jugadores',
    levelRange: '0,29 - 1,29',
    players: [
      { name: '', level: '', isFree: true },
      { name: '', level: '', isFree: true },
      { name: '', level: '', isFree: true },
      { name: '', level: '', isFree: true },
    ],
    venue: 'Pádel Indoor Plus',
    location: '5km · Madrid',
    price: '6,50€',
    duration: '90min',
  },
];

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
};

export function PartidosScreen({ onPartidoPress }: PartidosScreenProps) {
  const [sportFilter] = useState('Pádel');
  const [clubFilter] = useState('10 Clubs');
  const [dateFilter] = useState('Dom-Lun-Ma');

  const items = MOCK_PARTIDOS;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        style={styles.filterScrollView}
      >
        <Pressable style={({ pressed }) => [styles.filterBtn, pressed && styles.pressed]}>
          <Ionicons name="filter" size={16} color="#1A1A1A" />
        </Pressable>
        <Pressable style={({ pressed }) => [styles.filterPill, pressed && styles.pressed]}>
          <Text style={styles.filterPillText}>{sportFilter}</Text>
          <Ionicons name="chevron-down" size={14} color="#fff" />
        </Pressable>
        <Pressable style={({ pressed }) => [styles.filterPill, pressed && styles.pressed]}>
          <Text style={styles.filterPillText}>{clubFilter}</Text>
          <Ionicons name="chevron-down" size={14} color="#fff" />
        </Pressable>
        <Pressable style={({ pressed }) => [styles.filterPill, pressed && styles.pressed]}>
          <Text style={styles.filterPillText}>{dateFilter}</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Para tu nivel</Text>
        <Text style={styles.sectionSubtitle}>Estos partidos reflejan tu búsqueda y nivel</Text>
      </View>

      <View style={styles.list}>
        {items.length > 0 ? (
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  content: {
    paddingBottom: theme.scrollBottomPadding,
  },
  filterScrollView: { marginBottom: 0 },
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
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
});
