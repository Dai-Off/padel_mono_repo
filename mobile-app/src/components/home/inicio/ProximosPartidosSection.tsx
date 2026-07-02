import { type ReactNode, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { CourtReservation } from '../../../api/bookings';
import type { PartidoItem } from '../../../screens/PartidosScreen';
import { PartidoOpenCard } from '../../partido/PartidoOpenCard';
import { CourtReservationHomeCard } from '../../partido/CourtReservationHomeCard';
import { filterTheme } from '../../filters/filterTheme';
import { INICIO_PAD_H } from './constants';
import { androidReadableText, androidSectionHeading } from './textStyles';
import { useAmbientTheme } from '../../../hooks/useAmbientTheme';
import { OPENWEATHER_API_KEY } from '../../../config';
import { useTranslation } from '../../../i18n';
import {
  buildHomeActivityItems,
  filterHomeActivityItems,
  type HomeActivityItem,
  type HomeActivityType,
} from './homeActivityFilters';
import { HOME_ACTIVITY_CARD_MIN_HEIGHT } from './homeActivityCardLayout';
import { MisActividadesFiltersSheet } from './MisActividadesFiltersSheet';

const CARD_RADIUS = 12;
const CAROUSEL_CARD_W_MAX = 300;
const CAROUSEL_INNER_PAD = 12;

type Props = {
  partidos: PartidoItem[];
  reservations: CourtReservation[];
  loading?: boolean;
  onPartidoPress?: (partido: PartidoItem) => void;
  onReservationPress?: (reservation: CourtReservation) => void;
};

function CarouselItem({ width, children }: { width: number; children: ReactNode }) {
  return <View style={[styles.carouselItem, { width }]}>{children}</View>;
}

function ReservaCard({
  item,
  onPress,
  fullWidth,
  theme,
}: {
  item: CourtReservation;
  onPress: () => void;
  fullWidth: boolean;
  theme: { orb1Color: string };
}) {
  return (
    <View style={[styles.cardShell, fullWidth && styles.cardShellFull]}>
      <CourtReservationHomeCard item={item} onPress={onPress} fullWidth={fullWidth} />
      <LinearGradient
        pointerEvents="none"
        colors={[`rgba(${theme.orb1Color}, 0.1)`, 'transparent']}
        locations={[0, 0.85]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.cardGlowOverlay}
      />
    </View>
  );
}

function ProximoCard({
  item,
  onPress,
  fullWidth,
  theme,
}: {
  item: PartidoItem;
  onPress: () => void;
  fullWidth: boolean;
  theme: { orb1Color: string };
}) {
  return (
    <View style={[styles.cardShell, fullWidth && styles.cardShellFull]}>
      <PartidoOpenCard item={item} onPress={onPress} fullWidth={fullWidth} showVisibilityBadge />
      <LinearGradient
        pointerEvents="none"
        colors={[`rgba(${theme.orb1Color}, 0.1)`, 'transparent']}
        locations={[0, 0.85]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.cardGlowOverlay}
      />
    </View>
  );
}

function renderActivityCard(
  item: HomeActivityItem,
  fullWidth: boolean,
  theme: { orb1Color: string },
  onPartidoPress?: (p: PartidoItem) => void,
  onReservationPress?: (r: CourtReservation) => void,
) {
  if (item.kind === 'partido') {
    return (
      <ProximoCard
        item={item.data}
        fullWidth={fullWidth}
        onPress={() => onPartidoPress?.(item.data)}
        theme={theme}
      />
    );
  }
  return (
    <ReservaCard
      item={item.data}
      fullWidth={fullWidth}
      onPress={() => onReservationPress?.(item.data)}
      theme={theme}
    />
  );
}

export function ProximosPartidosSection({
  partidos,
  reservations,
  loading,
  onPartidoPress,
  onReservationPress,
}: Props) {
  const { t } = useTranslation();
  const theme = useAmbientTheme(OPENWEATHER_API_KEY);
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();

  const [typeFilters, setTypeFilters] = useState<HomeActivityType[]>([]);
  const [showFinished, setShowFinished] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const allItems = useMemo(
    () => buildHomeActivityItems(partidos, reservations),
    [partidos, reservations],
  );

  const visibleItems = useMemo(
    () =>
      filterHomeActivityItems(allItems, {
        typeFilters,
        showFinished,
      }),
    [allItems, typeFilters, showFinished],
  );

  const activeFilterCount = typeFilters.length + (showFinished ? 1 : 0);

  const usableW = windowW - INICIO_PAD_H * 2;
  const carouselCardW = Math.min(CAROUSEL_CARD_W_MAX, Math.max(200, usableW - CAROUSEL_INNER_PAD));
  const singleCardW = Math.max(200, usableW);
  const cardWidth = !loading && visibleItems.length === 1 ? singleCardW : carouselCardW;

  const hasAnyData = allItems.length > 0;
  if (!loading && !hasAnyData) return null;

  const subtitle =
    loading && visibleItems.length === 0
      ? t('home.misActividades.loading')
      : visibleItems.length === 0
        ? t('home.misActividades.emptyFiltered')
        : visibleItems.length === 1
          ? t('home.misActividades.oneItem')
          : t('home.misActividades.manyItems', { count: visibleItems.length });

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {t('home.misActividades.title')}
          </Text>
          {hasAnyData ? (
            <Pressable
              onPress={() => setFiltersOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('search.filtersTitle')}
              style={({ pressed }) => [
                styles.filterBtn,
                activeFilterCount > 0 && styles.filterBtnActive,
                pressed && styles.filterBtnPressed,
              ]}
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={activeFilterCount > 0 ? filterTheme.accent : '#9ca3af'}
              />
              {activeFilterCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <MisActividadesFiltersSheet
        visible={filtersOpen}
        allItems={allItems}
        typeFilters={typeFilters}
        showFinished={showFinished}
        onClose={() => setFiltersOpen(false)}
        onApply={(types, finished) => {
          setTypeFilters(types);
          setShowFinished(finished);
        }}
      />

      {loading && visibleItems.length === 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          removeClippedSubviews={false}
          scrollEnabled={false}
          style={styles.carouselScroll}
          contentContainerStyle={[styles.carouselContent, { paddingRight: 12 + insets.right }]}
        >
          <CarouselItem width={carouselCardW}>
            <Pressable style={[styles.skeletonCard, { width: carouselCardW }]} disabled>
              <LinearGradient
                colors={[`rgba(${theme.orb1Color}, 0.1)`, 'transparent']}
                locations={[0, 0.85]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.skeletonLineLg} />
              <View style={styles.skeletonLineSm} />
            </Pressable>
          </CarouselItem>
        </ScrollView>
      ) : visibleItems.length === 0 ? (
        <View style={styles.emptyFilteredWrap}>
          <Text style={styles.emptyFilteredText}>{t('home.misActividades.emptyFiltered')}</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          removeClippedSubviews={false}
          scrollEnabled={visibleItems.length > 1}
          style={styles.carouselScroll}
          contentContainerStyle={[
            styles.carouselContent,
            {
              paddingRight: visibleItems.length === 1 ? insets.right : 12 + insets.right,
            },
          ]}
        >
          {visibleItems.map((item) => {
            const key =
              item.kind === 'partido' ? `partido-${item.data.id}` : `reservation-${item.data.id}`;
            return (
              <CarouselItem key={key} width={cardWidth}>
                {renderActivityCard(
                  item,
                  visibleItems.length === 1,
                  theme,
                  onPartidoPress,
                  onReservationPress,
                )}
              </CarouselItem>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignSelf: 'stretch',
    width: '100%',
    marginBottom: 0,
  },
  headerRow: {
    marginBottom: 12,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    flex: 1,
    minWidth: 0,
    ...androidSectionHeading({
      fontSize: 20,
      fontWeight: '900',
      color: '#ffffff',
      letterSpacing: -0.3,
    }),
    ...Platform.select({
      android: { width: '100%' as const, flexShrink: 0 },
      default: {},
    }),
  },
  filterBtn: {
    width: 30,
    height: 30,
    marginTop: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  filterBtnActive: {
    borderColor: filterTheme.chipActiveBorder,
    backgroundColor: filterTheme.chipActiveBg,
  },
  filterBtnPressed: {
    opacity: 0.88,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: filterTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    ...androidReadableText({
      fontSize: 12,
      color: '#6b7280',
      fontWeight: '500',
    }),
    ...Platform.select({
      android: { includeFontPadding: false, width: '100%' as const, flexShrink: 0 },
      default: {},
    }),
  },
  emptyFilteredWrap: {
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
  emptyFilteredText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
    textAlign: 'center',
  },
  carouselScroll: {
    overflow: 'visible',
    ...Platform.select({
      ios: { minHeight: HOME_ACTIVITY_CARD_MIN_HEIGHT },
      default: {},
    }),
  },
  carouselContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    paddingLeft: 0,
    paddingTop: 6,
    paddingBottom: 10,
  },
  carouselItem: {
    flexShrink: 0,
    overflow: 'visible',
  },
  cardShell: {
    position: 'relative',
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  cardShellFull: {
    width: '100%',
    alignSelf: 'stretch',
  },
  cardGlowOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CARD_RADIUS,
    ...Platform.select({
      ios: { zIndex: 2 },
      android: { zIndex: 2, elevation: 10 },
      default: {},
    }),
  },
  skeletonCard: {
    minHeight: HOME_ACTIVITY_CARD_MIN_HEIGHT,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    padding: 16,
    justifyContent: 'center',
    gap: 10,
  },
  skeletonLineLg: {
    height: 14,
    width: '72%',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skeletonLineSm: {
    height: 10,
    width: '44%',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
