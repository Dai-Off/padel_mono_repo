import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../../i18n';
import { theme } from '../../theme';

type Props = {
  visible: boolean;
  /** CTA primario: llevar a iniciar sesión. */
  onLogin: () => void;
  /** Cerrar y permanecer en el registro (usar otro correo). */
  onClose: () => void;
};

/** Diálogo cuando el email ya está registrado: mensaje claro + salida directa a login. */
export function ExistingAccountModal({ visible, onLogin, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconCircle}>
            <Ionicons name="person-circle-outline" size={40} color={theme.auth.accent} />
          </View>

          <Text style={styles.title}>{t('auth.existingAccountTitle')}</Text>
          <Text style={styles.body}>{t('auth.existingAccountBody')}</Text>

          <Pressable onPress={onLogin} style={styles.cta} accessibilityRole="button">
            <LinearGradient
              colors={['#F18F34', '#C46A20']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Ionicons name="log-in-outline" size={18} color="#fff" />
              <Text style={styles.ctaText}>{t('auth.existingAccountLogin')}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={onClose} hitSlop={8} style={styles.secondaryBtn} accessibilityRole="button">
            <Text style={styles.secondaryText}>{t('auth.existingAccountUseAnother')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${theme.auth.accent}26`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    color: theme.auth.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  body: {
    fontSize: theme.fontSize.base,
    color: theme.auth.textMuted,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  cta: {
    width: '100%',
    marginBottom: theme.spacing.sm,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 14,
    gap: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: theme.fontSize.base,
  },
  secondaryBtn: { paddingVertical: 8 },
  secondaryText: { color: theme.auth.textSecondary, fontSize: theme.fontSize.sm, fontWeight: '500' },
});
