import { Platform, Text, type TextProps } from 'react-native';

/**
 * Texto de UI. Sin maxWidth forzado: en iOS/Android los % en Text dentro de flex recortaban mal.
 */
const androidBase: NonNullable<TextProps['style']> = Platform.select({
  android: {
    includeFontPadding: false,
    textBreakStrategy: 'highQuality',
  },
  default: {},
});

const defaultMaxScale = Platform.OS === 'android' ? 1.35 : 1.5;

export function SafeText({ style, maxFontSizeMultiplier, ...rest }: TextProps) {
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? defaultMaxScale}
      style={[androidBase, style]}
    />
  );
}
