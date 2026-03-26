import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lineHeightFor, theme } from '../../theme';

type ErrorBannerProps = {
  message: string;
  variant?: 'error' | 'info';
};

export function ErrorBanner({ message, variant = 'error' }: ErrorBannerProps) {
  const isInfo = variant === 'info';
  return (
    <View style={[styles.banner, isInfo && styles.bannerInfo]}>
      <Ionicons
        name={isInfo ? 'information-circle' : 'alert-circle'}
        size={18}
        color={isInfo ? theme.auth.info : theme.auth.error}
      />
      <Text style={[styles.text, isInfo && styles.textInfo]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.auth.errorBg,
    borderRadius: 12,
    marginBottom: theme.spacing.md,
  },
  bannerInfo: {
    backgroundColor: theme.auth.infoBg,
  },
  text: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    lineHeight: lineHeightFor(theme.fontSize.sm),
    color: theme.auth.error,
    fontWeight: '500',
    ...Platform.select({
      android: { includeFontPadding: false, paddingVertical: 1 },
      default: {},
    }),
  },
  textInfo: {
    color: theme.auth.info,
  },
});
