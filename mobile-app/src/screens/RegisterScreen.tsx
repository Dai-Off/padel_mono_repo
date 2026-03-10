import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { register } from '../api/auth';
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

    setError('');
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
          setError('');
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
      <View style={styles.container}>
        <View style={styles.confirmContent}>
          <View style={styles.confirmIcon}>
            <Ionicons name="mail-open-outline" size={40} color="#E31E24" />
          </View>
          <Text style={styles.confirmTitle}>¡Revisa tu email!</Text>
          <Text style={styles.confirmText}>
            Te hemos enviado un enlace para confirmar tu cuenta. Haz clic en el
            enlace del correo y vuelve aquí para iniciar sesión.
          </Text>
          <Text style={styles.confirmHint}>
            ¿No lo ves? Revisa la carpeta de spam.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => {
              setShowConfirmMessage(false);
              onGoToLogin();
            }}
          >
            <Ionicons name="log-in-outline" size={20} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Ir a iniciar sesión</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandEmoji}>🎾</Text>
          </View>
          <Text style={styles.brandTitle}>WeMatch</Text>
          <Text style={styles.brandSub}>Crea tu cuenta y empieza a jugar</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.title}>Crear cuenta</Text>

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#E31E24" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Nombre (opcional)"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
              autoComplete="name"
              value={name}
              onChangeText={(t) => { setName(t); setError(''); }}
              editable={!loading}
            />
          </View>
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
              onChangeText={(t) => { setEmail(t); setError(''); }}
              editable={!loading}
            />
          </View>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Contraseña (mín. 6 caracteres)"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoComplete="new-password"
              value={password}
              onChangeText={(t) => { setPassword(t); setError(''); }}
              editable={!loading}
            />
          </View>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirmar contraseña"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoComplete="new-password"
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setError(''); }}
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
                <Ionicons name="person-add-outline" size={20} color="#fff" style={styles.buttonIcon} />
                <Text style={styles.buttonText}>Registrarse</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={onGoToLogin}
            disabled={loading}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={styles.linkText}>
              ¿Ya tienes cuenta?{' '}
              <Text style={styles.linkTextBold}>Inicia sesión</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
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
  errorText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: '#E31E24',
    fontWeight: '500',
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
  // Confirmación de email
  confirmContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: 'center',
  },
  confirmIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(227, 30, 36, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: theme.spacing.lg,
  },
  confirmTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  confirmText: {
    fontSize: theme.fontSize.base,
    color: '#4b5563',
    lineHeight: 24,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  confirmHint: {
    fontSize: theme.fontSize.sm,
    color: '#9ca3af',
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
  },
});
