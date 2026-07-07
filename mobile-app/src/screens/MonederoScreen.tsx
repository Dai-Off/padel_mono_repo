import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyPlayerId } from '../api/players';
import { fetchCustomerPortalUrl, fetchPendingBookings } from '../api/payments';
import { fetchPlayerWalletBalances } from '../api/wallet';
import { BackHeader } from '../components/layout/BackHeader';
import { formatLocale, useTranslation } from '../i18n';
import { theme } from '../theme';
import { isFeatureHidden } from '../config';

const CARD = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.08)';
const EMERALD = theme.sidebar.iconVariants.emerald;

type MonederoScreenProps = {
  onBack: () => void;
  onPagosPendientesPress?: () => void;
  onMovimientosPress?: () => void;
  onTransaccionesPress?: () => void;
};

function formatAmount(cents: number, locale: string): string {
  const abs = Math.abs(cents) / 100;
  return `${abs.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

function LinkRow({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  disabled,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  badge?: number;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.linkRow, pressed && !disabled && styles.pressed, disabled && styles.btnDisabled]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
    >
      <Ionicons
        name={icon}
        size={22}
        color={disabled ? theme.auth.textMuted : theme.auth.accent}
        style={styles.linkIcon}
      />
      <View style={styles.linkTextBlock}>
        <Text style={[styles.linkTitle, disabled && styles.linkTitleDisabled]}>{title}</Text>
        {subtitle ? <Text style={styles.linkSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge != null && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      {!disabled ? <Ionicons name="chevron-forward" size={18} color={theme.auth.textMuted} /> : null}
    </Pressable>
  );
}

export function MonederoScreen({
  onBack,
  onPagosPendientesPress,
  onMovimientosPress,
  onTransaccionesPress,
}: MonederoScreenProps) {
  const insets = useSafeAreaInsets();
  const { locale, t } = useTranslation();
  const numberLocale = formatLocale(locale);
  const { session } = useAuth();

  const [totalCents, setTotalCents] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingMethods, setOpeningMethods] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setTotalCents(0);
      setPendingCount(0);
      setError(t('wallet.walletLogin'));
      return;
    }

    const pid = await fetchMyPlayerId(token);
    if (!pid) {
      setError(t('wallet.walletProfileNotFound'));
      setTotalCents(0);
      setPendingCount(0);
      return;
    }

    const [balancesRes, pendingRes] = await Promise.all([
      fetchPlayerWalletBalances(pid, token),
      fetchPendingBookings(token),
    ]);

    if (!balancesRes.ok) {
      setError(balancesRes.error ?? t('wallet.walletLoadError'));
      setTotalCents(0);
      setPendingCount(0);
      return;
    }

    setError(null);
    setTotalCents(balancesRes.total_balance_cents ?? 0);
    setPendingCount(
      pendingRes.ok && Array.isArray(pendingRes.bookings) ? pendingRes.bookings.length : 0,
    );
  }, [session?.access_token, t]);

  useEffect(() => {
    setLoading(true);
    void loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleMethods = async () => {
    const token = session?.access_token;
    if (!token) {
      Alert.alert(t('common.sessionRequired'), t('wallet.loginManagePayments'));
      return;
    }
    setOpeningMethods(true);
    try {
      const res = await fetchCustomerPortalUrl(token);
      if (!res.ok || !res.url) {
        Alert.alert(t('common.error'), res.error ?? t('common.openError'));
        return;
      }
      const canOpen = await Linking.canOpenURL(res.url);
      if (canOpen) {
        await Linking.openURL(res.url);
      } else {
        Alert.alert(t('common.error'), t('common.browserOpenError'));
      }
    } catch {
      Alert.alert(t('common.error'), t('common.connectionError'));
    } finally {
      setOpeningMethods(false);
    }
  };

  const pendingSubtitle =
    pendingCount > 0
      ? t('wallet.walletPendingPaymentsSub', { count: pendingCount })
      : t('wallet.walletPendingPaymentsSubEmpty');

  return (
    <View style={styles.container}>
      <BackHeader title={t('wallet.walletTitle')} onBack={onBack} tone="dark" />
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
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>{t('wallet.walletAvailableBalance')}</Text>
            <Text
              style={[
                styles.balanceAmount,
                totalCents > 0 && styles.balancePositive,
                totalCents < 0 && styles.balanceDebt,
                totalCents === 0 && styles.balanceNeutral,
              ]}
            >
              {formatAmount(totalCents, numberLocale)}
            </Text>
            <Text style={styles.balanceHint}>{t('wallet.walletClubBalanceHint')}</Text>
            {!isFeatureHidden('wallet.loadFunds') && (
              <Pressable style={[styles.primaryBtn, styles.btnDisabled]} disabled>
                <Text style={[styles.primaryBtnText, styles.btnTextDisabled]}>
                  {t('wallet.walletLoadFunds')}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.actionRow}>
            {!isFeatureHidden('wallet.withdraw') && (
              <Pressable style={[styles.secondaryBtn, styles.actionBtn, styles.btnDisabled]} disabled>
                <Text style={[styles.secondaryBtnText, styles.btnTextDisabled]}>
                  {t('wallet.walletWithdraw')}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.actionBtn,
                pressed && styles.pressed,
                openingMethods && styles.btnDisabled,
              ]}
              onPress={() => void handleMethods()}
              disabled={openingMethods}
            >
              {openingMethods ? (
                <ActivityIndicator size="small" color={theme.auth.text} />
              ) : (
                <Text style={styles.secondaryBtnText}>{t('wallet.paymentMethods')}</Text>
              )}
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('wallet.walletActivitySection')}</Text>
            <View style={styles.linksCard}>
              <LinkRow
                icon="time-outline"
                title={t('wallet.walletPendingPayments')}
                subtitle={pendingSubtitle}
                badge={pendingCount}
                onPress={onPagosPendientesPress}
              />
              <View style={styles.linkDivider} />
              <LinkRow
                icon="swap-vertical-outline"
                title={t('wallet.walletRecentMovements')}
                subtitle={t('wallet.walletMovementsSub')}
                onPress={onMovimientosPress}
              />
              <View style={styles.linkDivider} />
              <LinkRow
                icon="document-text-outline"
                title={t('wallet.allTransactions')}
                subtitle={t('wallet.allTransactionsSub')}
                onPress={onTransaccionesPress}
              />
              {!isFeatureHidden('wallet.clubMemberships') && (
                <>
                  <View style={styles.linkDivider} />
                  <LinkRow
                    icon="home-outline"
                    title={t('wallet.clubMemberships')}
                    subtitle={t('wallet.clubMembershipsSoon')}
                    disabled
                  />
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.auth.bg },
  centerLoader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  balanceCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: BORDER,
    gap: theme.spacing.sm,
  },
  balanceLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textMuted,
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.auth.text,
  },
  balanceHint: {
    fontSize: theme.fontSize.xs,
    color: theme.auth.textMuted,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    marginBottom: theme.spacing.xs,
  },
  balancePositive: { color: EMERALD.color },
  balanceDebt: { color: theme.auth.accent },
  balanceNeutral: { color: theme.auth.text },
  primaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: theme.auth.accent,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.md,
  },
  primaryBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#fff',
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.md,
  },
  secondaryBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.auth.text,
  },
  pressed: { opacity: 0.88 },
  btnDisabled: { opacity: 0.45 },
  btnTextDisabled: { color: theme.auth.textMuted },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.error,
    textAlign: 'center',
  },
  section: { gap: theme.spacing.sm },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: theme.auth.text,
  },
  linksCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  linkIcon: { width: 28 },
  linkTextBlock: { flex: 1, gap: 2 },
  linkTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: theme.auth.text,
  },
  linkTitleDisabled: { color: theme.auth.textMuted },
  linkSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.auth.textMuted,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: theme.auth.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  linkDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginHorizontal: theme.spacing.md,
  },
});
