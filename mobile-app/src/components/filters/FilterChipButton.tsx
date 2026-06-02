import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { filterTheme } from './filterTheme';

type FilterChipButtonProps = {
  label: string;
  active?: boolean;
  onPress: () => void;
  showChevron?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  maxWidth?: number;
};

/** Chip de filtro horizontal (barra superior en Partidos, Pistas, Torneos). */
export function FilterChipButton({
  label,
  active = false,
  onPress,
  showChevron = true,
  icon,
  maxWidth = 180,
}: FilterChipButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { maxWidth },
        active && styles.chipActive,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={12}
          color={active ? filterTheme.accent : 'rgba(255,255,255,0.9)'}
        />
      ) : null}
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      {showChevron ? (
        <Ionicons
          name="chevron-down"
          size={12}
          color={active ? filterTheme.accent : 'rgba(255,255,255,0.75)'}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: filterTheme.chipBg,
    borderWidth: 1,
    borderColor: filterTheme.chipBorder,
  },
  chipActive: {
    backgroundColor: filterTheme.chipActiveBg,
    borderColor: filterTheme.chipActiveBorder,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    flexShrink: 1,
  },
  chipLabelActive: { color: filterTheme.accent },
  pressed: { opacity: 0.85 },
});
