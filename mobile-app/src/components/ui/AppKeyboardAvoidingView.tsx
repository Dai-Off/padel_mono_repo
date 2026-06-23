import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

type AppKeyboardAvoidingViewProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Offset extra para headers fijos fuera del contenedor (p. ej. toolbar propio). */
  keyboardVerticalOffset?: number;
};

/**
 * Evita que el teclado tape inputs en layouts fijos (modales, chat, formularios sin scroll).
 */
export function AppKeyboardAvoidingView({
  children,
  style,
  keyboardVerticalOffset = 0,
}: AppKeyboardAvoidingViewProps) {
  return (
    <KeyboardAvoidingView
      style={[styles.root, style]}
      behavior="padding"
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
