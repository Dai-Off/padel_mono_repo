import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { fetchMatches } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyPlayerId } from '../api/players';
import { PartidoCard } from '../components/partido/PartidoCard';
import { PartidoOpenCard } from '../components/partido/PartidoOpenCard';
import { PartidoOpenCardSkeleton } from '../components/partido/PartidoOpenCardSkeleton';
import { CrearPartidoLocationSheet } from '../components/partido/CrearPartidoLocationSheet';
import type { MatchListPhase } from '../domain/matchLifecycle';
import { lineHeightFor, theme } from '../theme';

export type PartidoMode = 'competitivo' | 'amistoso';
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
  /** Si es 'private', otros jugadores no pueden unirse */
  visibility?: 'public' | 'private';
  venue: string;
  location: string;
  price: string;
  duration: string;
  venueImage?: string;
  venueAddress?: string;
  courtName?: string;
  courtType?: string;
  /** upcoming = por jugar, live = en horario, past = ya jugado (no debería aparecer en listados activos). */
  matchPhase?: MatchListPhase;
  /** Organizador de la reserva (cancelación / gestión). */
  organizerPlayerId?: string | null;
};

type PartidosScreenProps = {
  onPartidoPress?: (partido: PartidoItem) => void;
  /** Tras elegir WeMatch en el modal y Siguiente: abre pantalla completa de clubes/horarios. */
  onOpenWeMatchClubsFlow?: (organizerPlayerId: string | null) => void;
  /** Incrementado desde MainApp al cerrar el flujo para refrescar listas */
  partidosRefreshNonce?: number;
};

export function PartidosScreen({
  onPartidoPress,
  onOpenWeMatchClubsFlow,
  partidosRefreshNonce = 0,
}: PartidosScreenProps) {
  const { session } = useAuth();
  const [organizerPlayerId, setOrganizerPlayerId] = useState<string | null>(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [openPartidos, setOpenPartidos] = useState<PartidoItem[]>([]);
  const [myPartidos, setMyPartidos] = useState<PartidoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPartidos = useCallback(async () => {
    setLoading(true);
    const token = session?.access_token ?? null;
    const [playerId, matches] = await Promise.all([
      token ? fetchMyPlayerId(token) : Promise.resolve(null),
      fetchMatches({ expand: true, token }),
    ]);
    setOrganizerPlayerId(playerId);
    const allPartidos = matches
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.matchPhase !== 'past');
    setOpenPartidos(allPartidos.filter((p) => p.visibility !== 'private'));
    setMyPartidos(
      allPartidos.filter(
        (p) =>
          p.visibility === 'private' &&
          playerId != null &&
          (p.playerIds ?? []).includes(playerId)
      )
    );
    setLoading(false);
  }, [session?.access_token]);

  useEffect(() => {
    loadPartidos();
  }, [loadPartidos, partidosRefreshNonce]);

  return (
    <View style={styles.wrapper}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Para tu nivel</Text>
        <Text style={styles.sectionSubtitle}>
          Estos partidos reflejan tu búsqueda y nivel
        </Text>
      </View>
      <View style={styles.list}>
        {loading ? (
          <>
            <PartidoOpenCardSkeleton />
            <PartidoOpenCardSkeleton />
            <PartidoOpenCardSkeleton />
          </>
        ) : openPartidos.length > 0 ? (
          openPartidos.map((item) => (
            <PartidoOpenCard
              key={item.id}
              item={item}
              onPress={() => onPartidoPress?.(item)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No hay partidos abiertos</Text>
          </View>
        )}
      </View>

      <View style={[styles.section, { marginTop: theme.spacing.xl }]}>
        <Text style={styles.sectionTitle}>Mis partidos</Text>
        <Text style={styles.sectionSubtitle}>Tus reservas privadas</Text>
      </View>
      <View style={styles.list}>
        {loading ? (
          <>
            <PartidoOpenCardSkeleton />
            <PartidoOpenCardSkeleton />
          </>
        ) : myPartidos.length > 0 ? (
          myPartidos.map((item) => (
            <PartidoCard
              key={item.id}
              item={item}
              surface="dark"
              onPress={() => onPartidoPress?.(item)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No tienes partidos privados</Text>
          </View>
        )}
      </View>
    </ScrollView>
      <View style={styles.fabAnchor} pointerEvents="box-none">
        <View style={styles.fabShadow}>
          <Pressable
            style={({ pressed }) => [styles.fabPressable, pressed && styles.fabPressed]}
            onPress={() => setLocationModalVisible(true)}
          >
            {/*
              El gradiente envuelve el texto con padding (sin capa absoluteFill + overflow).
              En Android, gradiente hermano del Text + elevation en la capa recortada suele
              dejar la etiqueta cortada; aquí el LinearGradient define el tamaño del botón.
            */}
            <LinearGradient
              colors={['#F18F34', '#E95F32']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fabGradient}
            >
              <Text
                style={styles.fabLabel}
                {...Platform.select({
                  android: { textBreakStrategy: 'simple' as const },
                  default: {},
                })}
              >
                + Comenzar un partido
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      <CrearPartidoLocationSheet
        presentation="modal"
        visible={locationModalVisible}
        modalOnlyWeMatch
        initialStep="location"
        organizerPlayerId={organizerPlayerId}
        onContinueWeMatch={() => {
          setLocationModalVisible(false);
          onOpenWeMatchClubsFlow?.(organizerPlayerId);
        }}
        onClose={() => setLocationModalVisible(false)}
        onSiguiente={() => {}}
        onPartidoCreado={undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1, backgroundColor: '#000000' },
  content: {
    paddingBottom: theme.scrollBottomPadding,
  },
  fabPressed: { opacity: 0.92 },
  fabPressable: {
    alignSelf: 'center',
    ...Platform.select({
      android: { overflow: 'visible' as const },
      default: {},
    }),
  },
  section: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    lineHeight: lineHeightFor(theme.fontSize.base),
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
    ...Platform.select({
      android: { paddingVertical: 1 },
      default: {},
    }),
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: lineHeightFor(12),
    color: '#9ca3af',
    ...Platform.select({
      android: { paddingVertical: 1 },
      default: {},
    }),
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    gap: 12,
  },
  emptyState: { paddingVertical: theme.spacing.xxl, alignItems: 'center' },
  emptyText: {
    fontSize: theme.fontSize.sm,
    lineHeight: lineHeightFor(theme.fontSize.sm),
    color: '#9ca3af',
    ...Platform.select({
      android: { paddingVertical: 1 },
      default: {},
    }),
  },
  fabAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
    zIndex: 50,
  },
  /** iOS: sombra en el wrapper. Android: elevation en fabGradient (mismo bloque que el texto). */
  fabShadow: {
    borderRadius: 9999,
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(241, 143, 52, 0.4)',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 32,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  fabGradient: {
    borderRadius: 9999,
    paddingHorizontal: 28,
    paddingVertical: 16,
    justifyContent: 'center',
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        alignItems: 'center',
      },
      android: {
        /** stretch: el Text usa el ancho del gradiente (minWidth), no una medición intrínseca rota. */
        alignItems: 'stretch',
        minWidth: Math.min(320, theme.screenWidth - 32),
        elevation: 10,
      },
      default: {
        alignItems: 'center',
      },
    }),
  },
  fabLabel: {
    flexShrink: 0,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: lineHeightFor(theme.fontSize.lg),
    textAlign: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
        paddingVertical: 1,
      },
      default: {},
    }),
  },
});
