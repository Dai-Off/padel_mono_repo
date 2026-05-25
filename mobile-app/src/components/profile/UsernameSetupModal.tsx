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
import { validateUsernameLocal } from '../../lib/username';
import { theme } from '../../theme';

type UsernameSetupModalProps = {
  visible: boolean;
  onComplete: () => void;
};

export function UsernameSetupModal({ visible, onComplete }: UsernameSetupModalProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const err = validateUsernameLocal(username);
    if (err) {
      setError(err);
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
        setError('Este usuario ya está en uso');
        return;
      }
      const res = await updateMyPlayerProfile(token, { username: normalized });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onComplete();
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.root}>
        <Text style={styles.title}>Elige tu usuario</Text>
        <Text style={styles.subtitle}>
          Es tu identificador público en la app. Solo puedes usar letras minúsculas, números y _.
        </Text>
        {error ? <ErrorBanner message={error} /> : null}
        <AuthInput
          label="Usuario"
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
          Continuar
        </AuthButton>
        {loading ? (
          <ActivityIndicator color={theme.auth.accent} style={styles.spinner} />
        ) : null}
      </View>
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
