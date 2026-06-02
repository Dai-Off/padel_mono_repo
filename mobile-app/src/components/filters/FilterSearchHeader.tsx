import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { filterTheme } from './filterTheme';
import { theme } from '../../theme';

type FilterSearchHeaderProps = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  placeholder?: string;
  onBack?: () => void;
  onFiltersPress?: () => void;
  advancedFilterCount?: number;
  showFiltersButton?: boolean;
};

/** Fila búsqueda + botón filtros (Pistas, Torneos, etc.). */
export function FilterSearchHeader({
  searchQuery,
  onSearchChange,
  placeholder = 'Buscar...',
  onBack,
  onFiltersPress,
  advancedFilterCount = 0,
  showFiltersButton = true,
}: FilterSearchHeaderProps) {
  return (
    <View style={styles.topRow}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </Pressable>
      ) : (
        <View style={styles.iconBtnPlaceholder} />
      )}
      <View style={styles.searchShell}>
        <Ionicons name="search" size={16} color="#737373" style={styles.searchIcon} />
        <TextInput
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder={placeholder}
          placeholderTextColor="#737373"
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {showFiltersButton && onFiltersPress ? (
        <Pressable
          onPress={onFiltersPress}
          style={({ pressed }) => [
            styles.iconBtn,
            advancedFilterCount > 0 && styles.iconBtnActive,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Filtros"
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={advancedFilterCount > 0 ? filterTheme.accent : '#fff'}
          />
          {advancedFilterCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{advancedFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <View style={styles.iconBtnPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: filterTheme.chipBg,
    borderWidth: 1,
    borderColor: filterTheme.chipBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: filterTheme.chipActiveBg,
    borderColor: filterTheme.chipActiveBorder,
  },
  iconBtnPlaceholder: { width: 36, height: 36 },
  searchShell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: filterTheme.chipBg,
    borderWidth: 1,
    borderColor: filterTheme.chipBorder,
    borderRadius: 12,
    paddingLeft: 10,
    paddingRight: 12,
    minHeight: 40,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Platform.select({ ios: 8, default: 4 }),
    fontSize: theme.fontSize.sm,
    color: '#fff',
    includeFontPadding: false,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: filterTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  pressed: { opacity: 0.85 },
});
