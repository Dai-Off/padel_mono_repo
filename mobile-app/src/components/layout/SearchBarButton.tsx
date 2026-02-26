import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type SearchBarButtonProps = {
  onPress?: () => void;
  placeholder?: string;
};

export function SearchBarButton({
  onPress,
  placeholder = 'Buscar pista',
}: SearchBarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={placeholder}
    >
      <Ionicons name="search" size={20} color="#9ca3af" />
      <Text style={styles.placeholder}>{placeholder}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#27272a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
  },
  pressed: { opacity: 0.9 },
  placeholder: { fontSize: 14, color: '#9ca3af' },
});
