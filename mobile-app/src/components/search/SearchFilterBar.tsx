import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppFilterBar } from '../filters/AppFilterBar';
import { filterTheme } from '../filters/filterTheme';

const FILTER_BAR_RIGHT_INSET = 24;

type SearchFilterBarProps = {
  sportLabel: string;
  dateLabel: string;
  timeRangeLabel: string;
  sportActive?: boolean;
  dateActive?: boolean;
  timeActive?: boolean;
  onSportPress?: () => void;
  onDatePress?: () => void;
  onTimeRangePress?: () => void;
  showCercaBadge?: boolean;
  advancedCount?: number;
  onAdvancedPress?: () => void;
};

/** Barra de chips Pistas (deporte, fecha, hora) + badge Cerca. */
export function SearchFilterBar({
  sportLabel,
  dateLabel,
  timeRangeLabel,
  sportActive = false,
  dateActive = false,
  timeActive = false,
  onSportPress,
  onDatePress,
  onTimeRangePress,
  showCercaBadge = true,
  advancedCount = 0,
  onAdvancedPress,
}: SearchFilterBarProps) {
  const insets = useSafeAreaInsets();
  const rightInset = Math.max(FILTER_BAR_RIGHT_INSET, insets.right + 8);

  return (
    <AppFilterBar
      showAdvancedButton={Boolean(onAdvancedPress)}
      advancedCount={advancedCount}
      onAdvancedPress={onAdvancedPress}
      paddingHorizontal={0}
      chips={[
        {
          id: 'sport',
          label: sportLabel,
          active: sportActive,
          onPress: onSportPress ?? (() => {}),
        },
        {
          id: 'date',
          label: dateLabel,
          active: dateActive,
          onPress: onDatePress ?? (() => {}),
        },
        {
          id: 'time',
          label: timeRangeLabel,
          active: timeActive,
          onPress: onTimeRangePress ?? (() => {}),
          icon: 'time-outline',
        },
      ]}
      trailing={
        <>
          {showCercaBadge ? (
            <View style={styles.cercaBadge} accessibilityLabel="Orden: cercanía">
              <Ionicons name="navigate-outline" size={12} color={filterTheme.accent} />
              <Text style={styles.cercaText}>Cerca</Text>
            </View>
          ) : null}
          <View style={{ width: rightInset, flexShrink: 0 }} />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  cercaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: filterTheme.accentMuted,
    borderWidth: 1,
    borderColor: filterTheme.accentBorder,
  },
  cercaText: {
    fontSize: 10,
    fontWeight: '700',
    color: filterTheme.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
