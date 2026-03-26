import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { lineHeightFor } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

/** Alineado a la BottomNav web (Inicio, Pistas, Tienda, Torneos, Partidos). */
export type MainTabId =
  | 'inicio'
  | 'pistas'
  | 'tienda'
  | 'torneos'
  | 'partidos';

type TabConfig = {
  id: MainTabId;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
};

const TABS: TabConfig[] = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'pistas', label: 'Pistas', icon: 'calendar' },
  { id: 'tienda', label: 'Tienda', icon: 'bag-handle-outline' },
  { id: 'torneos', label: 'Torneos', icon: 'trophy' },
  { id: 'partidos', label: 'Partidos', icon: 'flash' },
];

const GRADIENT = ['#F18F34', '#FFA940'] as const;
const ACTIVE = '#ffffff';
const INACTIVE = '#8E8E93';

const GLASS_TINT = 'rgba(26, 26, 26, 0.82)';
const ANDROID_BAR_BG = '#2c2c2e';

const EDGE_GLOW = ['transparent', 'rgba(255,255,255,0.06)'] as const;

/** Barra tipo pill: esquinas superiores (referencia / captura). */
const BAR_TOP_RADIUS = 24;

type BottomNavbarProps = {
  activeTab: MainTabId;
  onTabChange: (tab: MainTabId) => void;
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
  const iconColor = isActive ? ACTIVE : INACTIVE;
  const labelColor = isActive ? ACTIVE : INACTIVE;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
        <Ionicons
          name={tab.icon}
          size={Platform.OS === 'ios' ? 21 : 24}
          color={iconColor}
        />
      </View>
      <View
        style={[
          styles.labelShell,
          Platform.OS === 'ios' && styles.labelShellIOSMax,
          Platform.OS === 'android' && styles.labelShellAndroid,
        ]}
        collapsable={false}
      >
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit={Platform.OS === 'ios'}
          minimumFontScale={Platform.OS === 'ios' ? 0.75 : undefined}
          style={[
            styles.label,
            Platform.OS === 'ios' && styles.labelIOS,
            Platform.OS === 'android' && styles.labelAndroid,
            styles.labelFill,
            { color: labelColor },
            isActive && styles.labelActive,
          ]}
        >
          {tab.label}
        </Text>
      </View>
      {isActive && (
        <View style={styles.indicatorWrap}>
          <LinearGradient
            colors={[...GRADIENT]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.indicator}
          />
        </View>
      )}
    </Pressable>
  );
}

export function BottomNavbar({ activeTab, onTabChange }: BottomNavbarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(
    insets.bottom,
    Platform.OS === 'ios' ? 4 : 6,
  );

  return (
    <View style={styles.host}>
      {Platform.OS === 'ios' ? (
        <>
          <BlurView intensity={52} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.glassTint} pointerEvents="none" />
          <LinearGradient
            colors={[...EDGE_GLOW]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.edgeGlow}
            pointerEvents="none"
          />
        </>
      ) : (
        <>
          <View style={[StyleSheet.absoluteFill, styles.androidBase]} />
          <LinearGradient
            colors={[...EDGE_GLOW]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.edgeGlow}
            pointerEvents="none"
          />
        </>
      )}
      {/*
        Web: contenedor px-2 py-2 + justify-around.
        Cada botón: rounded-2xl px-3 py-2 gap-1.
      */}
      <View style={[styles.row, { paddingBottom: bottomPad }]}>
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onPress={() => onTabChange(tab.id)}
          />
        ))}
      </View>
    </View>
  );
}

const LABEL_BASE = 10;
const LABEL_IOS = 9;
const LABEL_ANDROID = 8;

const styles = StyleSheet.create({
  host: {
    width: '100%',
    alignSelf: 'stretch',
    ...Platform.select({
      /** Android: overflow:hidden en el host recortaba ascendentes/descendentes de las etiquetas. */
      android: { overflow: 'visible' as const },
      default: { overflow: 'hidden' as const },
    }),
    position: 'relative',
    minHeight: 44,
    borderTopLeftRadius: BAR_TOP_RADIUS,
    borderTopRightRadius: BAR_TOP_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    ...Platform.select({
      ios: {
        minHeight: 36,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  androidBase: {
    backgroundColor: ANDROID_BAR_BG,
    borderTopLeftRadius: BAR_TOP_RADIUS,
    borderTopRightRadius: BAR_TOP_RADIUS,
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GLASS_TINT,
  },
  edgeGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  /** iOS: más compacta en alto. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Platform.select({ ios: 8, default: 4 }),
    paddingTop: Platform.select({ ios: 3, default: 6 }),
    position: 'relative',
    zIndex: 2,
  },
  tab: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Platform.select({ ios: 3, default: 5 }),
    paddingHorizontal: Platform.select({ ios: 8, default: 0 }),
    borderRadius: 16,
    position: 'relative',
  },
  tabPressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  iconWrap: {
    marginBottom: Platform.select({ ios: 1, default: 2 }),
  },
  iconWrapActive: {
    transform: [{ translateY: -2 }, { scale: 1.1 }],
  },
  labelShell: {
    width: '100%',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelShellIOSMax: {
    maxWidth: '100%',
  },
  /** Ancho del tab completo para medir bien el texto (evita «Tien…» en Android). */
  labelShellAndroid: {
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  /** El Text debe ocupar el ancho del tab para que no midan mal y salga «Pist…». */
  labelFill: {
    width: '100%',
    alignSelf: 'stretch',
    flexShrink: 1,
  },
  label: {
    fontSize: LABEL_BASE,
    lineHeight: lineHeightFor(LABEL_BASE),
    fontWeight: '500',
    textAlign: 'center',
  },
  labelIOS: {
    fontSize: LABEL_IOS,
    lineHeight: lineHeightFor(LABEL_IOS),
    paddingVertical: 1,
  },
  labelAndroid: {
    includeFontPadding: false,
    fontSize: LABEL_ANDROID,
    lineHeight: lineHeightFor(LABEL_ANDROID),
    letterSpacing: -0.15,
    textAlign: 'center',
    paddingVertical: 1,
  },
  labelActive: {
    fontWeight: '600',
  },
  indicatorWrap: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  indicator: {
    width: 32,
    height: Platform.select({ ios: 3, default: 4 }),
    borderRadius: 999,
    overflow: 'hidden',
  },
});
