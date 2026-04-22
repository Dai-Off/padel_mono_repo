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
        <Ionicons name={icon} size={20} color="#fff" />
        {showBadge && <View style={styles.badge} />}
      </View>
    </Pressable>
  );
}

export type NavbarActionsCallbacks = {
  onMessagesPress?: () => void;
  onNotificationsPress?: () => void;
  onGroupsPress?: () => void;
};

export function NavbarActions({
  onMessagesPress,
  onNotificationsPress,
  onGroupsPress,
}: NavbarActionsCallbacks = {}) {
  return (
    <View style={styles.container}>
      <NavbarActionButton
        icon="chatbubble-outline"
        accessibilityLabel="Mensajes"
        onPress={onMessagesPress}
      />
      <NavbarActionButton
        icon="notifications-outline"
        accessibilityLabel="Notificaciones"
        onPress={onNotificationsPress}
      />
      <NavbarActionButton
        icon="people-outline"
        showBadge
        opacity={0.7}
        accessibilityLabel="Grupos"
        onPress={onGroupsPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: { padding: 4, alignItems: 'center', justifyContent: 'center' },
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
