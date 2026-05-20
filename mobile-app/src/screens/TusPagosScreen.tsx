import type { ComponentProps } from 'react';
import { useState } from 'react';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useStripe } from '../stripe';
import * as ExpoLinking from 'expo-linking';
import {
  createPaymentIntent,
  confirmPaymentFromClient,
  fetchCustomerPortalUrl,
  fetchPendingBookings,
  type PendingBookingPayment,
} from '../api/payments';
import { BackHeader } from '../components/layout/BackHeader';
import { theme } from '../theme';

type TusPagosScreenProps = {
  onBack: () => void;
  onTransaccionesPress?: () => void;
  onMonederoPress?: () => void;
};

type PayOptionProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  onPress?: () => void;
};

function PayOption({ icon, title, onPress }: PayOptionProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={24} color="#4b5563" style={styles.optionIcon} />
      <Text style={styles.optionTitle}>{title}</Text>
      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </Pressable>
  );
}

export function TusPagosScreen({ onBack, onTransaccionesPress, onMonederoPress }: TusPagosScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loadingMetodos, setLoadingMetodos] = useState(false);
  const [pendingBookings, setPendingBookings] = useState<PendingBookingPayment[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);

  const loadPendingBookings = async () => {
    const token = session?.access_token;
    if (!token) {
      setPendingBookings([]);
      return;
    }
    setLoadingPending(true);
    try {
      const res = await fetchPendingBookings(token);
      if (res.ok && Array.isArray(res.bookings)) {
        setPendingBookings(res.bookings);
      } else {
        setPendingBookings([]);
      }
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    void loadPendingBookings();
  }, [session?.access_token]);

  const handleMetodosPago = async () => {
    const token = session?.access_token;
    if (!token) {
      Alert.alert('Sesión requerida', 'Inicia sesión para gestionar tus métodos de pago.');
      return;
    }
    setLoadingMetodos(true);
    try {
      const res = await fetchCustomerPortalUrl(token);
      if (!res.ok || !res.url) {
        Alert.alert('Error', res.error ?? 'No se pudo abrir');
        return;
      }
      const canOpen = await Linking.canOpenURL(res.url);
      if (canOpen) {
        await Linking.openURL(res.url);
      } else {
        Alert.alert('Error', 'No se puede abrir el navegador');
      }
    } catch {
      Alert.alert('Error', 'Error de conexión');
    } finally {
      setLoadingMetodos(false);
    }
  };

  const handlePayPendingBooking = async (booking: PendingBookingPayment) => {
    const token = session?.access_token;
    if (!token) {
      Alert.alert('Sesión requerida', 'Inicia sesión para pagar.');
      return;
    }
    setPayingBookingId(booking.booking_id);
    try {
      const intentRes = await createPaymentIntent(booking.booking_id, token, undefined, booking.participant_id);
      if (!intentRes.ok || !intentRes.clientSecret || !intentRes.paymentIntentId) {
        Alert.alert('Error', intentRes.error ?? 'No se pudo iniciar el pago');
        return;
      }
      const returnURL = ExpoLinking.createURL('stripe-redirect');
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: intentRes.clientSecret,
        merchantDisplayName: 'WeMatch Padel',
        returnURL,
      });
      if (initErr) {
        Alert.alert('Error', 'No se pudo configurar el pago');
        return;
      }
      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        if (presentErr.code !== 'Canceled') {
          Alert.alert('Error', 'No se pudo procesar el pago');
        }
        return;
      }
      const confirmRes = await confirmPaymentFromClient(intentRes.paymentIntentId, token);
      if (!confirmRes.ok) {
        Alert.alert('Error', confirmRes.error ?? 'No se pudo confirmar el pago');
        return;
      }
      Alert.alert('Pago realizado', 'La reserva quedó pagada.');
      await loadPendingBookings();
    } finally {
      setPayingBookingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <BackHeader title="Tus pagos" onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (insets.bottom ?? 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.optionsList}>
          <Pressable
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
              loadingMetodos && styles.optionDisabled,
            ]}
            onPress={handleMetodosPago}
            disabled={loadingMetodos}
          >
            {loadingMetodos ? (
              <ActivityIndicator size="small" color="#4b5563" style={styles.optionIcon} />
            ) : (
              <Ionicons name="card-outline" size={24} color="#4b5563" style={styles.optionIcon} />
            )}
            <Text style={styles.optionTitle}>Métodos de pago</Text>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </Pressable>
          <View style={styles.optionDivider} />
          <PayOption icon="cash-outline" title="Monedero del club" onPress={onMonederoPress} />
          <View style={styles.optionDivider} />
          <PayOption
            icon="document-text-outline"
            title="Todas las transacciones"
            onPress={onTransaccionesPress}
          />
          <View style={styles.optionDivider} />
          <PayOption icon="home-outline" title="Membresías de clubes" onPress={() => {}} />
        </View>

        <View style={styles.pendingSection}>
          <Text style={styles.pendingTitle}>Reservas pendientes de pago</Text>
          {loadingPending ? (
            <ActivityIndicator size="small" color="#4b5563" />
          ) : pendingBookings.length === 0 ? (
            <Text style={styles.pendingEmpty}>No tienes reservas pendientes.</Text>
          ) : (
            pendingBookings.map((booking) => (
              <View key={booking.booking_id} style={styles.pendingCard}>
                <Text style={styles.pendingName}>
                  {booking.club_name ?? 'Club'} · {booking.court_name ?? 'Pista'}
                </Text>
                <Text style={styles.pendingMeta}>
                  {new Date(booking.start_at).toLocaleString()} · {(booking.amount_due_cents / 100).toFixed(2)} €
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.pendingPayBtn,
                    pressed && styles.optionPressed,
                    payingBookingId === booking.booking_id && styles.optionDisabled,
                  ]}
                  disabled={payingBookingId === booking.booking_id}
                  onPress={() => void handlePayPendingBooking(booking)}
                >
                  {payingBookingId === booking.booking_id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.pendingPayText}>Pagar ahora</Text>
                  )}
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.sm },
  optionsList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  optionPressed: { backgroundColor: '#f9fafb' },
  optionDisabled: { opacity: 0.7 },
  optionDivider: { height: 1, backgroundColor: '#f3f4f6' },
  optionIcon: { width: 28 },
  optionTitle: {
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
    color: '#111827',
  },
  pendingSection: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  pendingTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#111827',
  },
  pendingEmpty: {
    fontSize: theme.fontSize.sm,
    color: '#6b7280',
  },
  pendingCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    backgroundColor: '#fff',
  },
  pendingName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#111827',
  },
  pendingMeta: {
    fontSize: theme.fontSize.xs,
    color: '#6b7280',
  },
  pendingPayBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#00726b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pendingPayText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: theme.fontSize.sm,
  },
});
