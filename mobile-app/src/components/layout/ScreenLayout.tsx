import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SidebarProvider } from '../../contexts/SidebarContext';
import { useSidebar } from '../../hooks/useSidebar';
import { AppHeader } from './AppHeader';
import { HamburgerButton } from './HamburgerButton';
import { MobileSidebar } from './MobileSidebar';
import { NavbarActions } from './NavbarActions';
import { SidebarContent } from './SidebarContent';

type ScreenLayoutProps = {
  children: ReactNode;
  /** Cuando se proporciona, reemplaza el header por defecto (hamburger + acciones) */
  customHeader?: ReactNode;
  /** Cuando true, no se muestra header (la pantalla maneja su propio encabezado) */
  hideHeader?: boolean;
  /** Callback cuando el sidebar navega a "Tus pagos" */
  onNavigateToTusPagos?: () => void;
};

export function ScreenLayout({ children, customHeader, hideHeader, onNavigateToTusPagos }: ScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const sidebar = useSidebar(false);

  const header = customHeader ?? (
    <AppHeader
      leftSlot={<HamburgerButton onPress={sidebar.toggle} color="#1A1A1A" size={22} />}
      rightSlot={<NavbarActions />}
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {!hideHeader && (
        <View style={styles.headerWrapper}>
          {header}
        </View>
      )}
      <View style={styles.content}>{children}</View>
      <SidebarProvider close={sidebar.close} onNavigateToTusPagos={onNavigateToTusPagos}>
        <MobileSidebar visible={sidebar.isOpen} onClose={sidebar.close}>
          <SidebarContent />
        </MobileSidebar>
      </SidebarProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerWrapper: {
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
});
