import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
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
import {
  loginCheckboxInner,
  loginExtrasColLeft,
  loginExtrasColRight,
  loginExtrasRow,
  loginForgotLabel,
} from '../styles/authScreenStyles';
import { SafeText } from '../components/ui/SafeText';
import { theme } from '../theme';

type LoginScreenProps = {
  onGoToRegister: () => void;
  onGoToForgot: () => void;
};

export function LoginScreen({ onGoToRegister, onGoToForgot }: LoginScreenProps) {
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
          expires_at: res.session.expires_at,
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
    <AuthLayout scrollable>
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

        <View style={loginExtrasRow}>
          <View style={loginExtrasColLeft}>
            <Pressable
              style={({ pressed }) => [styles.checkboxWrap, pressed && styles.pressed]}
              onPress={() => setRememberMe(!rememberMe)}
              disabled={loading}
            >
              <View style={loginCheckboxInner}>
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe ? (
                    <Ionicons name="checkmark" size={14} color={theme.auth.accent} />
                  ) : null}
                </View>
                <View style={styles.checkboxLabelOuter}>
                  <SafeText style={styles.checkboxLabel}>Recordarme</SafeText>
                </View>
              </View>
            </Pressable>
          </View>
          <View style={loginExtrasColRight}>
            <Pressable
              style={({ pressed }) => [styles.forgotPressable, pressed && styles.pressed]}
              onPress={onGoToForgot}
              disabled={loading}
            >
              <SafeText style={loginForgotLabel}>
                ¿Olvidaste tu contraseña?
              </SafeText>
            </Pressable>
          </View>
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
    flexGrow: 1,
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  forgotPressable: {
    width: '100%',
    alignItems: 'flex-end',
    paddingVertical: 4,
  },
  checkboxLabelOuter: {
    flexShrink: 0,
    minWidth: 102,
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
  pressed: {
    opacity: 0.9,
  },
});
