import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ExpoLinking from 'expo-linking';
import { useAuth } from '../contexts/AuthContext';
import {
  confirmPaymentFromClient,
  createPaymentIntent,
  fetchPendingBookings,
  type PendingBookingPayment,
} from '../api/payments';
import { BackHeader } from '../components/layout/BackHeader';
import { formatLocale, useTranslation } from '../i18n';
import { useStripe } from '../stripe';
import { theme } from '../theme';

const CARD = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.08)';

type PagosPendientesScreenProps = {
  onBack: () => void;
};

function formatAmount(cents: number, locale: string): string {
  const abs = Math.abs(cents) / 100;
  return `${abs.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

function formatBookingWhen(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  numberLocale: string,
): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString(numberLocale, { hour: '2-digit', minute: '2-digit' });
  if (now.toDateString() === d.toDateString()) {
    return t('common.todayWithTime', { time });
  }
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

function PendingPaymentCard({
  booking,
  paying,
  onPay,
  t,
  numberLocale,
}: {
  booking: PendingBookingPayment;
  paying: boolean;
  onPay: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  numberLocale: string;
}) {
  const clubName = booking.club_name ?? t('common.clubFallback');
  return (
    <View style={styles.pendingCard}>
      <Text style={styles.pendingTitle}>
        {t('wallet.walletPendingBookingTitle', { club: clubName })}
      </Text>
      <Text style={styles.pendingWhen}>{formatBookingWhen(booking.start_at, t, numberLocale)}</Text>
      <Text style={styles.pendingAmount}>
        {booking.reservation_type === 'standard'
          ? t('wallet.walletCourtReservationTotal', {
              amount: formatAmount(booking.amount_due_cents, numberLocale),
            })
          : t('wallet.walletYourShare', {
              amount: formatAmount(booking.amount_due_cents, numberLocale),
            })}
      </Text>
      <Pressable
        style={({ pressed }) => [
          styles.primaryBtn,
          styles.pendingPayBtn,
          pressed && styles.pressed,
          paying && styles.btnDisabled,
        ]}
        disabled={paying}
        onPress={onPay}
      >
        {paying ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>{t('wallet.payNow')}</Text>
        )}
      </Pressable>
    </View>
  );
}

export function PagosPendientesScreen({ onBack }: PagosPendientesScreenProps) {
  const insets = useSafeAreaInsets();
  const { locale, t } = useTranslation();
  const numberLocale = formatLocale(locale);
  const { session } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [bookings, setBookings] = useState<PendingBookingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setBookings([]);
      return;
    }
    const res = await fetchPendingBookings(token);
    setBookings(res.ok && Array.isArray(res.bookings) ? res.bookings : []);
  }, [session?.access_token]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handlePay = async (booking: PendingBookingPayment) => {
    const token = session?.access_token;
    if (!token) {
      Alert.alert(t('common.sessionRequired'), t('wallet.loginToPay'));
      return;
    }
    setPayingBookingId(booking.booking_id);
    try {
      const intentRes = await createPaymentIntent(
        booking.booking_id,
        token,
        undefined,
        booking.participant_id,
      );
      if (!intentRes.ok || !intentRes.clientSecret || !intentRes.paymentIntentId) {
        Alert.alert(t('common.error'), intentRes.error ?? t('common.paymentStartError'));
        return;
      }
      const returnURL = ExpoLinking.createURL('stripe-redirect');
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: intentRes.clientSecret,
        merchantDisplayName: 'WeMatch Padel',
        returnURL,
      });
      if (initErr) {
        Alert.alert(t('common.error'), t('common.paymentConfiguredError'));
        return;
      }
      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        if (presentErr.code !== 'Canceled') {
          Alert.alert(t('common.error'), t('common.paymentProcessError'));
        }
        return;
      }
      const confirmRes = await confirmPaymentFromClient(intentRes.paymentIntentId, token);
      if (!confirmRes.ok) {
        Alert.alert(t('common.error'), confirmRes.error ?? t('common.paymentConfirmError'));
        return;
      }
      Alert.alert(t('common.paymentDone'), t('wallet.paymentSuccessBooking'));
      await load();
    } finally {
      setPayingBookingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <BackHeader title={t('wallet.walletPendingPayments')} onBack={onBack} tone="dark" />
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
          {bookings.length === 0 ? (
            <View style={styles.stateBox}>
              <Text style={styles.emptyText}>{t('wallet.pendingBookingsEmpty')}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {bookings.map((booking) => (
                <PendingPaymentCard
                  key={booking.booking_id}
                  booking={booking}
                  paying={payingBookingId === booking.booking_id}
                  onPay={() => void handlePay(booking)}
                  t={t}
                  numberLocale={numberLocale}
                />
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
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textMuted,
    textAlign: 'center',
  },
  list: { gap: theme.spacing.sm },
  pendingCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 6,
  },
  pendingTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.auth.text,
  },
  pendingWhen: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textMuted,
  },
  pendingAmount: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.auth.text,
    marginBottom: 4,
  },
  primaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: theme.auth.accent,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.lg,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: theme.fontSize.sm,
  },
  pendingPayBtn: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.88 },
  btnDisabled: { opacity: 0.6 },
});
