import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type NavbarActionProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  showBadge?: boolean;
  opacity?: number;
  accessibilityLabel?: string;
};

function NavbarActionButton({
  icon,
  onPress,
  showBadge = false,
  opacity = 1,
  accessibilityLabel,
}: NavbarActionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.iconWrap, opacity < 1 && { opacity }]}>
        <Ionicons name={icon} size={22} color="#1A1A1A" />
        {showBadge && <View style={styles.badge} />}
      </View>
    </Pressable>
  );
}

export function NavbarActions() {
  return (
    <View style={styles.container}>
      <NavbarActionButton icon="chatbubble-outline" accessibilityLabel="Mensajes" />
      <NavbarActionButton icon="notifications-outline" accessibilityLabel="Notificaciones" />
      <NavbarActionButton icon="people-outline" showBadge opacity={0.7} accessibilityLabel="Grupos" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: { padding: 6, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  iconWrap: { position: 'relative' },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E31E24',
  },
});
