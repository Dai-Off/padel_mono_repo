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
import { theme } from '../theme';

type TransaccionesScreenProps = {
  onBack: () => void;
};

function formatAmount(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  return currency === 'EUR' ? `${amount}€` : `${amount} ${currency}`;
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

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    succeeded: 'Completado',
    requires_action: 'Pendiente',
    processing: 'Procesando',
    failed: 'Fallido',
    refunded: 'Reembolsado',
  };
  return map[s] ?? s;
}

function statusColor(s: string): string {
  if (s === 'succeeded') return '#059669';
  if (s === 'failed' || s === 'refunded') return '#dc2626';
  return '#6b7280';
}

function TransactionRow({ t }: { t: Transaction }) {
  const desc =
    t.club_name && t.court_name
      ? `${t.club_name} · ${t.court_name}`
      : t.club_name ?? t.court_name ?? 'Partido';

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={[styles.statusDot, { backgroundColor: statusColor(t.status) }]} />
        <View>
          <Text style={styles.rowDesc} numberOfLines={1}>
            {desc}
          </Text>
          <Text style={styles.rowDate}>{formatDate(t.created_at)}</Text>
          <Text style={[styles.rowStatus, { color: statusColor(t.status) }]}>
            {statusLabel(t.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.rowAmount}>{formatAmount(t.amount_cents, t.currency)}</Text>
    </View>
  );
}

export function TransaccionesScreen({ onBack }: TransaccionesScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setError('Inicia sesión para ver tus transacciones');
      setTransactions([]);
      setLoading(false);
      return;
    }
    const res = await fetchTransactions(token);
    if (!res.ok) {
      setError(res.error ?? 'Error al cargar');
      setTransactions([]);
    } else {
      setError(null);
      setTransactions(res.transactions ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, [session?.access_token]);

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
      <BackHeader title="Todas las transacciones" onBack={onBack} />
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
            <Text style={styles.emptyText}>No hay transacciones</Text>
            <Text style={styles.emptySub}>Los pagos que hagas aparecerán aquí</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {transactions.map((t) => (
              <View key={t.id} style={styles.rowWrapper}>
                <TransactionRow t={t} />
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
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 0,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  rowDesc: { fontSize: theme.fontSize.base, fontWeight: '500', color: '#111827' },
  rowDate: { fontSize: theme.fontSize.sm, color: '#6b7280', marginTop: 2 },
  rowStatus: { fontSize: theme.fontSize.xs, marginTop: 2 },
  rowAmount: { fontSize: theme.fontSize.base, fontWeight: '600', color: '#111827' },
});
