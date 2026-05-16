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
import { applyRecoveryPassword } from '../api/auth';
import { theme } from '../theme';

export type RecoveryPayload = {
  access_token?: string;
  refresh_token?: string;
  token_hash?: string;
};

type ResetPasswordScreenProps = {
  recovery: RecoveryPayload;
  onBackToLogin: () => void;
};

export function ResetPasswordScreen({ recovery, onBackToLogin }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const hasCredential = !!recovery.token_hash || !!recovery.access_token;

  const handleSubmit = async () => {
    if (!hasCredential) {
      setError('Enlace incompleto. Solicita un nuevo correo de recuperación.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await applyRecoveryPassword({
        password,
        access_token: recovery.access_token,
        refresh_token: recovery.refresh_token,
        token_hash: recovery.token_hash,
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(res.error ?? 'No se pudo actualizar la contraseña');
      }
    } catch {
      setError('Error de conexión con el servidor');
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
            message="Contraseña actualizada. Ya puedes iniciar sesión con la nueva clave."
            variant="info"
          />
        ) : null}

        {!success ? (
          <>
            <AuthInput
              label="Nueva contraseña"
              icon="lock-closed-outline"
              placeholder="Mínimo 6 caracteres"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />
            <AuthInput
              label="Confirmar contraseña"
              icon="lock-closed-outline"
              placeholder="Repite la contraseña"
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
              editable={!loading}
            />

            <View style={{ marginTop: 20 }}>
              <AuthButton
                onPress={handleSubmit}
                loading={loading}
                disabled={loading || !hasCredential}
                icon="checkmark-circle-outline"
              >
                Guardar contraseña
              </AuthButton>
            </View>
          </>
        ) : null}

        <AuthFormLink
          prompt={success ? 'Listo.' : '¿Prefieres volver?'}
          action={success ? 'Ir al inicio de sesión' : 'Volver al inicio de sesión'}
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
