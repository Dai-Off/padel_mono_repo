import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { ActivityOutcomeFilter } from '../../domain/matchOutcome';
import { theme } from '../../theme';

const FILTERS: { id: ActivityOutcomeFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'won', label: 'Ganados' },
  { id: 'lost', label: 'Perdidos' },
  { id: 'incomplete', label: 'No completados' },
  { id: 'cancelled', label: 'Cancelados' },
];

type ActividadPartidosFilterBarProps = {
  value: ActivityOutcomeFilter;
  onChange: (filter: ActivityOutcomeFilter) => void;
};

export function ActividadPartidosFilterBar({ value, onChange }: ActividadPartidosFilterBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {FILTERS.map((f) => {
        const active = value === f.id;
        return (
          <Pressable
            key={f.id}
            onPress={() => onChange(f.id)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: {
    backgroundColor: 'rgba(241,143,52,0.15)',
    borderColor: 'rgba(241,143,52,0.45)',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.auth.textSecondary },
  chipTextActive: { color: theme.auth.accent },
});
