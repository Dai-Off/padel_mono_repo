import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AuthLayout,
  AuthBrand,
  AuthInput,
  AuthButton,
  ErrorBanner,
  AuthFormLink,
  AuthFooter,
} from '../components/auth';
import { applyRecoveryPassword } from '../api/auth';
import { useTranslation } from '../i18n';
import { theme } from '../theme';

export type RecoveryPayload = {
  access_token?: string;
  refresh_token?: string;
  token_hash?: string;
};

type ResetPasswordScreenProps = {
  recovery: RecoveryPayload;
  onBackToLogin: () => void;
};

export function ResetPasswordScreen({ recovery, onBackToLogin }: ResetPasswordScreenProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const hasCredential = !!recovery.token_hash || !!recovery.access_token;

  const handleSubmit = async () => {
    if (!hasCredential) {
      setError(t('auth.resetIncompleteLink'));
      return;
    }
    if (password.length < 6) {
      setError(t('common.passwordMin6'));
      return;
    }
    if (password !== confirm) {
      setError(t('common.passwordsMismatch'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await applyRecoveryPassword({
        password,
        access_token: recovery.access_token,
        refresh_token: recovery.refresh_token,
        token_hash: recovery.token_hash,
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(res.error ?? t('auth.resetUpdateError'));
      }
    } catch {
      setError(t('common.connectionErrorServer'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout scrollable>
      <View style={styles.brandSection}>
        <AuthBrand variant="logoOnly" />
      </View>

      <View style={styles.formSection}>
        {error ? <ErrorBanner message={error} variant="error" /> : null}
        {success ? (
          <ErrorBanner
            message={t('auth.resetSuccess')}
            variant="info"
          />
        ) : null}

        {!success ? (
          <>
            <AuthInput
              label={t('auth.resetNewPasswordLabel')}
              icon="lock-closed-outline"
              placeholder={t('auth.resetNewPasswordPlaceholder')}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />
            <AuthInput
              label={t('auth.confirmPasswordLabel')}
              icon="lock-closed-outline"
              placeholder={t('auth.resetConfirmPlaceholder')}
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
              editable={!loading}
            />

            <View style={{ marginTop: 20 }}>
              <AuthButton
                onPress={handleSubmit}
                loading={loading}
                disabled={loading || !hasCredential}
                icon="checkmark-circle-outline"
              >
                {t('auth.resetSavePassword')}
              </AuthButton>
            </View>
          </>
        ) : null}

        <AuthFormLink
          prompt={success ? t('auth.resetReadyPrompt') : t('auth.resetPreferBackPrompt')}
          action={success ? t('auth.resetGoLogin') : t('auth.resetBackLogin')}
          onPress={onBackToLogin}
          disabled={loading}
        />
      </View>

      <AuthFooter />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  brandSection: {
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.lg,
    alignItems: 'center',
  },
  formSection: {
    flexGrow: 1,
    width: '100%',
  },
});
