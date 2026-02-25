import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type TabId = 'inicio' | 'reservar' | 'competir' | 'partidos';

type TabConfig = {
  id: TabId;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
};

const TABS: TabConfig[] = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'reservar', label: 'Reservar', icon: 'calendar' },
  { id: 'competir', label: 'Competir', icon: 'trophy' },
  { id: 'partidos', label: 'Partidos', icon: 'people' },
];

type BottomNavbarProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
};

function TabButton({
  tab,
  isActive,
  onPress,
}: {
  tab: TabConfig;
  isActive: boolean;
  onPress: () => void;
}) {
  const iconColor = isActive ? '#111827' : '#9ca3af';
  const labelColor = isActive ? '#111827' : '#9ca3af';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
        <Ionicons name={tab.icon} size={24} color={iconColor} />
      </View>
      <Text style={[styles.label, { color: labelColor }, isActive && styles.labelActive]}>{tab.label}</Text>
      {isActive && (
        <View style={styles.indicatorWrap}>
          <View style={styles.indicator} />
        </View>
      )}
    </Pressable>
  );
}

export function BottomNavbar({ activeTab, onTabChange }: BottomNavbarProps) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          isActive={activeTab === tab.id}
          onPress={() => onTabChange(tab.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 10,
  },
  tabPressed: { opacity: 0.8 },
  iconWrap: {
    marginBottom: 1,
  },
  iconWrapActive: {
    transform: [{ translateY: -2 }, { scale: 1.1 }],
  },
  label: {
    fontSize: 10,
    lineHeight: 12,
  },
  labelActive: {
    fontWeight: '500',
  },
  indicatorWrap: {
    position: 'absolute',
    bottom: -8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  indicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e31e24',
  },
});
