import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { changePassword, forgotPassword } from '../api/auth';
import { BackHeader } from '../components/layout/BackHeader';
import { theme } from '../theme';

const CARD = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.08)';

type ChangePasswordScreenProps = {
  onBack: () => void;
  userEmail?: string | null;
};

export function ChangePasswordScreen({ onBack, userEmail }: ChangePasswordScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async () => {
    const token = session?.access_token;
    const refresh = session?.refresh_token;
    if (!token || !refresh) {
      setError('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await changePassword(token, refresh, password);
      if (res.ok) {
        setSuccess(true);
        setPassword('');
        setConfirm('');
      } else {
        setError(res.error ?? 'No se pudo actualizar la contraseña');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRecoveryEmail = async () => {
    const email = userEmail?.trim() || session?.user?.email?.trim();
    if (!email) {
      setError('No hay correo asociado a tu cuenta.');
      return;
    }
    setSendingEmail(true);
    setError(null);
    try {
      const res = await forgotPassword(email, { client: 'mobile' });
      if (res.ok) {
        setEmailSent(true);
      } else if (res.httpStatus === 429) {
        setError(res.error ?? 'Demasiados intentos. Espera unos minutos.');
      } else {
        setError(res.error ?? 'No se pudo enviar el correo');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <View style={styles.root}>
      <BackHeader title="Cambiar contraseña" onBack={onBack} tone="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.intro}>
            Elige una contraseña nueva de al menos 6 caracteres. Seguirás con la sesión iniciada.
          </Text>

          {success ? (
            <View style={styles.bannerOk}>
              <Ionicons name="checkmark-circle" size={20} color="#34d399" />
              <Text style={styles.bannerOkText}>Contraseña actualizada correctamente.</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.bannerErr}>
              <Text style={styles.bannerErrText}>{error}</Text>
            </View>
          ) : null}

          {!success ? (
            <>
              <Text style={styles.label}>Nueva contraseña</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor="#6B7280"
                secureTextEntry
                autoCapitalize="none"
                editable={!loading}
              />
              <Text style={styles.label}>Confirmar contraseña</Text>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Repite la contraseña"
                placeholderTextColor="#6B7280"
                secureTextEntry
                autoCapitalize="none"
                editable={!loading}
              />

              <Pressable
                style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed, loading && styles.saveBtnDisabled]}
                onPress={() => void handleSubmit()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Guardar nueva contraseña</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
              onPress={onBack}
            >
              <Text style={styles.saveBtnText}>Volver al perfil</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alternativa</Text>
          <Text style={styles.altHint}>
            Si prefieres, te enviamos un enlace de recuperación a tu correo
            {userEmail || session?.user?.email ? ` (${userEmail ?? session?.user?.email})` : ''}.
          </Text>
          {emailSent ? (
            <Text style={styles.emailSent}>
              Si el correo existe, recibirás un enlace en unos minutos. Ábrelo en este dispositivo.
            </Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.altBtn, pressed && styles.pressed, sendingEmail && styles.saveBtnDisabled]}
            onPress={() => void handleSendRecoveryEmail()}
            disabled={sendingEmail}
          >
            {sendingEmail ? (
              <ActivityIndicator size="small" color={theme.auth.accent} />
            ) : (
              <>
                <Ionicons name="mail-outline" size={18} color={theme.auth.accent} />
                <Text style={styles.altBtnText}>Enviar enlace por correo</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.auth.bg },
  scroll: { flex: 1 },
  section: {
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 4,
  },
  intro: {
    color: theme.auth.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: theme.auth.accent,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  label: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  saveBtn: {
    marginTop: 20,
    backgroundColor: theme.auth.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  altHint: { color: theme.auth.textMuted, fontSize: 13, lineHeight: 20 },
  altBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  altBtnText: { color: theme.auth.accent, fontSize: 14, fontWeight: '600' },
  emailSent: { color: '#34d399', fontSize: 12, marginTop: 10, lineHeight: 18 },
  bannerOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.12)',
    marginBottom: 8,
  },
  bannerOkText: { flex: 1, color: '#34d399', fontSize: 13 },
  bannerErr: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(227,30,36,0.12)',
    marginBottom: 8,
  },
  bannerErrText: { color: theme.auth.error, fontSize: 13 },
  pressed: { opacity: 0.85 },
});
