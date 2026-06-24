import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { fetchTransactions, type Transaction } from '../api/payments';
import { BackHeader } from '../components/layout/BackHeader';
import { formatLocale, useTranslation } from '../i18n';
import { theme } from '../theme';

const CARD = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.08)';
const EMERALD = theme.sidebar.iconVariants.emerald;
const SKY = theme.sidebar.iconVariants.sky;

type TransaccionesScreenProps = {
  onBack: () => void;
};

function formatAmount(
  cents: number,
  currency: string,
  locale: string,
  opts?: { negative?: boolean },
): string {
  const n = Math.abs(cents) / 100;
  const amount = n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const core = currency === 'EUR' ? `${amount} €` : `${amount} ${currency}`;
  return opts?.negative ? `− ${core}` : core;
}

function formatDate(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  numberLocale: string,
): string {
  const d = new Date(iso);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(numberLocale, { hour: '2-digit', minute: '2-digit' });
  if (today) return t('common.todayWithTime', { time });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === d.toDateString()) {
    return t('common.yesterdayWithTime', { time });
  }
  return d.toLocaleDateString(numberLocale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TransactionRow({
  t,
  numberLocale,
  tx,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  numberLocale: string;
  tx: Transaction;
}) {
  const desc =
    tx.summary_label?.trim() ||
    (tx.club_name && tx.court_name
      ? `${tx.club_name} · ${tx.court_name}`
      : tx.club_name ??
        tx.court_name ??
        (tx.tournament_name
          ? t('wallet.txTournamentDesc', { name: tx.tournament_name })
          : t('wallet.txDefaultDesc')));

  const isRefunded = tx.status === 'refunded';
  const isPaid = tx.status === 'succeeded';
  const kindLabel = isRefunded
    ? t('wallet.txKindRefund')
    : isPaid
      ? t('wallet.txKindPayment')
      : tx.status === 'requires_action'
        ? t('wallet.txKindPending')
        : tx.status === 'processing'
          ? t('wallet.txKindProcessing')
          : tx.status === 'failed'
            ? t('wallet.txKindFailed')
            : tx.status;

  const dateLine = isRefunded
    ? t('wallet.txRefundLine', {
        date: formatDate(tx.created_at, t, numberLocale),
        refundDate: formatDate(tx.updated_at ?? tx.created_at, t, numberLocale),
      })
    : formatDate(tx.created_at, t, numberLocale);

  const iconColor = isRefunded ? SKY.color : isPaid ? EMERALD.color : theme.auth.textMuted;
  const iconName = isRefunded ? 'arrow-undo' : isPaid ? 'checkmark-circle' : 'time-outline';

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons name={iconName} size={20} color={iconColor} style={styles.rowIcon} />
        <View style={styles.rowTextBlock}>
          <Text style={styles.rowDesc} numberOfLines={2}>
            {desc}
          </Text>
          <Text style={styles.rowDate}>{dateLine}</Text>
          <Text
            style={[
              styles.rowKind,
              isRefunded && styles.rowKindRefund,
              isPaid && styles.rowKindPaid,
            ]}
          >
            {kindLabel}
          </Text>
        </View>
      </View>
      <Text style={[styles.rowAmount, isRefunded && styles.rowAmountRefund]}>
        {formatAmount(tx.amount_cents, tx.currency, numberLocale, { negative: isRefunded })}
      </Text>
    </View>
  );
}

export function TransaccionesScreen({ onBack }: TransaccionesScreenProps) {
  const insets = useSafeAreaInsets();
  const { locale, t } = useTranslation();
  const numberLocale = formatLocale(locale);
  const { session } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setError(t('wallet.transactionsLogin'));
      setTransactions([]);
      return;
    }
    const res = await fetchTransactions(token);
    if (!res.ok) {
      setError(res.error ?? t('wallet.transactionsLoadError'));
      setTransactions([]);
    } else {
      setError(null);
      setTransactions(res.transactions ?? []);
    }
  }, [session?.access_token, t]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.container}>
      <BackHeader title={t('wallet.transactionsTitle')} onBack={onBack} tone="dark" />
      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={theme.auth.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + (insets.bottom ?? 0) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={theme.auth.accent}
              colors={[theme.auth.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.stateBox}>
              <Ionicons name="alert-circle-outline" size={48} color={theme.auth.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.stateBox}>
              <Ionicons name="receipt-outline" size={48} color={theme.auth.textMuted} />
              <Text style={styles.emptyText}>{t('wallet.transactionsEmpty')}</Text>
              <Text style={styles.emptySub}>{t('wallet.transactionsEmptySub')}</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {transactions.map((item, index) => (
                <View key={item.id}>
                  <TransactionRow t={t} numberLocale={numberLocale} tx={item} />
                  {index < transactions.length - 1 ? <View style={styles.rowDivider} /> : null}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.auth.bg },
  centerLoader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: theme.spacing.lg },
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xxl,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  errorText: {
    fontSize: theme.fontSize.base,
    color: theme.auth.error,
    textAlign: 'center',
    lineHeight: theme.lineHeightFor(theme.fontSize.base),
  },
  emptyText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: theme.auth.text,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textMuted,
    textAlign: 'center',
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
  },
  listCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginHorizontal: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, minWidth: 0, gap: 10 },
  rowIcon: { marginTop: 2 },
  rowTextBlock: { flex: 1, minWidth: 0 },
  rowDesc: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.auth.text },
  rowDate: {
    fontSize: theme.fontSize.xs,
    color: theme.auth.textMuted,
    marginTop: 2,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
  },
  rowKind: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.auth.textMuted,
    marginTop: 4,
  },
  rowKindPaid: { color: EMERALD.color },
  rowKindRefund: { color: SKY.color },
  rowAmount: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.auth.text,
    marginTop: 2,
  },
  rowAmountRefund: { color: SKY.color },
});
