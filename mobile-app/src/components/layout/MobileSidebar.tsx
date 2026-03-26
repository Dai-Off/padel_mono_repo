import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { theme } from '../../theme';

type MobileSidebarProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function MobileSidebar({ visible, onClose, children }: MobileSidebarProps) {
  const { width: windowWidth } = useWindowDimensions();
  /** Evita ancho 0 en el primer frame (Android) y animaciones con valor inválido. */
  const width = Math.max(windowWidth, 1);
  const slideAnim = useRef(new Animated.Value(-width)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: visible ? 0 : -width,
        useNativeDriver: true,
        damping: 25,
        stiffness: 200,
      }),
      Animated.timing(backdropAnim, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, slideAnim, backdropAnim, width]);

  const backdropOpacity = backdropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.overlay]}
      pointerEvents={visible ? 'box-none' : 'none'}
    >
      <Animated.View
        style={[styles.backdropWrap, { opacity: backdropOpacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, styles.backdropOverlay]} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Cerrar menú"
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sidebar,
          {
            width,
            top: 0,
            bottom: 0,
            left: 0,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Por encima del header/navbar: zIndex (iOS) y elevation (Android, orden de dibujado).
   * Elevation fija en Android para que al cerrar el drawer no quede el menú debajo del header.
   */
  overlay: {
    zIndex: 999,
    ...Platform.select({
      android: { elevation: 100 },
      default: {},
    }),
  },
  backdropWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropOverlay: {
    backgroundColor: theme.sidebar.overlayBg,
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    backgroundColor: theme.sidebar.bg,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 24,
  },
});
