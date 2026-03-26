import type { ComponentProps } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lineHeightFor, theme } from '../../theme';

type AuthInputProps = ComponentProps<typeof TextInput> & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function AuthInput({
  label,
  icon,
  error,
  containerStyle,
  style,
  ...inputProps
}: AuthInputProps) {
  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, error && styles.inputWrapError]}>
        <Ionicons
          name={icon}
          size={20}
          color={theme.auth.label}
          style={styles.icon}
        />
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={theme.auth.textSecondary}
          {...inputProps}
        />
      </View>
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
  icon: {
    marginRight: theme.spacing.sm,
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
});
