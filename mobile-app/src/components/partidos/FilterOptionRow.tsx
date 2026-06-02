import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { filterTheme } from '../filters/filterTheme';
import { theme } from '../../theme';

type FilterOptionRowProps = {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  mode: 'radio' | 'checkbox';
};

export function FilterOptionRow({
  title,
  subtitle,
  selected,
  onPress,
  mode,
}: FilterOptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole={mode === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={{ selected }}
    >
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.control, selected && styles.controlSelected]}>
        {selected ? (
          <Ionicons
            name={mode === 'radio' ? 'radio-button-on' : 'checkmark'}
            size={mode === 'radio' ? 22 : 16}
            color={filterTheme.accent}
          />
        ) : (
          <View style={styles.controlEmpty} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  textCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: filterTheme.text,
  },
  subtitle: {
    fontSize: theme.fontSize.xs,
    color: filterTheme.textMuted,
    marginTop: 2,
  },
  control: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlSelected: {},
  controlEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(241, 143, 52, 0.5)',
  },
  pressed: { opacity: 0.88 },
});
