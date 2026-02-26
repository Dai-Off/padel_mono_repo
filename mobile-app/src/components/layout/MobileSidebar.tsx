import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type MobileSidebarProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function MobileSidebar({ visible, onClose, children }: MobileSidebarProps) {
  const insets = useSafeAreaInsets();
  const sidebarWidth = Dimensions.get('window').width;
  const sidebarTop = insets.top ?? 0;
  const slideAnim = useRef(new Animated.Value(-sidebarWidth)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: visible ? 0 : -sidebarWidth,
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
  }, [visible, slideAnim, backdropAnim, sidebarWidth]);

  const backdropOpacity = backdropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.overlay]}
      pointerEvents={visible ? 'box-none' : 'none'}
    >
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
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
            width: sidebarWidth,
            top: sidebarTop,
            bottom: 0,
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
  overlay: { zIndex: 20 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 16,
  },
});
