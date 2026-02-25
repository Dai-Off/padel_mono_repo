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
};

export function ScreenLayout({ children }: ScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const sidebar = useSidebar(false);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerWrapper}>
        <AppHeader
          leftSlot={<HamburgerButton onPress={sidebar.toggle} color="#1A1A1A" size={22} />}
          rightSlot={<NavbarActions />}
        />
      </View>
      <View style={styles.content}>{children}</View>
      <SidebarProvider close={sidebar.close}>
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
