import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { login } from '../api/auth';
import {
  AuthLayout,
  AuthBrand,
  AuthInput,
  AuthButton,
  ErrorBanner,
  AuthFormLink,
  AuthFooter,
} from '../components/auth';
import { theme } from '../theme';

type LoginScreenProps = {
  onGoToRegister: () => void;
};

export function LoginScreen({ onGoToRegister }: LoginScreenProps) {
  const { setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | undefined>();

  const clearError = () => {
    setError('');
    setErrorCode(undefined);
  };

  const handleSubmit = async () => {
    const e = email.trim();
    const p = password;

    if (!e || !p) {
      setError('Email y contraseña son obligatorios');
      return;
    }

    clearError();
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
    <AuthLayout>
      <View style={styles.brandSection}>
        <AuthBrand variant="logoOnly" />
      </View>

      <View style={styles.formSection}>
        {error ? (
          <ErrorBanner
            message={error}
            variant={errorCode === 'EMAIL_NOT_CONFIRMED' ? 'info' : 'error'}
          />
        ) : null}

        <AuthInput
          label="Correo Electrónico"
          icon="mail-outline"
          placeholder="tu@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={(t) => { setEmail(t); clearError(); }}
          editable={!loading}
        />

        <AuthInput
          label="Contraseña"
          icon="lock-closed-outline"
          placeholder="••••••••"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={(t) => { setPassword(t); clearError(); }}
          editable={!loading}
        />

        <View style={styles.extras}>
          <Pressable
            style={({ pressed }) => [styles.checkboxWrap, pressed && styles.pressed]}
            onPress={() => setRememberMe(!rememberMe)}
            disabled={loading}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe ? (
                <Ionicons name="checkmark" size={14} color={theme.auth.accent} />
              ) : null}
            </View>
            <Text style={styles.checkboxLabel}>Recordarme</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.forgotLink, pressed && styles.pressed]}
            onPress={() => { /* TODO: navegación a recuperar contraseña */ }}
            disabled={loading}
          >
            <Text style={styles.forgotLinkText}>¿Olvidaste tu contraseña?</Text>
          </Pressable>
        </View>

        <AuthButton
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          icon="arrow-forward"
        >
          Iniciar Sesión
        </AuthButton>

        <AuthFormLink
          prompt="¿No tienes cuenta?"
          action="Regístrate gratis"
          onPress={onGoToRegister}
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
    flex: 1,
  },
  extras: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  checkboxWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.auth.textSecondary,
    marginRight: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.auth.inputBg,
    borderColor: theme.auth.accent,
  },
  checkboxLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.label,
  },
  forgotLink: {
    paddingVertical: 4,
  },
  forgotLinkText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: theme.auth.accent,
  },
  pressed: {
    opacity: 0.9,
  },
});
