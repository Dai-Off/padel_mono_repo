import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type RouteShellProps = {
  children: ReactNode;
  /** Color de la franja del status bar (antes layoutBackgroundColor de ScreenLayout). */
  backgroundColor?: string;
};

/**
 * Marco minimo de las rutas migradas: replica lo que ScreenLayout daba a los
 * overlays de MainApp (flex 1 + fondo + safe-area superior, sin header).
 * Las pantallas siguen pintando su propio header/fondo interno.
 */
export function RouteShell({ children, backgroundColor = '#0F0F0F' }: RouteShellProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor, paddingTop: insets.top }}>
      {children}
    </View>
  );
}
