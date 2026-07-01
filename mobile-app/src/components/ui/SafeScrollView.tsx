import { forwardRef } from 'react';
import type { ScrollView } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

/**
 * ScrollView consciente del teclado. En Android no recorta hijos por error
 * (removeClippedSubviews). Usar en pantallas con inputs o texto en filas flex.
 */
export const SafeScrollView = forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
  function SafeScrollView(
    { keyboardShouldPersistTaps = 'handled', bottomOffset = 24, ...props },
    ref,
  ) {
    return (
      <KeyboardAwareScrollView
        ref={ref}
        {...props}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        bottomOffset={bottomOffset}
      />
    );
  },
);
