import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from '../../i18n';
import { filterTheme } from './filterTheme';
import { theme } from '../../theme';

type FilterApplyFooterProps = {
  onPress: () => void;
  /** Si se define, ignora resultCount y las etiquetas por defecto. */
  label?: string;
  resultCount?: number;
  singularLabel?: string;
  pluralLabel?: string;
};

export function FilterApplyFooter({
  onPress,
  label: labelOverride,
  resultCount = 0,
  singularLabel,
  pluralLabel,
}: FilterApplyFooterProps) {
  const { t } = useTranslation();
  const label =
    labelOverride ??
    (resultCount === 1
      ? (singularLabel ?? t('common.seeOneResult'))
      : (pluralLabel ?? t('common.seeResultsMany', { count: resultCount })));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Text style={styles.ctaText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cta: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    backgroundColor: filterTheme.accent,
    borderRadius: 14,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#fff',
  },
  pressed: { opacity: 0.88 },
});
