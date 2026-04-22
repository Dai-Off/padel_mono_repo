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
import { API_URL } from '../config';
import { theme } from '../theme';

type ForgotPasswordScreenProps = {
  onBackToLogin: () => void;
};

export function ForgotPasswordScreen({ onBackToLogin }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    const e = email.trim();
    if (!e) {
      setError('Por favor ingresa tu correo electrónico');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      const data = await res.json();
      
      if (data.ok) {
        setSuccess(true);
      } else {
        setError(data.error ?? 'Error al enviar el correo de recuperación');
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
            message="Si el correo existe, recibirás un enlace para restablecer tu contraseña en unos minutos." 
            variant="info" 
          />
        ) : null}

        {!success ? (
          <>
            <AuthInput
              label="Correo Electrónico"
              icon="mail-outline"
              placeholder="tu@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />

            <View style={{ marginTop: 20 }}>
              <AuthButton
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                icon="mail-unread-outline"
              >
                Enviar enlace
              </AuthButton>
            </View>
          </>
        ) : null}

        <AuthFormLink
          prompt="¿Ya te acordaste?"
          action="Volver al inicio"
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
