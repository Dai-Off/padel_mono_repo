import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { login } from '../api/auth';
import { theme } from '../theme';

type LoginScreenProps = {
  onGoToRegister: () => void;
};

export function LoginScreen({ onGoToRegister }: LoginScreenProps) {
  const { setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | undefined>();

  const handleSubmit = async () => {
    const e = email.trim();
    const p = password;

    if (!e || !p) {
      setError('Email y contraseña son obligatorios');
      return;
    }

    setError('');
    setErrorCode(undefined);
    setLoading(true);

    try {
      const res = await login(e, p);

      if (res.ok && res.user && res.session) {
        setSession({
          access_token: res.session.access_token,
          refresh_token: res.session.refresh_token,
          user: res.user,
        });
      } else {
        setError(res.error ?? 'Error al iniciar sesión');
        setErrorCode(res.error_code);
      }
    } catch {
      setError('Error de conexión. ¿Está el backend corriendo?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandEmoji}>🎾</Text>
          </View>
          <Text style={styles.brandTitle}>WeMatch</Text>
          <Text style={styles.brandSub}>Inicia sesión para buscar y crear partidos</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.title}>Iniciar sesión</Text>

          {error ? (
            <View style={[styles.errorBanner, errorCode === 'EMAIL_NOT_CONFIRMED' && styles.errorBannerInfo]}>
              <Ionicons
                name={errorCode === 'EMAIL_NOT_CONFIRMED' ? 'information-circle' : 'alert-circle'}
                size={18}
                color={errorCode === 'EMAIL_NOT_CONFIRMED' ? '#2563eb' : '#E31E24'}
              />
              <Text
                style={[
                  styles.errorText,
                  errorCode === 'EMAIL_NOT_CONFIRMED' && styles.errorTextInfo,
                ]}
              >
                {error}
              </Text>
            </View>
          ) : null}

          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(''); setErrorCode(undefined); }}
              editable={!loading}
            />
          </View>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={(t) => { setPassword(t); setError(''); setErrorCode(undefined); }}
              editable={!loading}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#fff" style={styles.buttonIcon} />
                <Text style={styles.buttonText}>Iniciar sesión</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={onGoToRegister}
            disabled={loading}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={styles.linkText}>
              ¿No tienes cuenta?{' '}
              <Text style={styles.linkTextBold}>Regístrate</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
  },
  brand: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(227, 30, 36, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  brandEmoji: {
    fontSize: 32,
  },
  brandTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  brandSub: {
    fontSize: theme.fontSize.sm,
    color: '#6b7280',
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: theme.spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(227, 30, 36, 0.1)',
    borderRadius: 12,
    marginBottom: theme.spacing.md,
  },
  errorBannerInfo: {
    backgroundColor: '#eff6ff',
  },
  errorText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: '#E31E24',
    fontWeight: '500',
  },
  errorTextInfo: {
    color: '#2563eb',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    marginBottom: theme.spacing.md,
  },
  inputIcon: {
    marginLeft: 16,
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 8,
    paddingRight: 16,
    fontSize: theme.fontSize.base,
    color: '#1A1A1A',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: '#E31E24',
    borderRadius: 16,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
  link: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  linkText: {
    fontSize: theme.fontSize.sm,
    color: '#6b7280',
  },
  linkTextBold: {
    fontWeight: '600',
    color: '#1A1A1A',
  },
  pressed: {
    opacity: 0.9,
  },
});
