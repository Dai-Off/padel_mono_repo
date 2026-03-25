import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { register } from '../api/auth';
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

type RegisterScreenProps = {
  onGoToLogin: () => void;
};

export function RegisterScreen({ onGoToLogin }: RegisterScreenProps) {
  const { setSession } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmMessage, setShowConfirmMessage] = useState(false);

  const clearError = () => setError('');

  const handleSubmit = async () => {
    const e = email.trim();
    const p = password;
    const cp = confirmPassword;

    if (!e || !p) {
      setError('Email y contraseña son obligatorios');
      return;
    }

    if (p.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (p !== cp) {
      setError('Las contraseñas no coinciden');
      return;
    }

    clearError();
    setLoading(true);

    try {
      const res = await register(e, p, name.trim() || undefined);

      if (res.ok && res.user) {
        if (res.session) {
          setSession({
            access_token: res.session.access_token,
            refresh_token: res.session.refresh_token,
            user: res.user,
          });
        } else {
          setEmail('');
          setPassword('');
          setConfirmPassword('');
          setName('');
          clearError();
          setShowConfirmMessage(true);
        }
      } else {
        setError(res.error ?? 'Error al registrarse');
      }
    } catch {
      setError('Error de conexión. ¿Está el backend corriendo?');
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
          <Text style={styles.confirmTitle}>¡Revisa tu email!</Text>
          <Text style={styles.confirmText}>
            Te hemos enviado un enlace para confirmar tu cuenta. Haz clic en el
            enlace del correo y vuelve aquí para iniciar sesión.
          </Text>
          <Text style={styles.confirmHint}>
            ¿No lo ves? Revisa la carpeta de spam.
          </Text>
          <AuthButton
            onPress={() => {
              setShowConfirmMessage(false);
              onGoToLogin();
            }}
            icon="log-in-outline"
          >
            Ir a iniciar sesión
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
        label="Nombre (opcional)"
        icon="person-outline"
        placeholder="Tu nombre"
        autoCapitalize="words"
        autoComplete="name"
        value={name}
        onChangeText={(t) => { setName(t); clearError(); }}
        editable={!loading}
      />

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
        placeholder="Mín. 6 caracteres"
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={(t) => { setPassword(t); clearError(); }}
        editable={!loading}
      />

      <AuthInput
        label="Confirmar contraseña"
        icon="lock-closed-outline"
        placeholder="••••••••"
        secureTextEntry
        autoComplete="new-password"
        value={confirmPassword}
        onChangeText={(t) => { setConfirmPassword(t); clearError(); }}
        editable={!loading}
      />

      <AuthButton
        onPress={handleSubmit}
        loading={loading}
        disabled={loading}
        icon="person-add-outline"
      >
        Registrarse
      </AuthButton>

      <AuthFormLink
        prompt="¿Ya tienes cuenta?"
        action="Inicia sesión"
        onPress={onGoToLogin}
        disabled={loading}
      />

      <AuthFooter />
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
