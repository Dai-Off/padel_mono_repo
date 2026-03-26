import { Platform, StyleSheet, Text, View } from 'react-native';
import { authFormLinkWrap } from '../../styles/authScreenStyles';
import { lineHeightFor, theme } from '../../theme';

type AuthFormLinkProps = {
  prompt: string;
  action: string;
  onPress: () => void;
  disabled?: boolean;
};

/**
 * Un solo árbol de Text (prompt + acción) para que Android no recorte el segundo segmento en flex row.
 */
export function AuthFormLink({ prompt, action, onPress, disabled }: AuthFormLinkProps) {
  return (
    <View style={authFormLinkWrap}>
      <Text style={styles.block} accessibilityRole="text">
        <Text style={styles.prompt}>{prompt}</Text>
        <Text style={styles.prompt}> </Text>
        <Text
          style={[styles.linkText, disabled && styles.linkDisabled]}
          onPress={disabled ? undefined : onPress}
          accessibilityRole="link"
        >
          {action}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    width: '100%',
    textAlign: 'center',
  },
  prompt: {
    fontSize: theme.fontSize.sm,
    lineHeight: lineHeightFor(theme.fontSize.sm),
    color: theme.auth.textSecondary,
    ...Platform.select({
      android: { includeFontPadding: false, paddingVertical: 1 },
      default: {},
    }),
  },
  linkText: {
    fontSize: theme.fontSize.sm,
    lineHeight: lineHeightFor(theme.fontSize.sm),
    fontWeight: '600',
    color: theme.auth.accent,
    ...Platform.select({
      android: { includeFontPadding: false, paddingVertical: 1 },
      default: {},
    }),
  },
  linkDisabled: {
    opacity: 0.5,
  },
});
