import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { changePassword, forgotPassword } from '../api/auth';
import { MenuScreenHeader } from '../components/menuScreen/MenuScreenHeader';
import { SafeScrollView } from '../components/ui/SafeScrollView';
import { useTranslation } from '../i18n';
import { theme } from '../theme';

const CARD = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.08)';

type ChangePasswordScreenProps = {
  onBack: () => void;
  userEmail?: string | null;
  title?: string;
};

export function ChangePasswordScreen({
  onBack,
  userEmail,
  title,
}: ChangePasswordScreenProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('auth.changePasswordTitle');
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async () => {
    const token = session?.access_token;
    const refresh = session?.refresh_token;
    if (!token || !refresh) {
      setError(t('common.sessionExpired'));
      return;
    }
    if (password.length < 6) {
      setError(t('common.passwordMin6Dot'));
      return;
    }
    if (password !== confirm) {
      setError(t('common.passwordsMismatchDot'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await changePassword(token, refresh, password);
      if (res.ok) {
        setSuccess(true);
        setPassword('');
        setConfirm('');
      } else {
        setError(res.error ?? t('auth.resetUpdateError'));
      }
    } catch {
      setError(t('common.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendRecoveryEmail = async () => {
    const email = userEmail?.trim() || session?.user?.email?.trim();
    if (!email) {
      setError(t('auth.changePasswordNoEmail'));
      return;
    }
    setSendingEmail(true);
    setError(null);
    try {
      const res = await forgotPassword(email, { client: 'mobile' });
      if (res.ok) {
        setEmailSent(true);
      } else if (res.httpStatus === 429) {
        setError(res.error ?? t('common.tooManyAttempts'));
      } else {
        setError(res.error ?? t('auth.changePasswordEmailError'));
      }
    } catch {
      setError(t('common.connectionError'));
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <View style={styles.root}>
      <MenuScreenHeader title={resolvedTitle} onBack={onBack} />
      <SafeScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.intro}>
            {t('auth.changePasswordIntro')}
          </Text>

          {success ? (
            <View style={styles.bannerOk}>
              <Ionicons name="checkmark-circle" size={20} color="#34d399" />
              <Text style={styles.bannerOkText}>{t('auth.changePasswordSuccess')}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.bannerErr}>
              <Text style={styles.bannerErrText}>{error}</Text>
            </View>
          ) : null}

          {!success ? (
            <>
              <Text style={styles.label}>{t('auth.resetNewPasswordLabel')}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.resetNewPasswordPlaceholder')}
                placeholderTextColor="#6B7280"
                secureTextEntry
                autoCapitalize="none"
                editable={!loading}
              />
              <Text style={styles.label}>{t('auth.confirmPasswordLabel')}</Text>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder={t('auth.resetConfirmPlaceholder')}
                placeholderTextColor="#6B7280"
                secureTextEntry
                autoCapitalize="none"
                editable={!loading}
              />

              <Pressable
                style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed, loading && styles.saveBtnDisabled]}
                onPress={() => void handleSubmit()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>{t('auth.changePasswordSave')}</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
              onPress={onBack}
            >
              <Text style={styles.saveBtnText}>{t('auth.changePasswordBackProfile')}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('auth.changePasswordAlternative')}</Text>
          <Text style={styles.altHint}>
            {t('auth.changePasswordAltHint')}
            {userEmail || session?.user?.email ? ` (${userEmail ?? session?.user?.email})` : ''}.
          </Text>
          {emailSent ? (
            <Text style={styles.emailSent}>
              {t('auth.changePasswordEmailSent')}
            </Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.altBtn, pressed && styles.pressed, sendingEmail && styles.saveBtnDisabled]}
            onPress={() => void handleSendRecoveryEmail()}
            disabled={sendingEmail}
          >
            {sendingEmail ? (
              <ActivityIndicator size="small" color={theme.auth.accent} />
            ) : (
              <>
                <Ionicons name="mail-outline" size={18} color={theme.auth.accent} />
                <Text style={styles.altBtnText}>{t('auth.changePasswordSendLink')}</Text>
              </>
            )}
          </Pressable>
        </View>
      </SafeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.auth.bg },
  scroll: { flex: 1 },
  section: {
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 4,
  },
  intro: {
    color: theme.auth.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: theme.auth.accent,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  label: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  saveBtn: {
    marginTop: 20,
    backgroundColor: theme.auth.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  altHint: { color: theme.auth.textMuted, fontSize: 13, lineHeight: 20 },
  altBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  altBtnText: { color: theme.auth.accent, fontSize: 14, fontWeight: '600' },
  emailSent: { color: '#34d399', fontSize: 12, marginTop: 10, lineHeight: 18 },
  bannerOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.12)',
    marginBottom: 8,
  },
  bannerOkText: { flex: 1, color: '#34d399', fontSize: 13 },
  bannerErr: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(227,30,36,0.12)',
    marginBottom: 8,
  },
  bannerErrText: { color: theme.auth.error, fontSize: 13 },
  pressed: { opacity: 0.85 },
});
