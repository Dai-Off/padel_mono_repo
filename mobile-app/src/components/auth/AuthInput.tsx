import { useState, type ComponentProps } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lineHeightFor, theme } from '../../theme';

type HintType = 'error' | 'success';

type AuthInputProps = ComponentProps<typeof TextInput> & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Muestra un spinner de "comprobando" (validación en curso). */
  checking?: boolean;
  /** Texto de ayuda bajo el input (validación en vivo). */
  hintText?: string;
  /** Tipo de hint: colorea el texto y el borde/icono de estado. */
  hintType?: HintType;
  /** Acción inline junto al hint (p. ej. "Iniciar sesión" si el email ya existe). */
  hintActionLabel?: string;
  onHintActionPress?: () => void;
};

export function AuthInput({
  label,
  icon,
  error,
  containerStyle,
  style,
  checking,
  hintText,
  hintType,
  hintActionLabel,
  onHintActionPress,
  secureTextEntry: initialSecureTextEntry,
  ...inputProps
}: AuthInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = initialSecureTextEntry;
  const secureValue = isPassword ? !showPassword : false;

  // Las contraseñas NO deben autocapitalizar ni autocorregir (el teclado ponía la 1ª en mayúscula).
  const { autoCapitalize, autoCorrect, ...restInput } = inputProps;
  const resolvedAutoCapitalize = autoCapitalize ?? (isPassword ? 'none' : undefined);
  const resolvedAutoCorrect = autoCorrect ?? (isPassword ? false : undefined);

  const hasError = !!error || hintType === 'error';

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, hasError && styles.inputWrapError, hintType === 'success' && styles.inputWrapSuccess]}>
        <Ionicons name={icon} size={20} color={theme.auth.label} style={styles.icon} />
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={theme.auth.textSecondary}
          secureTextEntry={secureValue}
          autoCapitalize={resolvedAutoCapitalize}
          autoCorrect={resolvedAutoCorrect}
          {...restInput}
        />
        {checking ? (
          <ActivityIndicator size="small" color={theme.auth.textSecondary} style={styles.statusIcon} />
        ) : hintType === 'success' ? (
          <Ionicons name="checkmark-circle" size={20} color="#10B981" style={styles.statusIcon} />
        ) : hintType === 'error' ? (
          <Ionicons name="alert-circle" size={20} color={theme.auth.error} style={styles.statusIcon} />
        ) : null}
        {isPassword && (
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={({ pressed }) => [styles.eyeIcon, pressed && styles.pressed]}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.auth.textSecondary}
            />
          </Pressable>
        )}
      </View>
      {hintText || error ? (
        <Text style={[styles.hint, hintType === 'success' ? styles.hintSuccess : styles.hintError]}>
          {error || hintText}
          {hintActionLabel && onHintActionPress ? ' ' : ''}
          {hintActionLabel && onHintActionPress ? (
            <Text style={styles.hintAction} onPress={onHintActionPress} suppressHighlighting>
              {hintActionLabel}
            </Text>
          ) : null}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: theme.fontSize.sm,
    lineHeight: lineHeightFor(theme.fontSize.sm),
    fontWeight: '500',
    color: theme.auth.label,
    marginBottom: 10,
    ...Platform.select({
      android: { includeFontPadding: false, paddingVertical: 1 },
      default: {},
    }),
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.minTouchTarget,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.auth.inputBg,
    borderWidth: 1,
    borderColor: theme.auth.inputBorder,
    borderRadius: 16,
  },
  inputWrapError: {
    borderColor: theme.auth.error,
  },
  inputWrapSuccess: {
    borderColor: 'rgba(16,185,129,0.55)',
  },
  icon: {
    marginRight: theme.spacing.sm,
  },
  statusIcon: {
    marginLeft: theme.spacing.xs,
  },
  eyeIcon: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    fontSize: theme.fontSize.base,
    lineHeight: lineHeightFor(theme.fontSize.base),
    color: theme.auth.text,
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  hint: {
    marginTop: 6,
    fontSize: theme.fontSize.xs,
    lineHeight: lineHeightFor(theme.fontSize.xs),
  },
  hintError: { color: theme.auth.error },
  hintSuccess: { color: '#10B981' },
  hintAction: {
    fontWeight: '700',
    color: theme.auth.accent,
    textDecorationLine: 'underline',
  },
});
