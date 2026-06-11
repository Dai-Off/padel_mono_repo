import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuScreenHeader } from '../components/menuScreen/MenuScreenHeader';
import { MenuScreenOverlay } from '../components/menuScreen/MenuScreenOverlay';
import { MenuScreenRow } from '../components/menuScreen/MenuScreenRow';
import { MenuScreenSection } from '../components/menuScreen/MenuScreenSection';
import { ChangePasswordScreen } from './ChangePasswordScreen';
import { InfoContentScreen } from './InfoContentScreen';
import { useAuth } from '../contexts/AuthContext';
import { useHomeData } from '../contexts/HomeDataContext';
import { updateMyPlayerPreferences, type PlayerPreferences } from '../api/players';
import { registerOverlayNestedBack } from '../navigation/overlayBackRef';
import { theme } from '../theme';
import { type AppLocale, useTranslation } from '../i18n';
const BG = '#0F0F0F';

const DEFAULT_PREFERENCES: PlayerPreferences = {
  preferredSide: 'both',
  preferredScheduleSlots: [],
  preferredDays: [],
  preferredPlayStyle: 'balanced',
  preferredMatchDurationMin: 90,
  preferredPartnerLevel: 'any',
  favoriteClubs: [],
  notifNewMatches: true,
  notifTournamentReminders: true,
  notifClassUpdates: true,
  notifChatMessages: true,
};

const LANGUAGE_OPTIONS: { value: AppLocale; label: string }[] = [
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'zh-HK', label: '🇭🇰 繁體中文' },
];

type AjustesView = 'main' | 'notificaciones' | 'privacidad' | 'privacy-policy' | 'seguridad';

type AjustesScreenProps = {
  onBack: () => void;
};

function AjustesNotificacionesView({
  onBack,
  prefs,
  onToggle,
  saving,
}: {
  onBack: () => void;
  prefs: PlayerPreferences;
  onToggle: (next: PlayerPreferences) => void;
  saving: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <MenuScreenHeader title="Notificaciones" onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (insets.bottom ?? 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.configRows}>
          {(
            [
              { key: 'notifChatMessages' as const, title: 'Mensajes', icon: 'chatbubbles-outline' as const },
              { key: 'notifNewMatches' as const, title: 'Nuevos partidos', icon: 'trophy-outline' as const },
              { key: 'notifTournamentReminders' as const, title: 'Competiciones', icon: 'shield-outline' as const },
              { key: 'notifClassUpdates' as const, title: 'Clases', icon: 'school-outline' as const },
            ] as const
          ).map((item) => (
            <View key={item.key} style={styles.notifRow}>
              <View style={styles.notifRowLeft}>
                <Ionicons name={item.icon} size={18} color={theme.auth.textMuted} />
                <Text style={styles.notifRowTitle}>{item.title}</Text>
              </View>
              <Switch
                value={prefs[item.key]}
                onValueChange={(v) => onToggle({ ...prefs, [item.key]: v })}
                trackColor={{ true: 'rgba(241,143,52,0.4)', false: 'rgba(255,255,255,0.15)' }}
                thumbColor={prefs[item.key] ? theme.auth.accent : '#e5e7eb'}
              />
            </View>
          ))}
        </View>
        {saving ? <Text style={styles.savingHint}>Guardando…</Text> : null}
      </ScrollView>
    </View>
  );
}

function AjustesPrivacidadView({
  onBack,
  onOpenPolicy,
}: {
  onBack: () => void;
  onOpenPolicy: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <MenuScreenHeader title="Privacidad" onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (insets.bottom ?? 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.languageCard}>
          <Text style={styles.privacyText}>
            Controla qué información compartes y cómo se usa tu actividad en WeMatch.
          </Text>
          <Text style={[styles.privacyText, styles.privacyTextSpaced]}>
            Puedes gestionar clubes favoritos, preferencias de juego y visibilidad desde Preferencias
            en tu perfil.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.policyLink, pressed && { opacity: 0.9 }]}
            onPress={onOpenPolicy}
            accessibilityRole="button"
            accessibilityLabel="Ver política de privacidad completa"
          >
            <Text style={styles.policyLinkText}>Ver política de privacidad completa</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.auth.accent} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export function AjustesScreen({ onBack }: AjustesScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { profile, refreshProfile } = useHomeData();
  const { locale: language, setLocale } = useTranslation();
  const token = session?.access_token;

  const [view, setView] = useState<AjustesView>('main');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const basePrefs = useMemo<PlayerPreferences | null>(() => profile?.preferences ?? null, [profile]);
  const [prefs, setPrefs] = useState<PlayerPreferences | null>(basePrefs);
  const [savingNotifs, setSavingNotifs] = useState(false);

  useEffect(() => {
    setPrefs(basePrefs);
  }, [basePrefs]);

  const languageLabel =
    LANGUAGE_OPTIONS.find((o) => o.value === language)?.label ?? LANGUAGE_OPTIONS[0].label;

  const selectLanguage = (value: AppLocale) => {
    setLocale(value);
    setShowLanguagePicker(false);
  };

  const applyPrefs = async (next: PlayerPreferences) => {
    if (!token) return;
    setPrefs(next);
    setSavingNotifs(true);
    try {
      const res = await updateMyPlayerPreferences(token, next);
      if (res.ok) {
        await refreshProfile({ force: true });
      } else {
        setPrefs(basePrefs);
      }
    } finally {
      setSavingNotifs(false);
    }
  };

  useEffect(() => {
    if (view === 'main') {
      registerOverlayNestedBack(null);
      return;
    }
    registerOverlayNestedBack(() => {
      if (view === 'privacy-policy') {
        setView('privacidad');
        return true;
      }
      if (view === 'privacidad' || view === 'notificaciones' || view === 'seguridad') {
        setView('main');
        return true;
      }
      return false;
    });
    return () => registerOverlayNestedBack(null);
  }, [view]);

  if (view === 'seguridad') {
    return (
      <ChangePasswordScreen
        title="Seguridad"
        userEmail={session?.user?.email}
        onBack={() => setView('main')}
      />
    );
  }

  if (view === 'notificaciones') {
    return (
      <AjustesNotificacionesView
        onBack={() => setView('main')}
        prefs={prefs ?? DEFAULT_PREFERENCES}
        onToggle={(next) => void applyPrefs(next)}
        saving={savingNotifs}
      />
    );
  }

  if (view === 'privacy-policy') {
    return <InfoContentScreen screenId="privacy" onBack={() => setView('privacidad')} />;
  }

  if (view === 'privacidad') {
    return (
      <AjustesPrivacidadView
        onBack={() => setView('main')}
        onOpenPolicy={() => setView('privacy-policy')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <MenuScreenHeader title="Ajustes" onBack={onBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (insets.bottom ?? 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <MenuScreenSection title="Idioma">
          <View style={styles.languageCard}>
            <Text style={styles.languageLabel}>Idioma de la aplicación</Text>
            <Pressable
              style={({ pressed }) => [styles.languageSelect, pressed && styles.languageSelectPressed]}
              onPress={() => setShowLanguagePicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Seleccionar idioma"
            >
              <Text style={styles.languageSelectText}>{languageLabel}</Text>
              <Ionicons name="chevron-down" size={18} color={theme.auth.textMuted} />
            </Pressable>
            <Text style={styles.languageHint}>Selecciona el idioma de la aplicación</Text>
          </View>
        </MenuScreenSection>

        <MenuScreenSection title="Configuración">
          <View style={styles.configRows}>
            <MenuScreenRow
              title="Privacidad"
              icon="eye-outline"
              iconColors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)']}
              iconColor="#9ca3af"
              onPress={() => setView('privacidad')}
            />
            <MenuScreenRow
              title="Notificaciones"
              icon="notifications-outline"
              iconColors={['rgba(245,158,11,0.2)', 'rgba(202,138,4,0.1)']}
              iconColor="#fbbf24"
              onPress={() => setView('notificaciones')}
            />
            <MenuScreenRow
              title="Seguridad"
              icon="lock-closed-outline"
              iconColors={['rgba(239,68,68,0.2)', 'rgba(220,38,38,0.1)']}
              iconColor="#f87171"
              onPress={() => setView('seguridad')}
            />
          </View>
        </MenuScreenSection>

        <MenuScreenSection title="Zona de peligro" topSpacing>
          <Pressable
            style={({ pressed }) => [styles.dangerButton, pressed && { opacity: 0.92 }]}
            onPress={() => setShowDeleteConfirm(true)}
            accessibilityRole="button"
            accessibilityLabel="Eliminar tu cuenta"
          >
            <View style={styles.dangerIconBox}>
              <Ionicons name="log-out-outline" size={20} color="#f87171" />
            </View>
            <Text style={styles.dangerText}>Eliminar tu cuenta</Text>
          </Pressable>
        </MenuScreenSection>
      </ScrollView>

      <MenuScreenOverlay
        visible={showLanguagePicker}
        title="Idioma"
        onClose={() => setShowLanguagePicker(false)}
      >
        {LANGUAGE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={({ pressed }) => [
              styles.languageOption,
              language === opt.value && styles.languageOptionActive,
              pressed && { opacity: 0.9 },
            ]}
            onPress={() => void selectLanguage(opt.value)}
          >
            <Text style={styles.languageOptionText}>{opt.label}</Text>
            {language === opt.value ? (
              <Ionicons name="checkmark" size={18} color={theme.auth.accent} />
            ) : null}
          </Pressable>
        ))}
      </MenuScreenOverlay>

      <MenuScreenOverlay
        visible={showDeleteConfirm}
        title="Eliminar tu cuenta"
        onClose={() => setShowDeleteConfirm(false)}
      >
        <Text style={styles.modalText}>
          Esta acción es permanente. Si quieres eliminar tu cuenta, contacta con soporte desde la app
          o el club donde juegas habitualmente.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.modalBtnGhost, pressed && { opacity: 0.9 }]}
          onPress={() => setShowDeleteConfirm(false)}
        >
          <Text style={styles.modalBtnGhostText}>Entendido</Text>
        </Pressable>
      </MenuScreenOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, gap: 24 },
  languageCard: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
  },
  languageLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.auth.textSecondary,
    marginBottom: 8,
  },
  languageSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  languageSelectPressed: { opacity: 0.9 },
  languageSelectText: { fontSize: 15, color: '#fff', flex: 1 },
  languageHint: { fontSize: 12, color: '#4b5563', marginTop: 8 },
  configRows: { marginTop: 12, gap: 4 },
  dangerButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.15)',
  },
  dangerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { fontSize: 16, fontWeight: '600', color: '#f87171' },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  languageOptionActive: { borderColor: 'rgba(241,143,52,0.35)' },
  languageOptionText: { color: '#fff', fontSize: 15 },
  modalText: { color: theme.auth.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  modalBtnGhost: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  modalBtnGhostText: { color: '#fff', fontWeight: '700' },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  notifRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifRowTitle: { fontSize: 15, fontWeight: '600', color: '#fff' },
  savingHint: { marginTop: 8, paddingHorizontal: 4, color: theme.auth.textSecondary, fontSize: 12 },
  privacyText: { fontSize: 14, color: theme.auth.textSecondary, lineHeight: 20 },
  privacyTextSpaced: { marginTop: 12 },
  policyLink: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(241,143,52,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
  },
  policyLinkText: { fontSize: 14, fontWeight: '600', color: theme.auth.accent },
});
