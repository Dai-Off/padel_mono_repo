import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from './AppHeader';
import { HamburgerButton } from './HamburgerButton';
import { NavbarActions, type NavbarActionsCallbacks } from './NavbarActions';

/** Control del menú lateral (estado vive en MainApp para cubrir también la navbar inferior). */
export type ScreenLayoutSidebar = {
  toggle: () => void;
  close: () => void;
};

type ScreenLayoutProps = {
  children: ReactNode;
  customHeader?: ReactNode;
  hideHeader?: boolean;
  sidebar: ScreenLayoutSidebar;
  /** Fondo del layout (p. ej. #000 en home con header glass). Por defecto blanco. */
  layoutBackgroundColor?: string;
  /** Acciones de la navbar por defecto (icono mensajes, etc.). */
  navbarActions?: NavbarActionsCallbacks;
};

export function ScreenLayout({
  children,
  customHeader,
  hideHeader,
  sidebar,
  layoutBackgroundColor = '#fff',
  navbarActions,
}: ScreenLayoutProps) {
  const insets = useSafeAreaInsets();

  const header = customHeader ?? (
    <AppHeader
      leftSlot={<HamburgerButton onPress={sidebar.toggle} color="#fff" size={22} />}
      rightSlot={<NavbarActions {...navbarActions} />}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: layoutBackgroundColor }]}>
      <View style={[styles.main, { paddingTop: insets.top }]}>
        {!hideHeader && (
          <View style={styles.headerWrapper}>
            {header}
          </View>
        )}
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  main: {
    flex: 1,
    minHeight: 0,
  },
  headerWrapper: {
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
  },
});
