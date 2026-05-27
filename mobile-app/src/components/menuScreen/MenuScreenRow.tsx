import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme';

type MenuScreenRowProps = {
  title: string;
  subtitle?: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  iconColors: [string, string];
  iconColor: string;
  onPress: () => void;
};

export function MenuScreenRow({
  title,
  subtitle,
  icon,
  iconColors,
  iconColor,
  onPress,
}: MenuScreenRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <LinearGradient
        colors={iconColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.rowIconBox}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
      </LinearGradient>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#6b7280" style={styles.rowChevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
    borderRadius: 16,
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  rowIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  rowSubtitle: { fontSize: 12, color: theme.auth.textSecondary, marginTop: 2 },
  rowChevron: { marginLeft: 4 },
});
