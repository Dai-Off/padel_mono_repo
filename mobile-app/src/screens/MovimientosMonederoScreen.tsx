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
import { useAuth } from '../contexts/AuthContext';
import { fetchMyPlayerId } from '../api/players';
import {
  fetchPlayerRecentTransactions,
  fetchPlayerWalletBalances,
  type WalletTransaction,
} from '../api/wallet';
import { BackHeader } from '../components/layout/BackHeader';
import { formatLocale, useTranslation } from '../i18n';
import { theme } from '../theme';

const CARD = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.08)';
const EMERALD = theme.sidebar.iconVariants.emerald;
const MOVEMENTS_LIMIT = 100;

type MovimientosMonederoScreenProps = {
  onBack: () => void;
};

function formatAmount(cents: number, locale: string, withSign = false): string {
  const positive = cents >= 0;
  const abs = Math.abs(cents) / 100;
  const formatted = abs.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const sign = withSign ? (positive ? '+ ' : '− ') : '';
  return `${sign}${formatted} €`;
}

function MovementRow({ tx, numberLocale }: { tx: WalletTransaction; numberLocale: string }) {
  const positive = tx.amount_cents > 0;
  return (
    <View style={styles.movementRow}>
      <Text
        style={[styles.movementAmount, positive ? styles.movementPositive : styles.movementNegative]}
        numberOfLines={1}
      >
        {formatAmount(tx.amount_cents, numberLocale, true)}
      </Text>
      <Text style={styles.movementConcept} numberOfLines={2}>
        {tx.concept}
      </Text>
    </View>
  );
}

export function MovimientosMonederoScreen({ onBack }: MovimientosMonederoScreenProps) {
  const insets = useSafeAreaInsets();
  const { locale, t } = useTranslation();
  const numberLocale = formatLocale(locale);
  const { session } = useAuth();

  const [movements, setMovements] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setError(t('wallet.walletLogin'));
      setMovements([]);
      return;
    }

    const playerId = await fetchMyPlayerId(token);
    if (!playerId) {
      setError(t('wallet.walletProfileNotFound'));
      setMovements([]);
      return;
    }

    const balancesRes = await fetchPlayerWalletBalances(playerId, token);
    if (!balancesRes.ok) {
      setError(balancesRes.error ?? t('wallet.walletLoadError'));
      setMovements([]);
      return;
    }

    setError(null);
    const clubIds = (balancesRes.balances ?? []).map((b) => b.club_id);
    const txs = await fetchPlayerRecentTransactions(playerId, clubIds, token, MOVEMENTS_LIMIT);
    setMovements(txs);
  }, [session?.access_token, t]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <BackHeader title={t('wallet.walletRecentMovements')} onBack={onBack} tone="dark" />
      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={theme.auth.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (insets.bottom ?? 0) }]}
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
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : movements.length === 0 ? (
            <View style={styles.stateBox}>
              <Text style={styles.emptyText}>{t('wallet.walletNoMovements')}</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {movements.map((tx, index) => (
                <View key={tx.id}>
                  <MovementRow tx={tx} numberLocale={numberLocale} />
                  {index < movements.length - 1 ? <View style={styles.rowDivider} /> : null}
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
    paddingHorizontal: theme.spacing.lg,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.error,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textMuted,
    textAlign: 'center',
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
  movementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  movementAmount: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    minWidth: 88,
  },
  movementPositive: { color: EMERALD.color },
  movementNegative: { color: theme.auth.error },
  movementConcept: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.auth.textMuted,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
  },
});
