import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { BackHeader } from '../components/layout/BackHeader';
import { SafeScrollView } from '../components/ui/SafeScrollView';
import { AppKeyboardAvoidingView } from '../components/ui/AppKeyboardAvoidingView';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useStripe } from '../stripe';
import { useTranslation } from '../i18n';
import { createStoreOrderIntent, previewStorePromo, formatStorePriceEuros } from '../api/store';
import { confirmPaymentFromClient } from '../api/payments';
import { lineHeightFor, theme } from '../theme';
import type { CartLine } from '../lib/cartStorage';

const BG = '#0F0F0F';
const ACCENT = '#F18F34';
const BORDER = 'rgba(255,255,255,0.08)';
const CARD = 'rgba(255,255,255,0.04)';
const PAD_H = theme.spacing.lg;

type CartScreenProps = {
  onBack: () => void;
  /** Vaciar/cerrar carrito y volver a la tienda a seguir comprando. */
  onContinueShopping: () => void;
};

export function CartScreen({ onBack, onContinueShopping }: CartScreenProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const {
    lines,
    subtotalCents,
    totalCount,
    incrementItem,
    decrementItem,
    removeItem,
    clearCart,
  } = useCart();

  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);

  const [promoInput, setPromoInput] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountCents: number } | null>(
    null,
  );

  // Si cambia el subtotal (cantidades/ítems), el descuento previo puede quedar
  // desactualizado: lo reseteamos para forzar a re-aplicar el código.
  useEffect(() => {
    setAppliedPromo(null);
    setPromoError(null);
  }, [subtotalCents]);

  const discountCents = appliedPromo?.discountCents ?? 0;
  const totalCents = Math.max(0, subtotalCents - discountCents);

  const handleApplyPromo = useCallback(async () => {
    const token = session?.access_token;
    const code = promoInput.trim();
    if (!code || !token || lines.length === 0) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      const items = lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity }));
      const res = await previewStorePromo(items, code, token);
      if (!res.ok || res.discountCents == null || !res.code) {
        setAppliedPromo(null);
        setPromoError(res.error ?? t('tienda.cart.promoInvalid'));
        return;
      }
      setAppliedPromo({ code: res.code, discountCents: res.discountCents });
    } catch {
      setPromoError(t('tienda.cart.promoInvalid'));
    } finally {
      setPromoLoading(false);
    }
  }, [promoInput, session?.access_token, lines, t]);

  const handleRemovePromo = useCallback(() => {
    setAppliedPromo(null);
    setPromoInput('');
    setPromoError(null);
  }, []);

  const handleCheckout = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      Alert.alert(t('alerts.error.title'), t('common.paymentStartError'));
      return;
    }
    if (lines.length === 0) return;

    try {
      setPaying(true);
      const items = lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity }));
      const intentRes = await createStoreOrderIntent(items, token, appliedPromo?.code ?? null);
      if (!intentRes.ok || !intentRes.clientSecret || !intentRes.paymentIntentId) {
        Alert.alert(
          t('alerts.error.title'),
          intentRes.error ?? t('tienda.cart.checkoutError'),
        );
        return;
      }

      const returnURL = ExpoLinking.createURL('stripe-redirect');
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: intentRes.clientSecret,
        merchantDisplayName: 'WeMatch Padel',
        returnURL,
      });
      if (initErr) {
        Alert.alert(t('alerts.error.title'), t('common.paymentConfiguredError'));
        return;
      }

      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        if (presentErr.code !== 'Canceled') {
          Alert.alert(t('alerts.error.title'), t('common.paymentProcessError'));
        }
        return;
      }

      const confirmRes = await confirmPaymentFromClient(intentRes.paymentIntentId, token);
      if (!confirmRes.ok) {
        Alert.alert(t('alerts.error.title'), confirmRes.error ?? t('tienda.cart.checkoutError'));
        return;
      }

      clearCart();
      setSuccess(true);
    } catch (e) {
      Alert.alert(
        t('alerts.error.title'),
        e instanceof Error ? e.message : t('tienda.cart.checkoutError'),
      );
    } finally {
      setPaying(false);
    }
  }, [
    session?.access_token,
    lines,
    appliedPromo,
    initPaymentSheet,
    presentPaymentSheet,
    clearCart,
    t,
  ]);

  if (success) {
    return (
      <View style={styles.root}>
        <BackHeader title={t('tienda.cart.title')} tone="dark" onBack={onBack} />
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </View>
          <Text style={styles.successTitle}>{t('tienda.cart.successTitle')}</Text>
          <Text style={styles.successBody}>{t('tienda.cart.successBody')}</Text>
          <Pressable
            onPress={onContinueShopping}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>{t('tienda.cart.continueShopping')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (lines.length === 0) {
    return (
      <View style={styles.root}>
        <BackHeader title={t('tienda.cart.title')} tone="dark" onBack={onBack} />
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="cart-outline" size={40} color="#6b7280" />
          </View>
          <Text style={styles.emptyTitle}>{t('tienda.cart.empty')}</Text>
          <Text style={styles.emptyHint}>{t('tienda.cart.emptyHint')}</Text>
          <Pressable
            onPress={onContinueShopping}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>{t('tienda.cart.goToShop')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <BackHeader
        title={t('tienda.cart.title')}
        tone="dark"
        onBack={onBack}
        rightSlot={
          <Pressable
            onPress={clearCart}
            hitSlop={8}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
          >
            <Text style={styles.clearBtnText}>{t('tienda.cart.clear')}</Text>
          </Pressable>
        }
      />
      <AppKeyboardAvoidingView>
      <SafeScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.countLabel}>
          {t('common.itemsCount', { count: totalCount })}
        </Text>
        {lines.map((line) => (
          <CartRow
            key={line.product.id}
            line={line}
            onIncrement={() => incrementItem(line.product.id)}
            onDecrement={() => decrementItem(line.product.id)}
            onRemove={() => removeItem(line.product.id)}
            maxReachedLabel={t('tienda.cart.maxStock')}
            removeLabel={t('tienda.cart.remove')}
          />
        ))}
      </SafeScrollView>

      <View style={styles.footer}>
        {appliedPromo ? (
          <View style={styles.promoAppliedRow}>
            <View style={styles.promoAppliedLeft}>
              <Ionicons name="pricetag" size={14} color="#22c55e" />
              <Text style={styles.promoAppliedCode}>{appliedPromo.code}</Text>
              <Text style={styles.promoAppliedLabel}>{t('tienda.cart.promoApplied')}</Text>
            </View>
            <Pressable onPress={handleRemovePromo} hitSlop={8}>
              <Text style={styles.promoRemoveText}>{t('tienda.cart.promoRemove')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.promoInputRow}>
            <TextInput
              value={promoInput}
              onChangeText={(text) => setPromoInput(text.toUpperCase())}
              placeholder={t('tienda.cart.promoPlaceholder')}
              placeholderTextColor="#6b7280"
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.promoInput}
              editable={!promoLoading}
              returnKeyType="done"
              onSubmitEditing={handleApplyPromo}
            />
            <Pressable
              onPress={handleApplyPromo}
              disabled={promoLoading || promoInput.trim().length === 0}
              style={({ pressed }) => [
                styles.promoApplyBtn,
                (promoLoading || promoInput.trim().length === 0) && styles.promoApplyBtnDisabled,
                pressed && styles.pressed,
              ]}
            >
              {promoLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.promoApplyText}>{t('tienda.cart.promoApply')}</Text>
              )}
            </Pressable>
          </View>
        )}
        {promoError ? <Text style={styles.promoErrorText}>{promoError}</Text> : null}

        {discountCents > 0 ? (
          <>
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>{t('tienda.cart.subtotal')}</Text>
              <Text style={styles.subtotalValue}>{formatStorePriceEuros(subtotalCents)}</Text>
            </View>
            <View style={styles.subtotalRow}>
              <Text style={styles.discountLabel}>{t('tienda.cart.discount')}</Text>
              <Text style={styles.discountValue}>-{formatStorePriceEuros(discountCents)}</Text>
            </View>
          </>
        ) : null}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('tienda.cart.total')}</Text>
          <Text style={styles.totalValue}>{formatStorePriceEuros(totalCents)}</Text>
        </View>
        <Pressable
          onPress={handleCheckout}
          disabled={paying}
          style={({ pressed }) => [
            styles.checkoutBtn,
            (pressed || paying) && styles.pressed,
          ]}
        >
          {paying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="lock-closed" size={16} color="#fff" />
              <Text style={styles.checkoutText}>{t('tienda.cart.checkout')}</Text>
            </>
          )}
        </Pressable>
      </View>
      </AppKeyboardAvoidingView>
    </View>
  );
}

function CartRow({
  line,
  onIncrement,
  onDecrement,
  onRemove,
  maxReachedLabel,
  removeLabel,
}: {
  line: CartLine;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  maxReachedLabel: string;
  removeLabel: string;
}) {
  const { product, quantity } = line;
  const atMax = product.stock > 0 && quantity >= product.stock;
  const lineTotalCents = product.priceCents * quantity;

  return (
    <View style={styles.row}>
      <Image source={{ uri: product.image }} style={styles.rowImg} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={styles.rowTexts}>
            {product.brand ? <Text style={styles.rowBrand}>{product.brand}</Text> : null}
            <Text style={styles.rowName} numberOfLines={2}>
              {product.name}
            </Text>
          </View>
          <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={removeLabel}>
            <Ionicons name="trash-outline" size={18} color="#9ca3af" />
          </Pressable>
        </View>

        <View style={styles.rowBottom}>
          <View style={styles.stepper}>
            <Pressable
              onPress={onDecrement}
              style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
            >
              <Ionicons name="remove" size={16} color="#fff" />
            </Pressable>
            <Text style={styles.stepQty}>{quantity}</Text>
            <Pressable
              onPress={onIncrement}
              disabled={atMax}
              style={({ pressed }) => [
                styles.stepBtn,
                atMax && styles.stepBtnDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="add" size={16} color={atMax ? '#6b7280' : '#fff'} />
            </Pressable>
          </View>
          <Text style={styles.rowPrice}>{formatStorePriceEuros(lineTotalCents)}</Text>
        </View>
        {atMax ? <Text style={styles.maxHint}>{maxReachedLabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: PAD_H,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  countLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: lineHeightFor(12),
    marginBottom: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    marginBottom: 12,
  },
  rowImg: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTexts: {
    flex: 1,
    minWidth: 0,
  },
  rowBrand: {
    color: '#6b7280',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    lineHeight: lineHeightFor(9),
    marginBottom: 3,
  },
  rowName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: lineHeightFor(13),
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stepBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  stepQty: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 18,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  rowPrice: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 0,
  },
  maxHint: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
  },
  footer: {
    paddingHorizontal: PAD_H,
    paddingTop: 14,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    backgroundColor: 'rgba(15,15,15,0.98)',
  },
  promoInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  promoInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  promoApplyBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  promoApplyBtnDisabled: {
    opacity: 0.5,
  },
  promoApplyText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  promoAppliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  promoAppliedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  promoAppliedCode: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  promoAppliedLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '500',
  },
  promoRemoveText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
  },
  promoErrorText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
    marginTop: -4,
    marginBottom: 10,
  },
  subtotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  subtotalLabel: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '500',
  },
  subtotalValue: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  discountLabel: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '500',
  },
  discountValue: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  totalLabel: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
  },
  totalValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: ACCENT,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: {},
    }),
  },
  checkoutText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  clearBtnText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: 10,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  emptyHint: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: 10,
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    marginBottom: 8,
  },
  successTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  successBody: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 14,
  },
  primaryBtn: {
    marginTop: 6,
    paddingHorizontal: 24,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
