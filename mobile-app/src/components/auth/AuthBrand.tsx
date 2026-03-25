import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme';

const LOGO = require('../../../assets/images/wematch-logo.png');

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
          <Text style={styles.title}>
            <Text style={styles.brandWe}>We</Text>
            <Text style={styles.brandMatch}>Match</Text>
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
          <Text style={styles.title}>WeMatch</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
  },
  containerLogoOnly: {
    marginBottom: theme.spacing.xl,
  },
  brandWrap: {
    alignItems: 'center',
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
    fontWeight: '700',
    color: theme.auth.text,
    marginBottom: 4,
  },
  brandWe: {
    color: theme.auth.text,
  },
  brandMatch: {
    color: theme.auth.accent,
  },
  underline: {
    width: 120,
    height: 3,
    marginTop: 6,
    borderRadius: 2,
    shadowColor: theme.auth.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textSecondary,
  },
});
