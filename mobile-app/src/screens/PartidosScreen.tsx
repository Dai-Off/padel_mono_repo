import { useState } from 'react';
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
import { PartidoCard } from '../components/partido/PartidoCard';
import { PartidoOpenCard } from '../components/partido/PartidoOpenCard';
import { PartidoOpenCardSkeleton } from '../components/partido/PartidoOpenCardSkeleton';
import { CrearPartidoLocationSheet } from '../components/partido/CrearPartidoLocationSheet';
import { PartidosFilterBar } from '../components/partidos/PartidosFilterBar';
import { PartidosMoreFiltersModal } from '../components/partidos/PartidosMoreFiltersModal';
import { PartidosSportSheet } from '../components/partidos/PartidosSportSheet';
import { PartidosWhenSheet } from '../components/partidos/PartidosWhenSheet';
import { PartidosWhereSheet } from '../components/partidos/PartidosWhereSheet';
import type { MatchListPhase } from '../domain/matchLifecycle';
import { usePartidosList } from '../hooks/usePartidosList';
import { lineHeightFor, theme } from '../theme';

export type PartidoMode = 'competitivo' | 'amistoso';
export type PartidoPlayer = {
  id?: string;
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
  playerIds?: string[];
  playerIdsBySlot?: Array<string | null>;
  visibility?: 'public' | 'private';
  venue: string;
  location: string;
  price: string;
  pricePerPlayer: string;
  duration: string;
  venueImage?: string;
  venueAddress?: string;
  courtName?: string;
  courtType?: string;
  matchPhase?: MatchListPhase;
  organizerPlayerId?: string | null;
  matchmakingPayment?: {
    bookingId: string;
    participantId: string;
    shareAmountCents?: number;
  };
  matchType?: string | null;
  matchStatus?: string;
  bookingStatus?: string;
  scoreStatus?: 'pending' | 'confirmed' | 'disputed' | 'pending_confirmation' | 'pending_votes' | 'no_result' | null;
  score_status?: 'pending' | 'confirmed' | 'disputed' | 'pending_confirmation' | 'pending_votes' | 'no_result' | null;
  hasMyFeedback?: boolean;
  sets?: Array<{ a: number; b: number }> | null;
  myTeam?: 'A' | 'B' | null;
  myResult?: 'win' | 'loss' | 'draw' | 'pending' | null;
  matchEndReason?: string | null;
  score_proposer_id?: string | null;
  my_score_vote?: 'confirm' | 'reject' | null;
  score_vote_counts?: { confirm: number; reject: number } | null;
  courtSport?: string;
  startAtIso?: string;
  eloMin?: number | null;
  eloMax?: number | null;
  clubId?: string;
  startAt?: string;
  endAt?: string;
  matchGender?: 'male' | 'female' | 'mixed' | 'all';
};

type SheetKind = 'sport' | 'where' | 'when' | 'more' | null;

type PartidosScreenProps = {
  onPartidoPress?: (partido: PartidoItem) => void;
  onOpenWeMatchClubsFlow?: (organizerPlayerId: string | null) => void;
  onNavigateToCompleteOnboarding?: () => void;
  partidosRefreshNonce?: number;
};

export function PartidosScreen({
  onPartidoPress,
  onOpenWeMatchClubsFlow,
  onNavigateToCompleteOnboarding,
  partidosRefreshNonce = 0,
}: PartidosScreenProps) {
  const { session } = useAuth();
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [activeSheet, setActiveSheet] = useState<SheetKind>(null);

  const {
    filters,
    applyFilters,
    patchFilters,
    openPartidos,
    myPartidos,
    loading,
    misPartidosLoading,
    organizerPlayerId,
    clubs,
    clubsLoading,
    favoriteClubIds,
    previewCount,
    labels,
  } = usePartidosList(session?.access_token, partidosRefreshNonce);

  return (
    <View style={styles.wrapper}>
      <View style={styles.filterBarWrap}>
        <PartidosFilterBar
          sportLabel={labels.sport}
          clubsLabel={labels.clubs}
          whenLabel={labels.when}
          sportActive={labels.sportActive}
          clubsActive={labels.clubsActive}
          whenActive={labels.whenActive}
          advancedCount={labels.advancedCount}
          onFiltersPress={() => setActiveSheet('more')}
          onSportPress={() => setActiveSheet('sport')}
          onClubsPress={() => setActiveSheet('where')}
          onWhenPress={() => setActiveSheet('when')}
        />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Para tu nivel</Text>
          <Text style={styles.sectionSubtitle}>
            Estos partidos reflejan exactamente tu búsqueda y tu nivel
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
              <Text style={styles.emptyHint}>Prueba ampliando clubes o fechas</Text>
            </View>
          )}
        </View>

        <View style={[styles.section, { marginTop: theme.spacing.xl }]}>
          <Text style={styles.sectionTitle}>Mis partidos</Text>
          <Text style={styles.sectionSubtitle}>Tus reservas y partidos que organizas</Text>
        </View>
        <View style={styles.list}>
          {misPartidosLoading && myPartidos.length === 0 ? (
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
              <Text style={styles.emptyText}>No tienes partidos próximos</Text>
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

      <PartidosSportSheet
        visible={activeSheet === 'sport'}
        sport={filters.sport}
        onClose={() => setActiveSheet(null)}
        onSelect={(sport) => patchFilters({ sport })}
      />

      <PartidosWhereSheet
        visible={activeSheet === 'where'}
        draft={filters}
        clubs={clubs}
        clubsLoading={clubsLoading}
        favoriteClubIds={favoriteClubIds}
        getResultCount={previewCount}
        onClose={() => setActiveSheet(null)}
        onApply={patchFilters}
      />

      <PartidosWhenSheet
        visible={activeSheet === 'when'}
        draft={filters}
        getResultCount={previewCount}
        onClose={() => setActiveSheet(null)}
        onApply={patchFilters}
      />

      <PartidosMoreFiltersModal
        visible={activeSheet === 'more'}
        filters={filters}
        onClose={() => setActiveSheet(null)}
        onApply={applyFilters}
      />

      <CrearPartidoLocationSheet
        presentation="modal"
        visible={locationModalVisible}
        modalOnlyWeMatch
        initialStep="location"
        organizerPlayerId={organizerPlayerId}
        onContinueWeMatch={() => {
          setLocationModalVisible(false);
          onOpenWeMatchClubsFlow?.(organizerPlayerId ?? null);
        }}
        onClose={() => setLocationModalVisible(false)}
        onSiguiente={() => {}}
        onPartidoCreado={undefined}
        onNavigateToCompleteOnboarding={
          onNavigateToCompleteOnboarding
            ? () => {
                setLocationModalVisible(false);
                onNavigateToCompleteOnboarding();
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  filterBarWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 8,
  },
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
    marginTop: theme.spacing.sm,
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
  },
  emptyHint: {
    fontSize: theme.fontSize.xs,
    color: '#6b7280',
    marginTop: 4,
  },
  fabAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
    zIndex: 50,
  },
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
      android: { elevation: 0 },
    }),
  },
  fabGradient: {
    borderRadius: 9999,
    paddingHorizontal: 28,
    paddingVertical: 16,
    justifyContent: 'center',
    alignSelf: 'center',
    ...Platform.select({
      ios: { alignItems: 'center' },
      android: {
        alignItems: 'stretch',
        minWidth: Math.min(320, theme.screenWidth - 32),
        elevation: 10,
      },
      default: { alignItems: 'center' },
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
      android: { includeFontPadding: false, paddingVertical: 1 },
      default: {},
    }),
  },
});
