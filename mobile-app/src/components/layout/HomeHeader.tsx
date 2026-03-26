import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

type HomeHeaderProps = {
  onMenuPress: () => void;
  onMessagesPress?: () => void;
  onNotificationsPress?: () => void;
  onGroupsPress?: () => void;
};

/**
 * Navbar del home (web): fila `justify-between gap-4`, menú | flex-1 vacío | mensajes + campana + usuarios (`gap-2`).
 */
export function HomeHeader({
  onMenuPress,
  onMessagesPress,
  onNotificationsPress,
  onGroupsPress,
}: HomeHeaderProps) {
  const { width: windowWidth } = useWindowDimensions();
  const narrow = windowWidth < 380;
  const iconSize = narrow ? 22 : 24;

  const rowPad = Platform.select({
    ios: { paddingVertical: narrow ? 8 : 10, paddingHorizontal: narrow ? 12 : 20 },
    default: { paddingVertical: narrow ? 10 : 12, paddingHorizontal: narrow ? 12 : 20 },
  });

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={32} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.glassTint} />
      <View style={[styles.row, rowPad]}>
        <Pressable
          onPress={onMenuPress}
          style={({ pressed }) => [styles.iconBtn, narrow && styles.iconBtnCompact, pressed && styles.iconBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Abrir menú"
        >
          <Ionicons name="menu" size={iconSize} color="#fff" />
        </Pressable>

        {/* Web: <div class="flex-1" /> vacío entre menú y acciones */}
        <View style={styles.spacer} />

        <View style={[styles.actions, narrow && styles.actionsCompact]}>
          <Pressable
            onPress={onMessagesPress}
            style={({ pressed }) => [styles.iconBtn, narrow && styles.iconBtnCompact, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Mensajes"
          >
            <Ionicons name="chatbubble-outline" size={iconSize} color="#fff" />
          </Pressable>
          <Pressable
            onPress={onNotificationsPress}
            style={({ pressed }) => [styles.iconBtn, narrow && styles.iconBtnCompact, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Notificaciones"
          >
            <Ionicons name="notifications-outline" size={iconSize} color="#fff" />
          </Pressable>
          <Pressable
            onPress={onGroupsPress}
            style={({ pressed }) => [styles.iconBtn, narrow && styles.iconBtnCompact, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Grupos"
          >
            <Ionicons name="people-outline" size={iconSize} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  spacer: {
    flex: 1,
    minWidth: 0,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  iconBtnCompact: {
    padding: 6,
  },
  iconBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  actionsCompact: {
    gap: 4,
  },
});
