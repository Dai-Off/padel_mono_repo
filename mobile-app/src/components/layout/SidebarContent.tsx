import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebarContext } from '../../contexts/SidebarContext';

function getInitials(fullName?: string | null, email?: string): string {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0]?.toUpperCase() ?? '';
  }
  return email?.[0]?.toUpperCase() ?? '?';
}

function SidebarUserHeader() {
  const ctx = useSidebarContext();
  const { session } = useAuth();
  const close = ctx?.close;
  const name = session?.user?.user_metadata?.full_name ?? null;
  const email = session?.user?.email ?? '';
  const initials = getInitials(name, email);
  const displayName = name?.trim() || email || 'Usuario';

  return (
    <Pressable
      style={({ pressed }) => [styles.userSection, pressed && styles.userSectionPressed]}
      onPress={close}
      accessibilityLabel="Perfil de usuario"
    >
      <View style={styles.userRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.userSubtitle}>Cuenta estándar</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9ca3af" style={styles.chevron} />
        <Pressable onPress={close} hitSlop={12} accessibilityLabel="Cerrar menú">
          <Ionicons name="close" size={24} color="#9ca3af" />
        </Pressable>
      </View>
    </Pressable>
  );
}

type SidebarRowItemProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  onPress?: () => void;
};

function SidebarRowItem({ icon, title, subtitle, onPress }: SidebarRowItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.rowItem, pressed && styles.rowItemPressed]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color="#4b5563" style={styles.rowIcon} />
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle != null && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </Pressable>
  );
}

type SidebarSectionProps = {
  title: string;
  children: React.ReactNode;
  noTopBorder?: boolean;
};

function SidebarSection({ title, children, noTopBorder }: SidebarSectionProps) {
  return (
    <View style={[styles.section, noTopBorder && styles.sectionNoTopBorder]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function SidebarContent() {
  const insets = useSafeAreaInsets();
  const ctx = useSidebarContext();
  const { logout } = useAuth();
  const close = ctx?.close;

  const handleLogout = async () => {
    close?.();
    await logout();
  };

  return (
    <View style={styles.container}>
      <SidebarUserHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (insets.bottom ?? 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <SidebarSection title="Tu cuenta" noTopBorder>
          <SidebarRowItem
            icon="person-outline"
            title="Editar perfil"
            subtitle="Edita nombre, correo, teléfono, ubicación, ..."
            onPress={close}
          />
          <SidebarRowItem
            icon="trophy-outline"
            title="Tu actividad"
            subtitle="Partidos, clases, competiciones, grupos"
            onPress={close}
          />
          <SidebarRowItem
            icon="wallet-outline"
            title="Tus pagos"
            subtitle="Métodos de pago y transacciones"
            onPress={close}
          />
          <SidebarRowItem
            icon="settings-outline"
            title="Ajustes"
            subtitle="Privacidad y notificaciones"
            onPress={close}
          />
        </SidebarSection>

        <SidebarSection title="Soporte">
          <SidebarRowItem icon="help-circle-outline" title="Ayuda" onPress={close} />
          <SidebarRowItem icon="phone-portrait-outline" title="Cómo funciona CourtHub" onPress={close} />
        </SidebarSection>

        <SidebarSection title="Información legal">
          <SidebarRowItem icon="document-text-outline" title="Condiciones de uso" onPress={close} />
          <SidebarRowItem icon="eye-outline" title="Política de privacidad" onPress={close} />
        </SidebarSection>

        <View style={[styles.section, styles.logoutSection]}>
          <Pressable
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
            onPress={handleLogout}
          >
            <Ionicons name="power" size={20} color="#e31e24" style={styles.rowIcon} />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  userSection: { padding: 16, backgroundColor: '#fff' },
  userSectionPressed: { backgroundColor: '#f9fafb' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { fontWeight: '600', color: '#111827', fontSize: 16 },
  userSubtitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  chevron: { marginRight: 4 },
  scroll: { flex: 1 },
  scrollContent: {},
  section: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  sectionNoTopBorder: { borderTopWidth: 0 },
  sectionTitle: {
    paddingHorizontal: 16,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowItemPressed: { backgroundColor: '#f9fafb' },
  rowIcon: { marginRight: 0 },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '500', color: '#111827' },
  rowSubtitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  logoutSection: {},
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  logoutButtonPressed: { backgroundColor: '#fef2f2' },
  logoutText: { fontSize: 16, fontWeight: '500', color: '#e31e24' },
});
