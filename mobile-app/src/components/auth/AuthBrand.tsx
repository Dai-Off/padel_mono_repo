import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeText } from '../ui/SafeText';
import { lineHeightFor, theme } from '../../theme';

const LOGO = require('../../../assets/images/wematch-logo.png');

const SPLASH_UNDERLINE_FALLBACK_W = Math.min(
  theme.screenWidth - 48,
  Math.ceil(theme.fontSize.xxl * 7.2),
);

type AuthBrandProps = {
  subtitle?: string;
  /** default: logo + título + subtítulo | splash: logo + WeMatch coloreado + subrayado | logoOnly: solo logo */
  variant?: 'default' | 'splash' | 'logoOnly';
};

export function AuthBrand({ subtitle = '', variant = 'default' }: AuthBrandProps) {
  const isSplash = variant === 'splash';
  const isLogoOnly = variant === 'logoOnly';

  return (
    <View style={[
          styles.container,
          isSplash && styles.containerSplash,
          isLogoOnly && styles.containerLogoOnly,
        ]}>
      <View style={styles.logoWrap}>
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="WeMatch Logo"
        />
      </View>
      {isLogoOnly ? null : isSplash ? (
        <View style={styles.brandWrap}>
          {Platform.OS === 'android' ? (
            <View style={styles.splashAndroidColumn}>
              <Text
                textBreakStrategy="simple"
                maxFontSizeMultiplier={1.35}
                style={[styles.title, styles.splashAndroidTitle]}
                accessibilityRole="header"
                accessibilityLabel="WeMatch"
              >
                WeMatch
              </Text>
              <LinearGradient
                colors={['transparent', theme.auth.accent, 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.underline}
              />
            </View>
          ) : (
            <>
              <Text
                maxFontSizeMultiplier={1.5}
                style={styles.title}
                accessibilityRole="header"
                accessibilityLabel="WeMatch"
              >
                <Text style={styles.brandWe}>We</Text>
                <Text style={styles.brandMatch}>Match</Text>
              </Text>
              <LinearGradient
                colors={['transparent', theme.auth.accent, 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.underline}
              />
            </>
          )}
        </View>
      ) : (
        <>
          <SafeText style={styles.title}>WeMatch</SafeText>
          {subtitle ? <SafeText style={styles.subtitle}>{subtitle}</SafeText> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  containerSplash: {
    marginBottom: 0,
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'center',
  },
  containerLogoOnly: {
    marginBottom: theme.spacing.xl,
  },
  brandWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
    minWidth: 0,
    ...Platform.select({
      android: { flexShrink: 0, overflow: 'visible' as const },
      default: {},
    }),
  },
  logoWrap: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  logo: {
    width: 128,
    height: 128,
  },
  title: {
    fontSize: theme.fontSize.xxl,
    lineHeight: lineHeightFor(theme.fontSize.xxl),
    fontWeight: '700',
    color: theme.auth.text,
    marginBottom: 4,
    textAlign: 'center',
    ...Platform.select({
      android: { flexShrink: 0, includeFontPadding: false, paddingVertical: 1 },
      default: {},
    }),
  },
  splashAndroidColumn: {
    width: '100%',
    alignItems: 'center',
  },
  splashAndroidTitle: {
    alignSelf: 'stretch',
    width: '100%',
    paddingHorizontal: theme.spacing.lg,
    includeFontPadding: false,
  },
  brandWe: {
    color: theme.auth.text,
    fontSize: theme.fontSize.xxl,
    lineHeight: lineHeightFor(theme.fontSize.xxl),
    fontWeight: '700',
  },
  brandMatch: {
    color: theme.auth.accent,
    fontSize: theme.fontSize.xxl,
    lineHeight: lineHeightFor(theme.fontSize.xxl),
    fontWeight: '700',
  },
  underline: {
    width: SPLASH_UNDERLINE_FALLBACK_W,
    maxWidth: '92%',
    height: 3,
    marginTop: 6,
    borderRadius: 2,
    alignSelf: 'center',
    shadowColor: theme.auth.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    lineHeight: lineHeightFor(theme.fontSize.sm),
    color: theme.auth.textSecondary,
    ...Platform.select({
      android: { includeFontPadding: false, paddingVertical: 1 },
      default: {},
    }),
  },
});
