import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FilterChipButton } from './FilterChipButton';
import { filterTheme } from './filterTheme';

export type AppFilterChipConfig = {
  id: string;
  label: string;
  active?: boolean;
  onPress: () => void;
  showChevron?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

type AppFilterBarProps = {
  chips: AppFilterChipConfig[];
  advancedCount?: number;
  onAdvancedPress?: () => void;
  showAdvancedButton?: boolean;
  paddingHorizontal?: number;
  trailing?: ReactNode;
};

/** Barra de filtros unificada: icono opciones + chips desplazables. */
export function AppFilterBar({
  chips,
  advancedCount = 0,
  onAdvancedPress,
  showAdvancedButton = true,
  paddingHorizontal = 16,
  trailing,
}: AppFilterBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingHorizontal }]}
    >
      {showAdvancedButton && onAdvancedPress ? (
        <Pressable
          onPress={onAdvancedPress}
          style={({ pressed }) => [
            styles.iconChip,
            advancedCount > 0 && styles.iconChipActive,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Más filtros"
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={advancedCount > 0 ? filterTheme.accent : '#fff'}
          />
          {advancedCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{advancedCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
      {chips.map((chip) => (
        <FilterChipButton
          key={chip.id}
          label={chip.label}
          active={chip.active}
          onPress={chip.onPress}
          showChevron={chip.showChevron ?? true}
          icon={chip.icon}
        />
      ))}
      {trailing}
      <View style={{ width: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  iconChip: {
    width: 36,
    height: 34,
    borderRadius: 10,
    backgroundColor: filterTheme.chipBg,
    borderWidth: 1,
    borderColor: filterTheme.chipBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipActive: {
    backgroundColor: filterTheme.chipActiveBg,
    borderColor: filterTheme.chipActiveBorder,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: filterTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  pressed: { opacity: 0.85 },
});
