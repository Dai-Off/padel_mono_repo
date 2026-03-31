import { useEffect, useState } from 'react';
import {
  CERRAMIENTO_OPTIONS,
  DURATION_OPTIONS,
  PAREDES_OPTIONS,
} from '../../utils/formatSearch';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

type SortOption = 'distancia' | 'precio';
type DurationOption = 60 | 90 | 120;
type CerramientoOption = 'indoor' | 'exterior' | 'cubierta';
type ParedesOption = 'muro' | 'cristal' | 'panoramico';

type SearchFiltersSheetProps = {
  visible: boolean;
  onClose: () => void;
  onApply?: (filters: SearchFiltersState) => void;
  onClear?: () => void;
  initialFilters?: SearchFiltersState;
  resultCount: number;
  /** Texto del CTA: lista de clubes (Pistas) vs genérico. */
  resultCountKind?: 'clubs' | 'results';
};

export type SearchFiltersState = {
  sport: string | null;
  date: Date | null;
  timeRange: { start: string; end: string } | null;
  showUnavailable: boolean;
  sortBy: SortOption;
  maxDistanceKm: number;
  duration: DurationOption;
  cerramiento: CerramientoOption | null;
  paredes: ParedesOption | null;
};

export function getInitialFilters(): SearchFiltersState {
  return {
    sport: null,
    date: null,
    timeRange: null,
    showUnavailable: false,
    sortBy: 'distancia',
    maxDistanceKm: 50,
    duration: 90,
    cerramiento: null,
    paredes: null,
  };
}

function FilterChip({
  label,
  selected,
  onPress,
  unselectedVariant = 'gray',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 'gray' = bg gray-100 (Ordenar). 'outline' = white + border (Duración, Cerramiento, Paredes) */
  unselectedVariant?: 'gray' | 'outline';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : unselectedVariant === 'gray' ? styles.chipUnselectedGray : styles.chipUnselectedOutline,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        style={[
          styles.chipText,
          selected ? styles.chipTextSelected : styles.chipTextUnselected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Hoja de filtros que se abre al tocar el botón de filtros en el buscador. */
function formatResultCtaLabel(n: number, kind: 'clubs' | 'results') {
  if (kind === 'clubs') {
    return n === 1 ? 'Ver 1 club' : `Ver ${n} clubes`;
  }
  return `Ver ${n} resultados`;
}

export function SearchFiltersSheet({
  visible,
  onClose,
  onApply,
  onClear,
  initialFilters,
  resultCount,
  resultCountKind = 'results',
}: SearchFiltersSheetProps) {
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useState<SearchFiltersState>(() =>
    initialFilters ?? getInitialFilters()
  );

  useEffect(() => {
    if (visible && initialFilters) {
      setFilters(initialFilters);
    }
  }, [visible, initialFilters]);

  const handleClear = () => {
    setFilters(getInitialFilters());
    onClear?.();
  };

  const handleApply = () => {
    onApply?.(filters);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Cerrar filtros">
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={20} color="#9ca3af" />
            </Pressable>
            <Text style={styles.headerTitle}>Filtrar</Text>
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Borrar filtros"
            >
              <Text style={styles.clearButtonText}>Borrar</Text>
            </Pressable>
          </View>

          <View style={styles.scrollWrapper}>
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={[styles.content, { paddingBottom: theme.spacing.xl }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Mostrar clubes sin disponibilidad</Text>
                <Switch
                  value={filters.showUnavailable}
                  onValueChange={(v) => setFilters((s) => ({ ...s, showUnavailable: v }))}
                  trackColor={{ false: '#e5e7eb', true: '#E31E24' }}
                  thumbColor="#fff"
                  accessibilityLabel="Mostrar clubes sin disponibilidad"
                />
              </View>
            </View>

            <View style={[styles.section, styles.sectionBorder]}>
              <Text style={styles.sectionTitle}>Ordenar por</Text>
              <View style={styles.chipRow}>
                <FilterChip
                  label="Distancia"
                  selected={filters.sortBy === 'distancia'}
                  onPress={() => setFilters((s) => ({ ...s, sortBy: 'distancia' }))}
                  unselectedVariant="gray"
                />
                <FilterChip
                  label="Precio"
                  selected={filters.sortBy === 'precio'}
                  onPress={() => setFilters((s) => ({ ...s, sortBy: 'precio' }))}
                  unselectedVariant="gray"
                />
              </View>
            </View>

            <View style={[styles.section, styles.sectionBorder]}>
              <View style={styles.distanceHeader}>
                <Text style={styles.sectionTitle}>Distancia máxima</Text>
                <Text style={styles.distanceValue}>{filters.maxDistanceKm}km</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={50}
                step={1}
                value={filters.maxDistanceKm}
                onValueChange={(v) => setFilters((s) => ({ ...s, maxDistanceKm: v }))}
                minimumTrackTintColor="#E31E24"
                maximumTrackTintColor="#e5e7eb"
                thumbTintColor="#E31E24"
                accessibilityLabel="Distancia máxima en kilómetros"
              />
            </View>

            <View style={[styles.section, styles.sectionBorder]}>
              <Text style={styles.sectionTitle}>Duración</Text>
              <View style={styles.chipRow}>
                {DURATION_OPTIONS.map((m) => (
                  <FilterChip
                    key={m}
                    label={`${m} min`}
                    selected={filters.duration === m}
                    onPress={() => setFilters((s) => ({ ...s, duration: m }))}
                    unselectedVariant="outline"
                  />
                ))}
              </View>
            </View>

            <View style={[styles.section, styles.sectionBorder]}>
              <Text style={styles.sectionTitle}>Cerramiento</Text>
              <View style={styles.chipRow}>
                {CERRAMIENTO_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.id}
                    label={opt.label}
                    selected={filters.cerramiento === opt.id}
                    onPress={() =>
                      setFilters((s) => ({
                        ...s,
                        cerramiento: s.cerramiento === opt.id ? null : opt.id,
                      }))
                    }
                    unselectedVariant="outline"
                  />
                ))}
              </View>
            </View>

            <View style={[styles.section, styles.sectionBorder]}>
              <Text style={styles.sectionTitle}>Paredes</Text>
              <View style={styles.chipRow}>
                {PAREDES_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.id}
                    label={opt.label}
                    selected={filters.paredes === opt.id}
                    onPress={() =>
                      setFilters((s) => ({
                        ...s,
                        paredes: s.paredes === opt.id ? null : opt.id,
                      }))
                    }
                    unselectedVariant="outline"
                  />
                ))}
              </View>
            </View>

            <Pressable
              onPress={handleApply}
              style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={formatResultCtaLabel(resultCount, resultCountKind)}
            >
              <Text style={styles.ctaButtonText}>
                {formatResultCtaLabel(resultCount, resultCountKind)}
              </Text>
            </Pressable>
          </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: theme.spacing.lg,
    maxHeight: '90%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  clearButtonText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#E31E24',
  },
  scrollWrapper: {
    maxHeight: Dimensions.get('window').height * 0.6,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    paddingVertical: theme.spacing.lg,
    gap: 0,
  },
  section: {
    paddingTop: 0,
  },
  sectionBorder: {
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: theme.spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: theme.fontSize.sm,
    color: '#374151',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: 12,
  },
  chipSelected: {
    backgroundColor: '#1A1A1A',
  },
  chipUnselectedGray: {
    backgroundColor: '#f3f4f6',
  },
  chipUnselectedOutline: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#fff',
  },
  chipTextUnselected: {
    color: '#6b7280',
  },
  distanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  distanceValue: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#E31E24',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  ctaButton: {
    backgroundColor: '#E31E24',
    borderRadius: 16,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.xl,
  },
  ctaButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#fff',
  },
  pressed: {
    opacity: 0.8,
  },
});
