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
import { useAuth } from '../contexts/AuthContext';
import { register } from '../api/auth';

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
        <View style={styles.content}>
          <Text style={styles.title}>Crear cuenta</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

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
              <Text style={styles.buttonText}>Registrarse</Text>
            )}
          </Pressable>
          <Pressable
            onPress={onGoToLogin}
            disabled={loading}
            style={styles.link}
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
    backgroundColor: '#fff',
  },
  confirmContent: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  confirmTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
  },
  confirmText: {
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmHint: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 32,
    textAlign: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  content: {
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 32,
  },
  error: {
    fontSize: 14,
    color: '#dc2626',
    marginBottom: 16,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 16,
  },
  button: {
    height: 48,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  link: {
    alignSelf: 'center',
  },
  linkText: {
    fontSize: 14,
    color: '#6b7280',
  },
  linkTextBold: {
    fontWeight: '600',
    color: '#1a1a1a',
  },
});
