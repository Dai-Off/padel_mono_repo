import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

/**
 * ScrollView consciente del teclado. En Android no recorta hijos por error
 * (removeClippedSubviews). Usar en pantallas con inputs o texto en filas flex.
 */
export function SafeScrollView({
  keyboardShouldPersistTaps = 'handled',
  bottomOffset = 24,
  ...props
}: KeyboardAwareScrollViewProps) {
  return (
    <KeyboardAwareScrollView
      {...props}
      removeClippedSubviews={false}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      bottomOffset={bottomOffset}
    />
  );
}
