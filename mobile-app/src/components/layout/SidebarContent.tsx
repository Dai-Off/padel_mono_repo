import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebarContext } from '../../contexts/SidebarContext';
import { theme } from '../../theme';

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
    <View style={styles.userSection}>
      <View style={styles.userRow}>
        <Pressable
          style={({ pressed }) => [styles.userInfoWrap, pressed && styles.userSectionPressed]}
          onPress={close}
          accessibilityLabel="Perfil de usuario"
        >
          <View style={styles.avatarWrap}>
            <LinearGradient
              colors={[theme.sidebar.avatarGradientFrom, theme.sidebar.avatarGradientTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
            <View style={styles.statusDot} />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.userSubtitle}>Cuenta estándar</Text>
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
          onPress={close}
          accessibilityLabel="Cerrar menú"
        >
          <Ionicons name="close" size={20} color={theme.auth.textMuted} />
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [styles.inviteButton, pressed && styles.inviteButtonPressed]}
        onPress={close}
        accessibilityLabel="Invitar amigos"
      >
        <Ionicons name="share-social-outline" size={16} color={theme.auth.textMuted} />
        <Text style={styles.inviteButtonText}>Invitar amigos</Text>
      </Pressable>
    </View>
  );
}

type IconVariant = keyof typeof theme.sidebar.iconVariants;

type SidebarRowItemProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  iconVariant?: IconVariant;
  onPress?: () => void;
};

function SidebarRowItem({ icon, title, subtitle, iconVariant = 'neutral', onPress }: SidebarRowItemProps) {
  const variant = theme.sidebar.iconVariants[iconVariant];
  return (
    <Pressable
      style={({ pressed }) => [styles.rowItem, pressed && styles.rowItemPressed]}
      onPress={onPress}
    >
      <LinearGradient
        colors={[variant.from, variant.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.rowIconBox}
      >
        <Ionicons name={icon} size={20} color={variant.color} />
      </LinearGradient>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle != null && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#6b7280" style={styles.rowChevron} />
    </Pressable>
  );
}

type SidebarSectionProps = {
  title: string;
  children: React.ReactNode;
};

function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <LinearGradient
          colors={['rgba(241,143,52,0.2)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.sectionTitleLine}
        />
      </View>
      <View style={styles.sectionItems}>{children}</View>
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <SidebarUserHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (insets.bottom ?? 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <SidebarSection title="Tu cuenta">
          <SidebarRowItem
            icon="person-outline"
            title="Editar perfil"
            subtitle="Edita nombre, correo, teléfono, ubicación, ..."
            iconVariant="orange"
            onPress={close}
          />
          <SidebarRowItem
            icon="trophy-outline"
            title="Tu actividad"
            subtitle="Partidos, clases, competiciones, grupos"
            iconVariant="purple"
            onPress={close}
          />
          <SidebarRowItem
            icon="wallet-outline"
            title="Tus pagos"
            subtitle="Transacciones, reembolsos y métodos de pago"
            iconVariant="emerald"
            onPress={() => {
              close?.();
              ctx?.onNavigateToTusPagos?.();
            }}
          />
          <SidebarRowItem
            icon="settings-outline"
            title="Ajustes"
            subtitle="Configura privacidad, notificaciones, segu..."
            iconVariant="sky"
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

        <View style={styles.logoutSection}>
          <Pressable
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
            onPress={handleLogout}
          >
            <View style={styles.logoutIconBox}>
              <Ionicons name="power" size={20} color="#f87171" />
            </View>
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.sidebar.bg },
  userSection: {
    padding: 20,
    paddingBottom: 16,
    backgroundColor: theme.sidebar.bg,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  userInfoWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  userSectionPressed: { opacity: 0.9 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.auth.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarText: { color: theme.auth.text, fontSize: 18, fontWeight: '700' },
  statusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: theme.sidebar.bg,
  },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { fontWeight: '700', color: theme.auth.text, fontSize: 16 },
  userSubtitle: { fontSize: 12, color: theme.auth.textSecondary, marginTop: 2 },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.sidebar.buttonBg,
    borderWidth: 1,
    borderColor: theme.sidebar.buttonBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeButtonPressed: { opacity: 0.8 },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: theme.sidebar.buttonBg,
    borderWidth: 1,
    borderColor: theme.sidebar.buttonBorder,
  },
  inviteButtonPressed: { opacity: 0.8 },
  inviteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.auth.textMuted,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  section: {
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: theme.auth.accent,
    textTransform: 'uppercase',
  },
  sectionTitleLine: {
    flex: 1,
    height: 1,
    borderRadius: 1,
  },
  sectionItems: {
    gap: 4,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
    borderRadius: 16,
  },
  rowItemPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  rowIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: theme.auth.text },
  rowSubtitle: { fontSize: 12, color: theme.auth.textSecondary, marginTop: 2 },
  rowChevron: { marginLeft: 4 },
  logoutSection: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.15)',
  },
  logoutButtonPressed: { backgroundColor: 'rgba(239,68,68,0.12)' },
  logoutIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#f87171' },
});
