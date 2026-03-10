import { useCallback, useEffect, useState } from 'react';
import {
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
import { PartidoCard } from '../components/partido/PartidoCard';
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
  courtName?: string;
  courtType?: string;
};

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
