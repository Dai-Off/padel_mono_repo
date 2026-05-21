import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyPlayerId } from '../api/players';
import {
  fetchPlayerWalletBalances,
  fetchWalletBalance,
  type ClubWalletBalance,
  type WalletTransaction,
} from '../api/wallet';
import { BackHeader } from '../components/layout/BackHeader';
import { theme } from '../theme';

const CARD = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.08)';
const EMERALD = theme.sidebar.iconVariants.emerald;

type MonederoScreenProps = {
  onBack: () => void;
};

function formatEuros(cents: number): string {
  const sign = cents < 0 ? '− ' : '';
  const n = Math.abs(cents) / 100;
  return `${sign}${n.toFixed(2).replace('.', ',')} €`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  if (today) return `Hoy, ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === d.toDateString()) {
    return `Ayer, ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function typeLabel(type: string): string {
  switch (type) {
    case 'credit':
      return 'Abono';
    case 'debit':
      return 'Cargo';
    case 'refund':
      return 'Devolución';
    case 'adjustment':
      return 'Ajuste';
    case 'organizer_debt':
      return 'Deuda organizador';
    default:
      return type;
  }
}

function WalletTransactionRow({ tx }: { tx: WalletTransaction }) {
  const positive = tx.amount_cents > 0;
  return (
    <View style={styles.txRow}>
      <View style={styles.txLeft}>
        <Ionicons
          name={positive ? 'arrow-down-circle' : 'arrow-up-circle'}
          size={18}
          color={positive ? EMERALD.color : theme.auth.error}
          style={styles.txIcon}
        />
        <View style={styles.txTextBlock}>
          <Text style={styles.txConcept} numberOfLines={2}>
            {tx.concept}
          </Text>
          <Text style={styles.txMeta}>
            {formatDate(tx.created_at)} · {typeLabel(tx.type)}
          </Text>
        </View>
      </View>
      <Text style={[styles.txAmount, positive ? styles.txAmountPositive : styles.txAmountNegative]}>
        {positive ? '+' : ''}
        {formatEuros(tx.amount_cents)}
      </Text>
    </View>
  );
}

function ClubBalanceCard({
  item,
  expanded,
  loadingTx,
  transactions,
  onToggle,
}: {
  item: ClubWalletBalance;
  expanded: boolean;
  loadingTx: boolean;
  transactions: WalletTransaction[];
  onToggle: () => void;
}) {
  const positive = item.balance_cents > 0;
  const debt = item.balance_cents < 0;
  const iconVariant = positive ? EMERALD : theme.sidebar.iconVariants.orange;

  return (
    <View style={styles.clubCard}>
      <Pressable
        style={({ pressed }) => [styles.clubHeader, pressed && styles.clubHeaderPressed]}
        onPress={onToggle}
      >
        <View style={styles.clubHeaderLeft}>
          <LinearGradient
            colors={[iconVariant.from, iconVariant.to]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.clubIconBox}
          >
            <Ionicons name="business-outline" size={20} color={iconVariant.color} />
          </LinearGradient>
          <View style={styles.clubTextBlock}>
            <Text style={styles.clubName} numberOfLines={1}>
              {item.club_name ?? 'Club'}
            </Text>
            <Text style={styles.clubHint}>
              {positive ? 'Saldo a favor' : debt ? 'Saldo pendiente' : 'Sin saldo'}
            </Text>
          </View>
        </View>
        <View style={styles.clubHeaderRight}>
          <Text
            style={[
              styles.clubBalance,
              positive && styles.balancePositive,
              debt && styles.balanceDebt,
              !positive && !debt && styles.balanceNeutral,
            ]}
          >
            {formatEuros(item.balance_cents)}
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.auth.textMuted} />
        </View>
      </Pressable>
      {expanded && (
        <View style={styles.txList}>
          {loadingTx ? (
            <ActivityIndicator size="small" color={theme.auth.accent} style={styles.txLoader} />
          ) : transactions.length === 0 ? (
            <Text style={styles.txEmpty}>Sin movimientos recientes.</Text>
          ) : (
            transactions.map((tx) => <WalletTransactionRow key={tx.id} tx={tx} />)
          )}
        </View>
      )}
    </View>
  );
}

export function MonederoScreen({ onBack }: MonederoScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [balances, setBalances] = useState<ClubWalletBalance[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedClubId, setExpandedClubId] = useState<string | null>(null);
  const [clubTransactions, setClubTransactions] = useState<WalletTransaction[]>([]);
  const [loadingClubTx, setLoadingClubTx] = useState(false);

  const loadBalances = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setBalances([]);
      setTotalCents(0);
      setError('Inicia sesión para ver tu monedero.');
      return;
    }
    const pid = playerId ?? (await fetchMyPlayerId(token));
    if (!pid) {
      setError('No se encontró tu perfil de jugador.');
      return;
    }
    if (!playerId) setPlayerId(pid);

    const res = await fetchPlayerWalletBalances(pid, token);
    if (!res.ok) {
      setError(res.error ?? 'No se pudo cargar el monedero');
      setBalances([]);
      setTotalCents(0);
      return;
    }
    setError(null);
    setBalances(res.balances ?? []);
    setTotalCents(res.total_balance_cents ?? 0);
  }, [session?.access_token, playerId]);

  useEffect(() => {
    setLoading(true);
    void loadBalances().finally(() => setLoading(false));
  }, [loadBalances]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBalances();
    if (expandedClubId && playerId && session?.access_token) {
      const res = await fetchWalletBalance(playerId, expandedClubId, session.access_token);
      if (res.ok) setClubTransactions(res.transactions ?? []);
    }
    setRefreshing(false);
  };

  const handleToggleClub = async (clubId: string) => {
    if (expandedClubId === clubId) {
      setExpandedClubId(null);
      setClubTransactions([]);
      return;
    }
    setExpandedClubId(clubId);
    const token = session?.access_token;
    if (!token || !playerId) return;
    setLoadingClubTx(true);
    try {
      const res = await fetchWalletBalance(playerId, clubId, token);
      setClubTransactions(res.ok ? res.transactions ?? [] : []);
    } finally {
      setLoadingClubTx(false);
    }
  };

  return (
    <View style={styles.container}>
      <BackHeader title="Monedero" onBack={onBack} tone="dark" />
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
        <View style={styles.summaryCard}>
          <LinearGradient
            colors={[EMERALD.from, EMERALD.to]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.summaryIconWrap}
          >
            <Ionicons name="wallet-outline" size={28} color={EMERALD.color} />
          </LinearGradient>
          <Text style={styles.summaryLabel}>Saldo total en clubes</Text>
          {loading ? (
            <ActivityIndicator size="small" color={theme.auth.accent} style={styles.summaryLoader} />
          ) : (
            <Text
              style={[
                styles.summaryAmount,
                totalCents > 0 && styles.balancePositive,
                totalCents < 0 && styles.balanceDebt,
                totalCents === 0 && styles.balanceNeutral,
              ]}
            >
              {formatEuros(totalCents)}
            </Text>
          )}
          <Text style={styles.summaryHint}>
            Saldo a favor que el club te ha cargado (bonos, devoluciones o ajustes). Puedes usarlo al
            reservar o pagar en el club.
          </Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {loading ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator size="large" color={theme.auth.accent} />
          </View>
        ) : balances.length === 0 && !error ? (
          <View style={styles.emptyBox}>
            <Ionicons name="wallet-outline" size={48} color={theme.auth.textMuted} />
            <Text style={styles.emptyTitle}>Sin saldo en clubes</Text>
            <Text style={styles.emptyText}>
              Cuando un club te abone saldo a favor o un bono, aparecerá aquí por club.
            </Text>
          </View>
        ) : (
          <View style={styles.clubList}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Por club</Text>
              <LinearGradient
                colors={['rgba(241,143,52,0.2)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.sectionTitleLine}
              />
            </View>
            {balances.map((item) => (
              <ClubBalanceCard
                key={item.club_id}
                item={item}
                expanded={expandedClubId === item.club_id}
                loadingTx={loadingClubTx && expandedClubId === item.club_id}
                transactions={expandedClubId === item.club_id ? clubTransactions : []}
                onToggle={() => void handleToggleClub(item.club_id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.auth.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.lg, gap: theme.spacing.md },
  summaryCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    gap: 6,
  },
  summaryIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textMuted,
    fontWeight: '600',
  },
  summaryAmount: { fontSize: 32, fontWeight: '800', color: theme.auth.text },
  summaryLoader: { marginVertical: 8 },
  summaryHint: {
    fontSize: theme.fontSize.xs,
    color: theme.auth.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.error,
    textAlign: 'center',
  },
  centerLoader: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyTitle: { fontSize: theme.fontSize.base, fontWeight: '700', color: theme.auth.text },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: theme.auth.accent,
    textTransform: 'uppercase',
  },
  sectionTitleLine: {
    flex: 1,
    height: 1,
    borderRadius: 1,
  },
  clubList: { gap: theme.spacing.sm },
  clubCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: CARD,
  },
  clubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  clubHeaderPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  clubHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  clubHeaderRight: { alignItems: 'flex-end', gap: 4 },
  clubIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubTextBlock: { flex: 1, minWidth: 0 },
  clubName: { fontSize: theme.fontSize.base, fontWeight: '700', color: theme.auth.text },
  clubHint: { fontSize: theme.fontSize.xs, color: theme.auth.textMuted, marginTop: 2 },
  clubBalance: { fontSize: theme.fontSize.base, fontWeight: '700' },
  balancePositive: { color: EMERALD.color },
  balanceDebt: { color: theme.auth.accent },
  balanceNeutral: { color: theme.auth.text },
  txList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  txLoader: { paddingVertical: theme.spacing.md },
  txEmpty: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textMuted,
    paddingVertical: theme.spacing.md,
    textAlign: 'center',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  txLeft: { flex: 1, flexDirection: 'row', gap: 8, minWidth: 0 },
  txIcon: { marginTop: 2 },
  txTextBlock: { flex: 1, minWidth: 0 },
  txConcept: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.auth.text },
  txMeta: { fontSize: theme.fontSize.xs, color: theme.auth.textMuted, marginTop: 2 },
  txAmount: { fontSize: theme.fontSize.sm, fontWeight: '700' },
  txAmountPositive: { color: EMERALD.color },
  txAmountNegative: { color: theme.auth.error },
});
