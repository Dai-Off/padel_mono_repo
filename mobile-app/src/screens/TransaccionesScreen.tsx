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

type TransaccionesScreenProps = {
  onBack: () => void;
};

function formatAmount(cents: number, currency: string, opts?: { negative?: boolean }): string {
  const n = Math.abs(cents) / 100;
  const amount = n.toFixed(2).replace('.', ',');
  const core = currency === 'EUR' ? `${amount} €` : `${amount} ${currency}`;
  return opts?.negative ? `− ${core}` : core;
}

function formatDate(iso: string, t: (key: string, params?: Record<string, string | number>) => string, numberLocale: string): string {
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
      : tx.club_name ?? tx.court_name ?? (tx.tournament_name ? t('wallet.txTournamentDesc', { name: tx.tournament_name }) : t('wallet.txDefaultDesc')));

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

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons
          name={isRefunded ? 'arrow-undo' : isPaid ? 'checkmark-circle' : 'ellipse-outline'}
          size={18}
          color={isRefunded ? '#0891b2' : isPaid ? '#16a34a' : '#9ca3af'}
          style={styles.rowIcon}
        />
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
        {formatAmount(tx.amount_cents, tx.currency, { negative: isRefunded })}
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
      setLoading(false);
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
    setLoading(false);
    setRefreshing(false);
  }, [session?.access_token, t]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <BackHeader title={t('wallet.transactionsTitle')} onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 + (insets.bottom ?? 0) },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1a1a1a" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={48} color="#9ca3af" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : transactions.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="receipt-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>{t('wallet.transactionsEmpty')}</Text>
            <Text style={styles.emptySub}>{t('wallet.transactionsEmptySub')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {transactions.map((item) => (
              <View key={item.id} style={styles.rowWrapper}>
                <TransactionRow t={t} numberLocale={numberLocale} tx={item} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: theme.spacing.lg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: theme.spacing.sm,
  },
  errorText: { fontSize: theme.fontSize.base, color: '#6b7280', textAlign: 'center' },
  emptyText: { fontSize: theme.fontSize.base, fontWeight: '600', color: '#374151' },
  emptySub: { fontSize: theme.fontSize.sm, color: '#9ca3af' },
  list: { gap: 0 },
  rowWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 0,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, minWidth: 0, gap: 10 },
  rowIcon: { marginTop: 2 },
  rowTextBlock: { flex: 1, minWidth: 0 },
  rowDesc: { fontSize: theme.fontSize.base, fontWeight: '500', color: '#111827' },
  rowDate: { fontSize: theme.fontSize.sm, color: '#6b7280', marginTop: 2 },
  rowKind: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 4,
  },
  rowKindPaid: { color: '#16a34a' },
  rowKindRefund: { color: '#0891b2' },
  rowAmount: { fontSize: theme.fontSize.base, fontWeight: '600', color: '#111827' },
  rowAmountRefund: { color: '#0891b2' },
});
