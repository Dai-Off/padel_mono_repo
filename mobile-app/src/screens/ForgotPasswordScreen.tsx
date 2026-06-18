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
import { forgotPassword } from '../api/auth';
import { useTranslation } from '../i18n';
import { theme } from '../theme';

type ForgotPasswordScreenProps = {
  onBackToLogin: () => void;
};

export function ForgotPasswordScreen({ onBackToLogin }: ForgotPasswordScreenProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    const e = email.trim();
    if (!e) {
      setError(t('auth.forgotEmailRequired'));
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const res = await forgotPassword(e, { client: 'mobile' });
      if (res.ok) {
        setSuccess(true);
      } else if (res.httpStatus === 429) {
        setError(res.error ?? t('common.tooManyAttempts'));
      } else {
        setError(res.error ?? t('auth.forgotError'));
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
            message={t('auth.forgotSuccess')} 
            variant="info" 
          />
        ) : null}

        {!success ? (
          <>
            <AuthInput
              label={t('auth.emailLabel')}
              icon="mail-outline"
              placeholder={t('auth.emailPlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />

            <View style={{ marginTop: 20 }}>
              <AuthButton
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                icon="mail-unread-outline"
              >
                {t('auth.forgotTitle')}
              </AuthButton>
            </View>
          </>
        ) : null}

        <AuthFormLink
          prompt={t('auth.forgotRememberPrompt')}
          action={t('auth.forgotBackLink')}
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
