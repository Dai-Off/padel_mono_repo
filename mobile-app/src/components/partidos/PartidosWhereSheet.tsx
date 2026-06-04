import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { FilterOptionRow } from './FilterOptionRow';
import { FilterApplyFooter } from '../filters/FilterApplyFooter';
import { filterTheme } from '../filters/filterTheme';
import type { PartidosFiltersState } from '../../domain/partidosFilters';
import {
  PARTIDOS_DISTANCE_STEPS_KM,
  nearestDistanceStep,
} from '../../domain/partidosFilters';
import type { ClubCatalogItem } from '../../hooks/useClubCatalog';
import { theme } from '../../theme';

type PartidosWhereSheetProps = {
  visible: boolean;
  draft: PartidosFiltersState;
  clubs: ClubCatalogItem[];
  clubsLoading: boolean;
  favoriteClubIds: string[];
  getResultCount: (draft: PartidosFiltersState) => number;
  onClose: () => void;
  onApply: (patch: Partial<PartidosFiltersState>) => void;
};

export function PartidosWhereSheet({
  visible,
  draft,
  clubs,
  clubsLoading,
  favoriteClubIds,
  getResultCount,
  onClose,
  onApply,
}: PartidosWhereSheetProps) {
  const [local, setLocal] = useState(draft);

  useEffect(() => {
    if (visible) setLocal(draft);
  }, [visible, draft]);

  const displayClubs = useMemo(() => {
    if (!local.useFavoriteClubsOnly || favoriteClubIds.length === 0) return clubs;
    const fav = new Set(favoriteClubIds);
    return clubs.filter((c) => fav.has(c.id));
  }, [clubs, favoriteClubIds, local.useFavoriteClubsOnly]);

  const toggleClub = (clubId: string) => {
    setLocal((s) => {
      const has = s.selectedClubIds.includes(clubId);
      return {
        ...s,
        selectedClubIds: has
          ? s.selectedClubIds.filter((id) => id !== clubId)
          : [...s.selectedClubIds, clubId],
      };
    });
  };

  const preview = getResultCount(local);

  const footer = (
    <FilterApplyFooter
      resultCount={preview}
      onPress={() => {
        onApply({
          selectedClubIds: local.selectedClubIds,
          useFavoriteClubsOnly: local.useFavoriteClubsOnly,
          useDistanceFilter: local.useDistanceFilter,
          maxDistanceKm: local.maxDistanceKm,
        });
        onClose();
      }}
    />
  );

  return (
    <FilterBottomSheet
      visible={visible}
      title="¿Dónde quieres jugar?"
      onClose={onClose}
      onClear={() =>
        setLocal((s) => ({
          ...s,
          selectedClubIds: [],
          useFavoriteClubsOnly: false,
          useDistanceFilter: false,
        }))
      }
      footer={footer}
      contentStyle={styles.body}
    >
      <View style={styles.searchRow}>
        <Ionicons name="location-outline" size={18} color={filterTheme.textMuted} />
        <Text style={styles.searchPlaceholder}>Cerca de mí</Text>
        <Ionicons name="navigate-outline" size={18} color={filterTheme.accent} />
      </View>

      {clubsLoading ? (
        <ActivityIndicator color={filterTheme.accent} style={{ marginVertical: 16 }} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.clubStrip}
        >
          {displayClubs.slice(0, 24).map((club) => {
            const selected = local.selectedClubIds.includes(club.id);
            return (
              <Pressable
                key={club.id}
                onPress={() => toggleClub(club.id)}
                style={({ pressed }) => [styles.clubCard, pressed && { opacity: 0.9 }]}
              >
                {club.imageUrl ? (
                  <Image source={{ uri: club.imageUrl }} style={styles.clubImage} />
                ) : (
                  <View style={[styles.clubImage, styles.clubImagePlaceholder]}>
                    <Ionicons name="business-outline" size={24} color={filterTheme.textMuted} />
                  </View>
                )}
                {selected ? (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </View>
                ) : null}
                <Text style={styles.clubName} numberOfLines={2}>
                  {club.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <FilterOptionRow
        mode="checkbox"
        title="Clubes favoritos"
        selected={local.useFavoriteClubsOnly}
        onPress={() =>
          setLocal((s) => ({ ...s, useFavoriteClubsOnly: !s.useFavoriteClubsOnly }))
        }
      />
      <FilterOptionRow
        mode="checkbox"
        title="Seleccione una distancia"
        selected={local.useDistanceFilter}
        onPress={() =>
          setLocal((s) => ({ ...s, useDistanceFilter: !s.useDistanceFilter }))
        }
      />

      {local.useDistanceFilter ? (
        <View style={styles.distanceBlock}>
          <View style={styles.distanceHeader}>
            <Text style={styles.distanceLabel}>Distancia máxima</Text>
            <Text style={styles.distanceValue}>{local.maxDistanceKm} km</Text>
          </View>
          <View style={styles.stepsRow}>
            {PARTIDOS_DISTANCE_STEPS_KM.map((km) => (
              <Pressable
                key={km}
                onPress={() => setLocal((s) => ({ ...s, maxDistanceKm: km }))}
                style={[
                  styles.stepDot,
                  local.maxDistanceKm === km && styles.stepDotActive,
                ]}
              >
                <Text
                  style={[
                    styles.stepText,
                    local.maxDistanceKm === km && styles.stepTextActive,
                  ]}
                >
                  {km}
                </Text>
              </Pressable>
            ))}
          </View>
          <Slider
            style={styles.slider}
            minimumValue={PARTIDOS_DISTANCE_STEPS_KM[0]}
            maximumValue={PARTIDOS_DISTANCE_STEPS_KM[PARTIDOS_DISTANCE_STEPS_KM.length - 1]}
            step={1}
            value={local.maxDistanceKm}
            onValueChange={(v) =>
              setLocal((s) => ({ ...s, maxDistanceKm: nearestDistanceStep(v) }))
            }
            minimumTrackTintColor={filterTheme.accent}
            maximumTrackTintColor="rgba(255,255,255,0.12)"
            thumbTintColor={filterTheme.accent}
          />
        </View>
      ) : null}
    </FilterBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 0 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: filterTheme.chipBorder,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: filterTheme.textMuted,
  },
  clubStrip: {
    gap: 12,
    paddingBottom: theme.spacing.md,
  },
  clubCard: { width: 120 },
  clubImage: {
    width: 120,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
  },
  clubImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: filterTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubName: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: filterTheme.text,
  },
  distanceBlock: {
    marginTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  distanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  distanceLabel: { color: filterTheme.textMuted, fontSize: theme.fontSize.sm },
  distanceValue: { color: filterTheme.accent, fontWeight: '700', fontSize: theme.fontSize.sm },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  stepDot: { padding: 4 },
  stepDotActive: {},
  stepText: { fontSize: 11, color: filterTheme.textMuted },
  stepTextActive: { color: filterTheme.accent, fontWeight: '700' },
  slider: { width: '100%', height: 36 },
});
