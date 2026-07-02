import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { formatEuroCents, openMatchPlayerShareCents } from '../../lib/openMatchPricing';
import { theme } from '../../theme';

type Props = {
  totalCents: number | null | undefined;
  loading?: boolean;
  /** Variante más compacta para grids de detalle. */
  variant?: 'card' | 'inline';
};

function PriceSpinner() {
  return <ActivityIndicator size="small" color={theme.auth.accent} />;
}

export function OpenMatchPriceBreakdown({ totalCents, loading, variant = 'card' }: Props) {
  const { t } = useTranslation();
  const resolvedTotal = totalCents && totalCents > 0 ? totalCents : null;
  const shareCents = resolvedTotal ? openMatchPlayerShareCents(resolvedTotal) : null;

  if (loading) {
    if (variant === 'inline') {
      return (
        <View style={styles.inlineLoadingWrap}>
          <PriceSpinner />
        </View>
      );
    }
    return (
      <View style={styles.cardLoading}>
        <ActivityIndicator size="small" color={theme.auth.accent} />
      </View>
    );
  }

  const totalLabel = resolvedTotal ? formatEuroCents(resolvedTotal, variant === 'inline') : '—';
  const shareLabel = shareCents ? formatEuroCents(shareCents, variant === 'inline') : '—';

  if (variant === 'inline') {
    return (
      <View style={styles.inlineWrap}>
        <View style={styles.inlineRow}>
          <Text style={styles.inlineLabel}>{t('partidos.createCourtTotalPrice')}</Text>
          <Text style={styles.inlineValue}>{totalLabel}</Text>
        </View>
        <View style={styles.inlineRow}>
          <Text style={styles.inlineLabelStrong}>{t('partidos.createYourShare')}</Text>
          <Text style={styles.inlineValueStrong}>{shareLabel}</Text>
        </View>
        <Text style={styles.inlineNote}>{t('partidos.createCourtSplitExplain')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('partidos.createCourtTotalPrice')}</Text>
        <Text style={styles.rowValue}>{totalLabel}</Text>
      </View>
      <View style={[styles.row, styles.rowHighlight]}>
        <View style={styles.shareLabelWrap}>
          <Text style={styles.rowLabelStrong}>{t('partidos.createYourPaymentAmount')}</Text>
          <Text style={styles.shareSub}>{t('partidos.createYourShare')}</Text>
        </View>
        <Text style={styles.shareValue}>{shareLabel}</Text>
      </View>
      <Text style={styles.note}>{t('partidos.createCourtSplitExplain')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardLoading: {
    marginTop: 16,
    paddingVertical: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineLoadingWrap: {
    marginTop: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowHighlight: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: -4,
    borderRadius: 12,
    backgroundColor: 'rgba(241, 143, 52, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.22)',
  },
  rowLabel: {
    flex: 1,
    fontSize: 12,
    color: theme.auth.textMuted,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.auth.text,
  },
  shareLabelWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowLabelStrong: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.auth.text,
  },
  shareSub: {
    marginTop: 2,
    fontSize: 11,
    color: theme.auth.textMuted,
  },
  shareValue: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.auth.accent,
  },
  note: {
    fontSize: 11,
    lineHeight: 16,
    color: theme.auth.textMuted,
  },
  inlineWrap: {
    marginTop: 12,
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },
  inlineValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  inlineLabelStrong: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  inlineValueStrong: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.auth.accent,
  },
  inlineNote: {
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.5)',
  },
});
