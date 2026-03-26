import type { ReactNode } from 'react';
import {
  Platform,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeText } from './SafeText';

/**
 * Contenedor de texto seguro en **filas flex** (Android recorta `Text` si el padre no tiene `minWidth: 0`).
 * Usar en cualquier `flexDirection: 'row'` junto a iconos, botones u otros hijos.
 *
 * - `layout="row"` (default): texto que comparte fila (checkbox + label, botón + icono, etc.).
 * - `layout="block"`: párrafos / footer a ancho de columna (permite varias líneas sin cortar).
 */
export type FlexTextLayout = 'row' | 'block';

export type FlexTextProps = Omit<TextProps, 'style'> & {
  children?: ReactNode;
  style?: TextProps['style'];
  layout?: FlexTextLayout;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Solo el `View` envoltorio; úsalo si montas `SafeText`/`Text` a mano. */
export const flexTextRowContainerStyle: ViewStyle = {
  flexShrink: 1,
  minWidth: 0,
};

export const flexTextBlockContainerStyle: ViewStyle = {
  alignSelf: 'stretch',
  minWidth: 0,
  width: '100%',
};

/** Android: evita que el layout flex recorte párrafos (footer, confirmación). */
const flexTextBlockContainerAndroid: ViewStyle = {
  ...flexTextBlockContainerStyle,
  flexShrink: 0,
  overflow: 'visible',
};

export function FlexText({
  layout = 'row',
  style,
  containerStyle,
  children,
  ...textProps
}: FlexTextProps) {
  const base =
    layout === 'block'
      ? Platform.OS === 'android'
        ? flexTextBlockContainerAndroid
        : flexTextBlockContainerStyle
      : flexTextRowContainerStyle;

  return (
    <View style={[base, containerStyle]}>
      <SafeText style={style} {...textProps}>
        {children}
      </SafeText>
    </View>
  );
}
