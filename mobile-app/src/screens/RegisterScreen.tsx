import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { register, checkUsernameAvailable, checkEmailAvailable } from '../api/auth';
import { authErrorMessage } from '../lib/authErrors';
import { validateUsernameLocal, normalizeUsernameInput } from '../lib/username';
import {
  AuthLayout,
  AuthBrand,
  AuthInput,
  AuthButton,
  ErrorBanner,
  AuthFormLink,
  AuthFooter,
  ExistingAccountModal,
} from '../components/auth';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

type RegisterScreenProps = {
  /** Ir a login; opcionalmente con el email prefijado (editable) en el input. */
  onGoToLogin: (email?: string) => void;
};

type FieldStatus = { type: 'idle' | 'checking' | 'valid' | 'invalid'; msg?: string; code?: 'taken' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALIDATION_DEBOUNCE_MS = 700;

export function RegisterScreen({ onGoToLogin }: RegisterScreenProps) {
  const { t } = useTranslation();
  const { setSession } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmMessage, setShowConfirmMessage] = useState(false);
  const [showExistingAccount, setShowExistingAccount] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<FieldStatus>({ type: 'idle' });
  const [emailStatus, setEmailStatus] = useState<FieldStatus>({ type: 'idle' });
  const usernameSeq = useRef(0);
  const emailSeq = useRef(0);

  const clearError = () => setError('');

  // Validación en vivo del username. Mientras escribe se mantiene neutro (idle): el
  // formato y la disponibilidad solo se evalúan tras la pausa (debounce), para no marcar
  // "error" al teclear las primeras letras.
  useEffect(() => {
    const v = normalizeUsernameInput(username);
    if (!v) {
      usernameSeq.current++; // invalida respuestas en vuelo (no repintar sobre campo vacío)
      setUsernameStatus({ type: 'idle' });
      return;
    }
    setUsernameStatus({ type: 'idle' });
    const seq = ++usernameSeq.current;
    const timer = setTimeout(async () => {
      if (seq !== usernameSeq.current) return;
      const localErr = validateUsernameLocal(username);
      if (localErr) {
        setUsernameStatus({ type: 'invalid', msg: t(localErr) });
        return;
      }
      setUsernameStatus({ type: 'checking' });
      const res = await checkUsernameAvailable(v);
      if (seq !== usernameSeq.current) return; // respuesta obsoleta
      if (!res.ok) {
        setUsernameStatus({ type: 'idle' }); // fallo de red: no bloquear
        return;
      }
      setUsernameStatus(
        res.available
          ? { type: 'valid', msg: t('auth.usernameAvailable') }
          : { type: 'invalid', msg: t('auth.usernameTaken') },
      );
    }, VALIDATION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [username, t]);

  // Validación en vivo del email: mismo criterio (neutro mientras escribe; formato + ya
  // registrado tras la pausa).
  useEffect(() => {
    const v = email.trim().toLowerCase();
    if (!v) {
      emailSeq.current++; // invalida respuestas en vuelo (no repintar sobre campo vacío)
      setEmailStatus({ type: 'idle' });
      return;
    }
    setEmailStatus({ type: 'idle' });
    const seq = ++emailSeq.current;
    const timer = setTimeout(async () => {
      if (seq !== emailSeq.current) return;
      if (!EMAIL_RE.test(v)) {
        setEmailStatus({ type: 'invalid', msg: t('auth.emailInvalid') });
        return;
      }
      setEmailStatus({ type: 'checking' });
      const res = await checkEmailAvailable(v);
      if (seq !== emailSeq.current) return;
      if (!res.ok) {
        setEmailStatus({ type: 'idle' }); // fallo de red: neutro (coherente con username)
        return;
      }
      setEmailStatus(
        res.available ? { type: 'valid' } : { type: 'invalid', msg: t('auth.emailTaken'), code: 'taken' },
      );
    }, VALIDATION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [email, t]);

  const handleSubmit = async () => {
    const e = email.trim();
    const p = password;
    const cp = confirmPassword;

    const usernameErr = validateUsernameLocal(username);
    if (usernameErr) {
      setError(t(usernameErr));
      return;
    }

    if (!e || !p) {
      setError(t('common.emailPasswordRequired'));
      return;
    }

    if (p.length < 6) {
      setError(t('common.passwordMin6'));
      return;
    }

    if (p !== cp) {
      setError(t('common.passwordsMismatch'));
      return;
    }

    clearError();
    setLoading(true);

    try {
      const res = await register(e, p, username.trim().toLowerCase(), name.trim() || undefined);

      if (res.ok && res.user) {
        if (res.session) {
          setSession({
            access_token: res.session.access_token,
            refresh_token: res.session.refresh_token,
            expires_at: res.session.expires_at,
            user: res.user,
          });
        } else {
          setEmail('');
          setPassword('');
          setConfirmPassword('');
          setName('');
          setUsername('');
          clearError();
          setShowConfirmMessage(true);
        }
      } else if (res.error_code === 'EMAIL_ALREADY_REGISTERED') {
        // Email ya registrado: en vez de un banner de error, un modal con salida a login.
        clearError();
        setShowExistingAccount(true);
      } else {
        setError(authErrorMessage(t, res, 'auth.registerError'));
      }
    } catch {
      setError(t('common.connectionErrorBackend'));
    } finally {
      setLoading(false);
    }
  };

  if (showConfirmMessage) {
    return (
      <AuthLayout>
        <View style={styles.confirmContent}>
          <View style={styles.confirmIcon}>
            <Ionicons name="mail-open-outline" size={40} color={theme.auth.accent} />
          </View>
          <Text style={styles.confirmTitle}>{t('auth.confirmEmailTitle')}</Text>
          <Text style={styles.confirmText}>
            {t('auth.confirmEmailBody')}
          </Text>
          <Text style={styles.confirmHint}>
            {t('auth.confirmEmailSpam')}
          </Text>
          <AuthButton
            onPress={() => {
              setShowConfirmMessage(false);
              onGoToLogin();
            }}
            icon="log-in-outline"
          >
            {t('auth.goToLogin')}
          </AuthButton>
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout scrollable>
      <AuthBrand variant="logoOnly" />

      {error ? <ErrorBanner message={error} /> : null}

      <AuthInput
        label={t('auth.nameOptionalLabel')}
        icon="person-outline"
        placeholder={t('auth.namePlaceholder')}
        autoCapitalize="words"
        autoComplete="name"
        value={name}
        onChangeText={(text) => { setName(text); clearError(); }}
        editable={!loading}
      />

      <AuthInput
        label={t('auth.usernameLabel')}
        icon="at-outline"
        placeholder={t('auth.usernamePlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={(text) => {
          setUsername(text.replace(/\s/g, '').toLowerCase());
          clearError();
        }}
        editable={!loading}
        checking={usernameStatus.type === 'checking'}
        hintText={usernameStatus.msg}
        hintType={usernameStatus.type === 'valid' ? 'success' : usernameStatus.type === 'invalid' ? 'error' : undefined}
      />

      <AuthInput
        label={t('auth.emailLabel')}
        icon="mail-outline"
        placeholder={t('auth.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={email}
        onChangeText={(text) => { setEmail(text); clearError(); }}
        editable={!loading}
        checking={emailStatus.type === 'checking'}
        hintText={emailStatus.msg}
        hintType={emailStatus.type === 'valid' ? 'success' : emailStatus.type === 'invalid' ? 'error' : undefined}
        hintActionLabel={emailStatus.code === 'taken' ? t('auth.emailTakenLogin') : undefined}
        onHintActionPress={emailStatus.code === 'taken' ? () => onGoToLogin(email.trim()) : undefined}
      />

      <AuthInput
        label={t('auth.passwordLabel')}
        icon="lock-closed-outline"
        placeholder={t('auth.passwordMinPlaceholder')}
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={(text) => { setPassword(text); clearError(); }}
        editable={!loading}
      />

      <AuthInput
        label={t('auth.confirmPasswordLabel')}
        icon="lock-closed-outline"
        placeholder={t('auth.passwordPlaceholder')}
        secureTextEntry
        autoComplete="new-password"
        value={confirmPassword}
        onChangeText={(text) => { setConfirmPassword(text); clearError(); }}
        editable={!loading}
      />

      <AuthButton
        onPress={handleSubmit}
        loading={loading}
        disabled={loading}
        icon="person-add-outline"
      >
        {t('auth.registerTitle')}
      </AuthButton>

      <AuthFormLink
        prompt={t('auth.hasAccountPrompt')}
        action={t('auth.loginLink')}
        onPress={() => onGoToLogin()}
        disabled={loading}
      />

      <AuthFooter />

      <ExistingAccountModal
        visible={showExistingAccount}
        onLogin={() => {
          setShowExistingAccount(false);
          onGoToLogin(email.trim());
        }}
        onClose={() => setShowExistingAccount(false)}
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  confirmContent: {
    flex: 1,
    paddingVertical: theme.spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${theme.auth.accent}26`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  confirmTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: theme.auth.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  confirmText: {
    fontSize: theme.fontSize.base,
    color: theme.auth.textMuted,
    lineHeight: 24,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  confirmHint: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textSecondary,
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
  },
});
