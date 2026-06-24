import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { checkUsernameAvailable } from '../../api/auth';
import { fetchMyPlayerProfile, updateMyPlayerProfile } from '../../api/players';
import { AuthInput, AuthButton, ErrorBanner } from '../auth';
import { AppKeyboardAvoidingView } from '../ui/AppKeyboardAvoidingView';
import { validateUsernameLocal } from '../../lib/username';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';

function mapUsernameError(err: string, t: (key: string) => string): string {
  if (err === 'El usuario es obligatorio') return t('common.usernameRequired');
  if (err === 'No puede contener @') return t('common.usernameNoAt');
  if (err.startsWith('3–30')) return t('common.usernameFormat');
  return err;
}

type UsernameSetupModalProps = {
  visible: boolean;
  onComplete: () => void;
};

export function UsernameSetupModal({ visible, onComplete }: UsernameSetupModalProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const token = session?.access_token;
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const err = validateUsernameLocal(username);
    if (err) {
      setError(mapUsernameError(err, t));
      return;
    }
    const normalized = username.trim().toLowerCase();
    setLoading(true);
    setError('');
    try {
      const profile = await fetchMyPlayerProfile(token);
      const check = await checkUsernameAvailable(normalized, profile?.id);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      if (!check.available) {
        setError(t('profile.usernameInUse'));
        return;
      }
      const res = await updateMyPlayerProfile(token, { username: normalized });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onComplete();
    } catch {
      setError(t('common.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <AppKeyboardAvoidingView style={styles.root}>
        <Text style={styles.title}>{t('profile.fieldUsername')}</Text>
        <Text style={styles.subtitle}>{t('common.usernameFormat')}</Text>
        {error ? <ErrorBanner message={error} /> : null}
        <AuthInput
          label={t('profile.fieldUsername')}
          icon="at-outline"
          placeholder="tu_usuario"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={(t) => {
            setUsername(t.replace(/\s/g, '').toLowerCase());
            setError('');
          }}
          editable={!loading}
        />
        <AuthButton onPress={() => void handleSubmit()} loading={loading} disabled={loading}>
          {t('onboarding.levelModalNext')}
        </AuthButton>
        {loading ? (
          <ActivityIndicator color={theme.auth.accent} style={styles.spinner} />
        ) : null}
      </AppKeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    padding: 24,
    paddingTop: 64,
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  spinner: { marginTop: 16 },
});
