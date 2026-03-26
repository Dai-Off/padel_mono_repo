import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authButtonInner } from '../../styles/authScreenStyles';
import { lineHeightFor, theme } from '../../theme';
import { SafeText } from '../ui/SafeText';

type AuthButtonProps = {
  children: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function AuthButton({
  children,
  onPress,
  loading,
  disabled,
  icon = 'arrow-forward',
}: AuthButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        (loading || disabled) && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={loading || disabled}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <View style={authButtonInner}>
          <View style={styles.buttonContent}>
            <SafeText style={styles.text} numberOfLines={2}>
              {children}
            </SafeText>
            <Ionicons name={icon} size={20} color="#fff" style={styles.icon} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minWidth: 0,
    overflow: 'visible',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.auth.accent,
    borderRadius: 16,
    shadowColor: theme.auth.accentShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 8,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  /**
   * Texto + icono juntos y centrados.
   * No usar flexShrink aquí ni en el Text: en Android recorta “Iniciar Sesión” (ver authScreenStyles).
   */
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    flexShrink: 0,
  },
  text: {
    fontSize: theme.fontSize.base,
    lineHeight: lineHeightFor(theme.fontSize.base),
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    flexShrink: 0,
    paddingRight: theme.spacing.xs,
    ...Platform.select({
      android: { includeFontPadding: false, paddingVertical: 1 },
      default: {},
    }),
  },
  icon: {
    marginLeft: theme.spacing.md,
    flexShrink: 0,
  },
});
