import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACCENT } from '../components/home/inicio/constants';
import { androidReadableText } from '../components/home/inicio/textStyles';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';
import { useStripe } from '../stripe';
import { confirmPaymentFromClient, createIntentForSeasonPassElite } from '../api/payments';
import {
  fetchSeasonPassMe,
  type SeasonPassMeOk,
  type SeasonPassMissionDto,
} from '../api/seasonPass';

type Props = { onBack: () => void };

type PassTab = 'rewards' | 'missions';
type MissionPeriod = 'daily' | 'weekly' | 'monthly';

const BG = '#0F0F0F';
const BORDER = 'rgba(255,255,255,0.1)';
const PAD = 20;
const DEFAULT_SP_PER_LEVEL = 1000;

function daysLeftFromEndsAt(endsAtIso: string | undefined): number {
  if (!endsAtIso) return 0;
  const end = new Date(endsAtIso).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

function formatEurFromCents(cents: number): string {
  const v = Math.max(0, Math.round(cents)) / 100;
  return `${v.toFixed(2).replace('.', ',')} €`;
}

function HeroParticles() {
  const anims = useRef(
    Array.from({ length: 14 }, () => new Animated.Value(0))
  ).current;
  useEffect(() => {
    const loops = anims.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 2500 + (i % 5) * 700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 2500 + (i % 5) * 700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);

  const spots = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: `${8 + ((i * 5.9) % 84)}%` as const,
        top: `${15 + ((i * 13) % 70)}%` as const,
        size: i % 3 === 0 ? 5 : 3,
        opacity: 0.35 + (i % 4) * 0.15,
        delay: (i % 6) * 500,
      })),
    []
  );

  return (
    <>
      {spots.map((s, i) => {
        const ty = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [0, -18],
        });
        const op = anims[i].interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0.5, 1, 0.5],
        });
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.particle,
              {
                left: s.left,
                top: s.top,
                width: s.size,
                height: s.size,
                borderRadius: s.size / 2,
                backgroundColor: `rgba(241,143,52,${s.opacity})`,
                opacity: op,
                transform: [{ translateY: ty }],
              },
            ]}
          />
        );
      })}
    </>
  );
}

function RadialPulse() {
  const o = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.7, duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.radialHost, { opacity: o }]}
    >
      <LinearGradient
        colors={['rgba(241,143,52,0.28)', 'transparent']}
        start={{ x: 0.25, y: 0.6 }}
        end={{ x: 0.9, y: 0.9 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function ShimmerBar({ pct }: { pct: number }) {
  const wAnim = useRef(new Animated.Value(0)).current;
  const xShim = useRef(new Animated.Value(0)).current;
  const n = Number(pct);
  const pctSafe = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

  useEffect(() => {
    Animated.timing(wAnim, {
      toValue: Math.max(0.04, pctSafe),
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pctSafe, wAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(xShim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(xShim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [xShim]);

  const fillWidth = wAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const shimmerTx = xShim.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 400],
  });

  return (
    <View style={styles.barTrackHero}>
      <Animated.View style={[styles.barFillClip, { width: fillWidth }]}>
        <LinearGradient
          colors={[ACCENT, '#FFA940', '#FFD700']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shimmerStrip,
            {
              transform: [{ translateX: shimmerTx }],
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.35)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function LevelTrackColumn({
  level,
  isUnlocked,
  isCurrent,
  hasElite,
  onPress,
}: {
  level: number;
  isUnlocked: boolean;
  isCurrent: boolean;
  hasElite: boolean;
  onPress: () => void;
}) {
  const scaleNode = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOp = useRef(new Animated.Value(0.7)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isCurrent) return;
    const s = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleNode, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(scaleNode, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    s.start();
    const r = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringScale, { toValue: 1.8, duration: 1600, useNativeDriver: true }),
          Animated.timing(ringScale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ringOp, { toValue: 0, duration: 1600, useNativeDriver: true }),
          Animated.timing(ringOp, { toValue: 0.7, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    r.start();
    const rot = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 5000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rot.start();
    return () => {
      s.stop();
      r.stop();
      rot.stop();
    };
  }, [isCurrent, ringOp, ringScale, scaleNode, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const thumbSize = 42;
  const w = 74;

  return (
    <Pressable onPress={onPress} style={{ width: w, alignItems: 'center' }}>
      <View style={{ height: thumbSize + 20, justifyContent: 'center' }}>
        <View style={{ opacity: hasElite && isUnlocked ? 1 : hasElite ? 0.28 : 0.2 }}>
          <LinearGradient
            colors={['rgba(168,85,247,0.35)', 'rgba(17,17,17,0.95)']}
            style={{
              width: thumbSize,
              height: thumbSize,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(250,204,21,0.35)',
            }}
          />
        </View>
        {!hasElite && (
          <View style={styles.eliteLockOverlay}>
            <Ionicons name="ribbon" size={14} color="#facc15" />
            <Ionicons name="lock-closed" size={12} color="#fde68a" />
          </View>
        )}
      </View>

      <View style={{ height: thumbSize, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <View
          style={[
            styles.trackLine,
            { backgroundColor: isUnlocked ? 'transparent' : 'rgba(255,255,255,0.07)' },
          ]}
        >
          {isUnlocked ? (
            <LinearGradient
              colors={[ACCENT, '#FFA940']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </View>
        {isCurrent ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulseRing,
              {
                opacity: ringOp,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
        ) : null}
        <Animated.View
          style={[
            styles.levelNode,
            {
              borderColor: isCurrent ? ACCENT : isUnlocked ? 'rgba(241,143,52,0.55)' : 'rgba(255,255,255,0.1)',
              backgroundColor: isCurrent
                ? 'rgba(241,143,52,0.25)'
                : isUnlocked
                  ? 'rgba(241,143,52,0.1)'
                  : 'rgba(255,255,255,0.04)',
              transform: [{ scale: isCurrent ? scaleNode : 1 }],
              shadowColor: isCurrent ? ACCENT : 'transparent',
              shadowOpacity: isCurrent ? 0.55 : 0,
              shadowRadius: isCurrent ? 14 : 0,
              shadowOffset: { width: 0, height: 0 },
              elevation: isCurrent ? 6 : 0,
            },
          ]}
        >
          {isCurrent ? (
            <Animated.View style={{ transform: [{ rotate }] }}>
              <Ionicons name="star" size={16} color={ACCENT} />
            </Animated.View>
          ) : isUnlocked ? (
            <Ionicons name="checkmark-circle" size={16} color="rgba(241,143,52,0.85)" />
          ) : (
            <Ionicons name="lock-closed" size={12} color="#4b5563" />
          )}
          <Text
            style={[
              styles.levelNodeNum,
              { color: isCurrent ? ACCENT : isUnlocked ? 'rgba(255,255,255,0.7)' : '#4b5563' },
            ]}
          >
            {level}
          </Text>
        </Animated.View>
      </View>

      <View style={{ height: thumbSize + 20, justifyContent: 'center' }}>
        <View style={{ opacity: isUnlocked ? 1 : 0.28 }}>
          <LinearGradient
            colors={['rgba(55,65,81,0.9)', 'rgba(17,24,39,0.95)']}
            style={{
              width: thumbSize,
              height: thumbSize,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="diamond-outline" size={20} color="#9ca3af" />
          </LinearGradient>
        </View>
      </View>
    </Pressable>
  );
}

function MissionRow({ m }: { m: SeasonPassMissionDto }) {
  const pct = Math.min(m.target > 0 ? m.current / m.target : 0, 1);
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, {
      toValue: pct,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, w, m.id]);
  const width = w.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={[
        styles.missionCard,
        m.done ? styles.missionCardDone : null,
      ]}
    >
      <View style={styles.missionRow}>
        <View style={[styles.missionIconBox, m.done && styles.missionIconBoxDone]}>
          <Text style={{ fontSize: 20 }}>{m.icon}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.missionTitleRow}>
            <Text style={styles.missionTitle} numberOfLines={2}>
              {m.title}
            </Text>
            {m.done ? <Ionicons name="checkmark-circle" size={16} color="#34d399" /> : null}
          </View>
          <Text style={styles.missionDesc}>{m.description}</Text>
          {m.reward_hint ? (
            <Text style={[styles.missionDesc, { fontSize: 10, opacity: 0.85, marginTop: -4 }]}>
              {m.reward_hint}
            </Text>
          ) : null}
          {!m.done ? (
            <>
              <View style={styles.missionBarBg}>
                <Animated.View style={{ width, height: '100%', borderRadius: 999, overflow: 'hidden' }}>
                  <LinearGradient
                    colors={[ACCENT, '#FFA940']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </View>
              <View style={styles.missionMeta}>
                <Text style={styles.missionMetaLeft}>
                  {m.current}/{m.target}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="flash" size={12} color={ACCENT} />
                  <Text style={styles.missionMetaSp}>+{m.sp_reward.toLocaleString('es-ES')} SP</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.missionMeta}>
              <Text style={styles.missionDoneText}>¡Completada!</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="flash" size={12} color="#34d399" />
                <Text style={[styles.missionMetaSp, { color: '#34d399' }]}>
                  +{m.sp_reward.toLocaleString('es-ES')} SP
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
      {!m.done && m.expires_label ? (
        <View style={styles.missionExpire}>
          <Ionicons name="time-outline" size={12} color="#4b5563" />
          <Text style={styles.missionExpireText}>Cierra · {m.expires_label}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function SeasonPassScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { session, isLoading: authLoading } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [tab, setTab] = useState<PassTab>('rewards');
  const [mTab, setMTab] = useState<MissionPeriod>('daily');
  const [showElite, setShowElite] = useState(false);
  const [elitePaying, setElitePaying] = useState(false);
  const [me, setMe] = useState<SeasonPassMeOk | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setMe(null);
      setLoadErr('Inicia sesión para ver tu progreso en el pase.');
      setLoading(false);
      return;
    }
    setLoadErr(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const data = await fetchSeasonPassMe(token, tz);
    if (!data) {
      setLoadErr('No se pudo cargar el pase. ¿Backend y migraciones 049 + 050 activas?');
      setMe(null);
    } else {
      setMe(data);
    }
    setLoading(false);
  }, [session?.access_token]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const spPer = me?.sp_per_level ?? DEFAULT_SP_PER_LEVEL;
  const levelMax = me?.level_max ?? 100;
  const level = me?.level ?? 1;
  const sp = me?.sp ?? 0;
  const into = me?.into_level ?? 0;
  const pct = me?.pct ?? 0;
  const spToNext = me?.sp_to_next ?? spPer;
  const eliteActive = me?.has_elite ?? false;
  const left = daysLeftFromEndsAt(me?.season.ends_at);
  const trackLevels = me?.track_levels ?? [];
  const spHowRows = me?.sp_how ?? [];

  const missionsByPeriod = useMemo(() => {
    const list = me?.missions ?? [];
    const g: Record<MissionPeriod, SeasonPassMissionDto[]> = { daily: [], weekly: [], monthly: [] };
    for (const m of list) {
      if (m.period === 'daily' || m.period === 'weekly' || m.period === 'monthly') {
        g[m.period].push(m);
      }
    }
    return g;
  }, [me?.missions]);

  const periodTabs = useMemo(() => {
    const raw = me?.mission_period_tabs;
    const out: { period: MissionPeriod; label: string }[] = [];
    const seen = new Set<string>();
    if (Array.isArray(raw)) {
      for (const x of raw) {
        if (x && typeof x === 'object' && 'period' in x && 'label' in x) {
          const p = String((x as { period: string }).period);
          if (
            (p === 'daily' || p === 'weekly' || p === 'monthly') &&
            missionsByPeriod[p as MissionPeriod].length > 0 &&
            !seen.has(p)
          ) {
            seen.add(p);
            out.push({ period: p as MissionPeriod, label: String((x as { label: string }).label) });
          }
        }
      }
    }
    (['daily', 'weekly', 'monthly'] as const).forEach((p) => {
      if (missionsByPeriod[p].length > 0 && !seen.has(p)) {
        seen.add(p);
        out.push({ period: p, label: p });
      }
    });
    return out;
  }, [me?.mission_period_tabs, missionsByPeriod]);

  useEffect(() => {
    if (!periodTabs.length) return;
    if (!periodTabs.some((t) => t.period === mTab)) {
      setMTab(periodTabs[0].period);
    }
  }, [periodTabs, mTab]);

  const missions = missionsByPeriod[mTab];

  const contentOp = useRef(new Animated.Value(1)).current;

  /**
   * Pantalla única de espera: hidratación de auth o fetch del pase con sesión,
   * sin pintar chips/tabs con placeholders (evita cortes y renders por partes).
   */
  const awaitingPassPayload =
    authLoading || (Boolean(loading && session?.access_token) && me === null);
  const passReady = me !== null;

  const pendingSP = useMemo(
    () => missions.filter((x) => !x.done).reduce((a, x) => a + x.sp_reward, 0),
    [missions]
  );
  const doneCount = useMemo(() => missions.filter((x) => x.done).length, [missions]);

  const eliteBullets = useMemo(() => {
    const raw = me?.season?.elite_modal_bullets;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const o = x as { icon?: string; text?: string };
        const icon = typeof o.icon === 'string' ? o.icon : '📌';
        const text = typeof o.text === 'string' ? o.text : '';
        return text ? { icon, text } : null;
      })
      .filter((x): x is { icon: string; text: string } => x != null);
  }, [me?.season?.elite_modal_bullets]);

  const onTabChange = useCallback((t: PassTab) => {
    contentOp.setValue(0);
    setTab(t);
    Animated.timing(contentOp, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [contentOp]);

  const purchaseEliteWithStripe = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      Alert.alert('Inicia sesión', 'Necesitas una cuenta para comprar el Pase Elite.');
      return;
    }
    try {
      setElitePaying(true);
      const intentRes = await createIntentForSeasonPassElite(token);
      if (!intentRes.ok || !intentRes.clientSecret || !intentRes.paymentIntentId) {
        Alert.alert('Error', intentRes.error ?? 'No se pudo iniciar el pago. Inténtalo de nuevo.');
        return;
      }

      const returnURL = ExpoLinking.createURL('stripe-redirect');
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: intentRes.clientSecret,
        merchantDisplayName: 'WeMatch Padel',
        returnURL,
      });
      if (initErr) {
        Alert.alert('Error', 'Error al configurar el pago. Inténtalo de nuevo.');
        return;
      }

      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        if (presentErr.code !== 'Canceled') {
          Alert.alert('Error', 'Error al procesar el pago. Inténtalo de nuevo.');
        }
        return;
      }

      const confirmRes = await confirmPaymentFromClient(intentRes.paymentIntentId, token);
      if (!confirmRes.ok) {
        Alert.alert('Error', confirmRes.error ?? 'No se pudo confirmar el Pase Elite. Inténtalo de nuevo.');
        return;
      }

      await load();
      setShowElite(false);
      const paid = formatEurFromCents(intentRes.amountCents ?? 999);
      Alert.alert('Listo', `Pase Elite activado (${paid}).`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Error al procesar el pago.');
    } finally {
      setElitePaying(false);
    }
  }, [session?.access_token, initPaymentSheet, presentPaymentSheet, load]);

  const scrollBottom = theme.scrollBottomPadding + insets.bottom + 28;

  return (
    /** `ScreenLayout` ya aplica `paddingTop: insets.top` al contenedor; no duplicar aquí. */
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={passReady ? [1] : []}
        scrollEnabled={!awaitingPassPayload}
        contentContainerStyle={{
          paddingBottom: scrollBottom,
          flexGrow: awaitingPassPayload || !passReady ? 1 : undefined,
        }}
        refreshControl={
          passReady ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />
          ) : undefined
        }
      >
        {awaitingPassPayload ? (
          <View
            style={[
              styles.heroWrap,
              { minHeight: Math.max(windowHeight - insets.top - 8, 420) },
            ]}
          >
            <LinearGradient
              colors={['#1f0900', '#2d1200', BG]}
              locations={[0, 0.55, 1]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <RadialPulse />
            <Pressable
              onPress={onBack}
              hitSlop={14}
              style={({ pressed }) => [styles.backFab, { top: 8 }, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-back" size={18} color="#fff" />
            </Pressable>
            <View style={[styles.heroInner, styles.passLoadingInner]}>
              <ActivityIndicator color={ACCENT} size="large" />
              <Text style={styles.passLoadingHint}>Cargando pase…</Text>
            </View>
          </View>
        ) : passReady ? (
          <>
            <View style={styles.heroWrap}>
              <LinearGradient
                colors={['#1f0900', '#2d1200', BG]}
                locations={[0, 0.55, 1]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <RadialPulse />
              <HeroParticles />

              <Pressable
                onPress={onBack}
                hitSlop={14}
                style={({ pressed }) => [styles.backFab, { top: 8 }, pressed && styles.pressed]}
              >
                <Ionicons name="arrow-back" size={18} color="#fff" />
              </Pressable>

              <View style={styles.heroInner}>
                <View style={{ alignItems: 'center', marginBottom: 10 }}>
                  <View>
                    <LinearGradient
                      colors={['rgba(241,143,52,0.12)', 'rgba(241,143,52,0.06)']}
                      style={styles.seasonChip}
                    >
                      <Ionicons name="flame" size={14} color={ACCENT} />
                      <Text style={styles.seasonChipText}>
                        {me.season.hero_chip_label?.trim() || me.season.slug || '—'}
                      </Text>
                      <Ionicons name="flame" size={14} color={ACCENT} />
                    </LinearGradient>
                  </View>
                </View>

                <View>
                  <Text style={styles.heroTitle}>{me.season.title ?? '—'}</Text>
                  <Text style={styles.heroSub}>
                    {me.season.subtitle ?? ''}
                    {me.season.subtitle ? ' · ' : ''}
                    <Text style={styles.heroSubAccent}>{left} días restantes</Text>
                  </Text>
                </View>

                <View style={{ marginTop: 14 }}>
                  <View style={styles.levelCard}>
                    <View style={styles.levelCardTop}>
                      <View>
                        <Text style={styles.levelCardHint}>Tu nivel actual</Text>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'baseline' }}>
                          <Text style={styles.levelHuge}>{level}</Text>
                          <Text style={styles.levelSlash}>/ {levelMax}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.levelCardHint}>SP totales</Text>
                        <Text style={styles.spHuge}>{sp.toLocaleString('es-ES')}</Text>
                      </View>
                    </View>

                    <View style={styles.barLabels}>
                      <Text style={styles.barTiny}>Nivel {level}</Text>
                      <Text style={styles.barTiny}>Faltan {spToNext.toLocaleString('es-ES')} SP</Text>
                      <Text style={styles.barTiny}>Nivel {Math.min(levelMax, level + 1)}</Text>
                    </View>
                    <ShimmerBar pct={pct} />
                    <Text style={styles.barFoot}>
                      {into.toLocaleString('es-ES')} / {spPer.toLocaleString('es-ES')} SP en este nivel
                    </Text>

                    {!eliteActive ? (
                      <Pressable
                        onPress={() => setShowElite(true)}
                        style={({ pressed }) => [styles.eliteRow, pressed && styles.pressed]}
                      >
                        <LinearGradient
                          colors={['#1f1400', '#2d1f00']}
                          style={styles.eliteRowInner}
                        >
                          <Ionicons name="ribbon" size={16} color="#facc15" />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.eliteTitle}>Pase Elite</Text>
                            <Text style={styles.eliteSub}>
                              {me.season.elite_card_subtitle?.trim() || '—'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="#ca8a04" />
                        </LinearGradient>
                      </Pressable>
                    ) : (
                      <LinearGradient
                        colors={['#FFD700', '#FFA500']}
                        style={styles.eliteActiveBar}
                      >
                        <Ionicons name="ribbon" size={16} color="#000" />
                        <Text style={styles.eliteActiveText}>Pase Elite Activo</Text>
                      </LinearGradient>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* —— TABS (X7: activo naranja sólido) —— */}
            <View style={[styles.tabsSticky, { paddingTop: 10 }]}>
          <View style={styles.tabsRow}>
            <Pressable
              onPress={() => onTabChange('rewards')}
              style={[styles.tabMain, tab === 'rewards' && styles.tabMainOn]}
            >
              <Text style={[styles.tabMainTxt, tab === 'rewards' && styles.tabMainTxtOn]}>
                🏆 Recompensas
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onTabChange('missions')}
              style={[styles.tabMain, tab === 'missions' && styles.tabMainOn]}
            >
              <Text style={[styles.tabMainTxt, tab === 'missions' && styles.tabMainTxtOn]}>
                ⚡ Misiones
              </Text>
            </Pressable>
          </View>
        </View>

        <Animated.View style={{ opacity: contentOp, paddingHorizontal: PAD, paddingTop: 8 }}>
          {tab === 'rewards' ? (
            <View>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <Ionicons name="ribbon" size={12} color="#facc15" />
                  <Text style={styles.legendTxt}>Pase Elite</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={styles.legendDot} />
                  <Text style={styles.legendTxt}>Pase Libre</Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.trackScroll}
              >
                {trackLevels.map((lvl) => (
                  <LevelTrackColumn
                    key={lvl}
                    level={lvl}
                    isUnlocked={level >= lvl}
                    isCurrent={level === lvl}
                    hasElite={eliteActive}
                    onPress={() => {}}
                  />
                ))}
              </ScrollView>

              {spHowRows.length > 0 ? (
              <View style={styles.spBox}>
                <View style={styles.spBoxHead}>
                  <Ionicons name="flash" size={16} color={ACCENT} />
                  <Text style={styles.spBoxTitle}>Cómo ganar SP</Text>
                </View>
                {spHowRows.map((row, idx) => (
                  <View
                    key={`${row.label}-${idx}`}
                    style={[styles.spBoxRow, idx === spHowRows.length - 1 && styles.spBoxRowLast]}
                  >
                    <Text style={styles.spBoxLeft}>
                      <Text>{row.icon} </Text>
                      <Text style={styles.spBoxGray}>{row.label}</Text>
                    </Text>
                    <Text style={styles.spBoxOrange}>{row.sp_hint}</Text>
                  </View>
                ))}
              </View>
              ) : null}
            </View>
          ) : (
            <View>
              {periodTabs.length > 0 ? (
              <View style={styles.missionTabs}>
                {periodTabs.map(({ period: k, label }) => (
                  <Pressable
                    key={k}
                    onPress={() => setMTab(k)}
                    style={[styles.missionTab, mTab === k && styles.missionTabOn]}
                  >
                    <Text style={[styles.missionTabTxt, mTab === k && styles.missionTabTxtOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              ) : (
                <Text style={[styles.missionDesc, { textAlign: 'center', marginBottom: 12 }]}>
                  No hay misiones configuradas para esta temporada.
                </Text>
              )}
              <View style={styles.missionStats}>
                <View style={styles.missionStatBox}>
                  <Text style={styles.missionStatHint}>SP disponibles</Text>
                  <Text style={styles.missionStatVal}>+{pendingSP.toLocaleString('es-ES')}</Text>
                </View>
                <View style={styles.missionStatBox}>
                  <Text style={styles.missionStatHint}>Completadas</Text>
                  <Text style={styles.missionStatVal}>
                    {doneCount}
                    <Text style={styles.missionStatSlash}>/{missions.length}</Text>
                  </Text>
                </View>
              </View>
              {missions.map((m) => (
                <MissionRow key={m.id} m={m} />
              ))}
              {missions.length === 0 && periodTabs.length > 0 ? (
                <Text style={[styles.missionDesc, { textAlign: 'center', paddingVertical: 16 }]}>
                  No hay misiones en esta pestaña.
                </Text>
              ) : null}
            </View>
          )}
        </Animated.View>
          </>
        ) : (
          <View
            style={[
              styles.heroWrap,
              { minHeight: Math.max(windowHeight - insets.top - 8, 360) },
            ]}
          >
            <LinearGradient
              colors={['#1f0900', '#2d1200', BG]}
              locations={[0, 0.55, 1]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Pressable
              onPress={onBack}
              hitSlop={14}
              style={({ pressed }) => [styles.backFab, { top: 8 }, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-back" size={18} color="#fff" />
            </Pressable>
            <View style={[styles.heroInner, styles.passLoadingInner]}>
              {loadErr ? (
                <Text style={[styles.loadErrBanner, styles.passErrorText]}>{loadErr}</Text>
              ) : (
                <Text style={styles.passLoadingHint}>No se pudo mostrar el pase.</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={showElite} transparent animationType="fade" onRequestClose={() => setShowElite(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowElite(false)}>
            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          </Pressable>
          <View style={styles.modalSheetWrap} pointerEvents="box-none">
          <Pressable style={[styles.modalSheet, { paddingBottom: 24 + insets.bottom }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalGrab} />
            <LinearGradient
              colors={['rgba(255,215,0,0.12)', 'transparent']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.45 }}
            />
            <View style={styles.modalCrown}>
              <Text style={{ fontSize: 36 }}>👑</Text>
            </View>
            <Text style={styles.modalTitle}>Pase Elite</Text>
            <Text style={styles.modalSub}>
              {[me?.season.slug, me?.season.title].filter(Boolean).join(' · ') || 'Pase Elite'}
            </Text>
            <View style={{ gap: 12, marginBottom: 20 }}>
              {eliteBullets.length > 0 ? (
                eliteBullets.map((b) => (
                  <View key={b.text} style={styles.modalBullet}>
                    <Text style={{ fontSize: 18 }}>{b.icon}</Text>
                    <Text style={styles.modalBulletTxt}>{b.text}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.modalBulletTxt}>Beneficios según la configuración de tu temporada.</Text>
              )}
            </View>
            <Pressable
              onPress={() => void purchaseEliteWithStripe()}
              disabled={elitePaying}
              style={({ pressed }) => [pressed && !elitePaying && styles.pressed]}
            >
              <LinearGradient
                colors={['#FFD700', '#FFA500', '#FF6B00']}
                style={[styles.modalCta, elitePaying && { opacity: 0.85 }]}
              >
                {elitePaying ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.modalCtaTxt}>Obtener Pase Elite (pago con tarjeta)</Text>
                )}
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setShowElite(false)} style={{ marginTop: 12, paddingVertical: 8 }}>
              <Text style={styles.modalDismiss}>Continuar con Pase Libre</Text>
            </Pressable>
          </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  loadErrBanner: androidReadableText({
    textAlign: 'center',
    fontSize: 11,
    color: '#f87171',
    marginBottom: 8,
    paddingHorizontal: 8,
  }),
  passLoadingInner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 260,
    paddingBottom: 48,
  },
  passLoadingHint: androidReadableText({
    marginTop: 16,
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '600',
  }),
  passErrorText: {
    marginTop: 40,
    fontSize: 13,
    lineHeight: 20,
  },
  heroWrap: {
    position: 'relative',
    overflow: 'hidden',
    paddingBottom: 12,
  },
  radialHost: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
  },
  backFab: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInner: {
    paddingHorizontal: PAD,
    /** Despeja el FAB atrás (~36px + márgenes). El área segura superior la aplica `ScreenLayout`. */
    paddingTop: 46,
  },
  seasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.5)',
  },
  seasonChipText: androidReadableText({
    fontSize: 11,
    fontWeight: '900',
    color: ACCENT,
    letterSpacing: 2,
    textTransform: 'uppercase',
  }),
  heroTitle: androidReadableText({
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
  }),
  heroSub: androidReadableText({
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
  }),
  heroSubAccent: androidReadableText({
    color: '#fb923c',
    fontWeight: '700',
  }),
  levelCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 16,
  },
  levelCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  levelCardHint: androidReadableText({
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  }),
  levelHuge: androidReadableText({
    fontSize: 44,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 48,
  }),
  levelSlash: androidReadableText({
    fontSize: 15,
    color: '#4b5563',
    fontWeight: '700',
  }),
  spHuge: androidReadableText({
    fontSize: 22,
    fontWeight: '900',
    color: ACCENT,
  }),
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  barTiny: androidReadableText({ fontSize: 10, color: '#6b7280' }),
  barTrackHero: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  barFillClip: {
    height: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  shimmerStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 90,
  },
  barFoot: androidReadableText({
    fontSize: 10,
    color: '#4b5563',
    textAlign: 'right',
    marginTop: 6,
    marginBottom: 12,
  }),
  eliteRow: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.35)',
  },
  eliteRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  eliteTitle: androidReadableText({
    fontSize: 12,
    fontWeight: '900',
    color: '#facc15',
  }),
  eliteSub: androidReadableText({
    fontSize: 9,
    color: '#ca8a04',
    marginTop: 2,
  }),
  eliteActiveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 16,
  },
  eliteActiveText: androidReadableText({
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
  }),
  tabsSticky: {
    backgroundColor: BG,
    paddingHorizontal: PAD,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tabsRow: { flexDirection: 'row', gap: 8 },
  tabMain: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  tabMainOn: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  tabMainTxt: androidReadableText({
    fontSize: 13,
    fontWeight: '700',
    color: '#9ca3af',
  }),
  tabMainTxtOn: androidReadableText({ color: '#fff' }),
  legendRow: {
    flexDirection: 'row',
    gap: 20,
    paddingVertical: 8,
    marginBottom: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendTxt: androidReadableText({ fontSize: 11, color: '#6b7280' }),
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(241,143,52,0.6)',
  },
  trackScroll: {
    paddingVertical: 10,
    paddingRight: PAD,
    gap: 0,
    flexDirection: 'row',
  },
  trackLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: -1,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  levelNode: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNodeNum: androidReadableText({
    fontSize: 9,
    fontWeight: '900',
    marginTop: 1,
  }),
  pulseRing: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: ACCENT,
  },
  eliteLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 12,
  },
  milestoneCard: {
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  milestoneInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  milestoneThumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  milestoneHint: androidReadableText({
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  }),
  milestoneTitle: androidReadableText({
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  }),
  milestoneSub: androidReadableText({
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  }),
  spBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    marginBottom: 8,
  },
  spBoxHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  spBoxTitle: androidReadableText({ fontSize: 13, fontWeight: '800', color: '#fff' }),
  spBoxRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  spBoxLeft: androidReadableText({ fontSize: 12, marginBottom: 4 }),
  spBoxGray: { color: '#9ca3af' },
  spBoxOrange: androidReadableText({
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
    lineHeight: 17,
  }),
  spBoxRowLast: { borderBottomWidth: 0 },
  missionTabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  missionTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  missionTabOn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  missionTabTxt: androidReadableText({ fontSize: 11, fontWeight: '800', color: '#6b7280' }),
  missionTabTxtOn: androidReadableText({ color: '#fff' }),
  missionStats: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  missionStatBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    alignItems: 'center',
  },
  missionStatHint: androidReadableText({ fontSize: 10, color: '#6b7280', marginBottom: 4 }),
  missionStatVal: androidReadableText({ fontSize: 20, fontWeight: '900', color: ACCENT }),
  missionStatSlash: androidReadableText({ fontSize: 13, color: '#6b7280', fontWeight: '700' }),
  missionCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 10,
  },
  missionCardDone: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.25)',
  },
  missionRow: { flexDirection: 'row', gap: 10 },
  missionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionIconBoxDone: { backgroundColor: 'rgba(16,185,129,0.2)' },
  missionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  missionTitle: androidReadableText({ fontSize: 13, fontWeight: '800', color: '#fff', flex: 1 }),
  missionDesc: androidReadableText({ fontSize: 11, color: '#9ca3af', marginBottom: 8 }),
  missionBarBg: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  missionMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  missionMetaLeft: androidReadableText({ fontSize: 10, color: '#6b7280' }),
  missionMetaSp: androidReadableText({ fontSize: 11, fontWeight: '900', color: ACCENT }),
  missionDoneText: androidReadableText({ fontSize: 11, fontWeight: '800', color: '#34d399' }),
  missionExpire: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  missionExpireText: androidReadableText({ fontSize: 10, color: '#4b5563' }),
  pressed: { opacity: 0.9 },
  modalSheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1a1000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(234,179,8,0.2)',
    paddingHorizontal: 20,
    paddingTop: 8,
    overflow: 'hidden',
  },
  modalGrab: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalCrown: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: androidReadableText({
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
  }),
  modalSub: androidReadableText({
    fontSize: 11,
    color: '#facc15',
    textAlign: 'center',
    marginBottom: 16,
  }),
  modalBullet: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalBulletTxt: androidReadableText({ flex: 1, fontSize: 13, color: '#d1d5db' }),
  modalCta: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalCtaTxt: androidReadableText({ fontSize: 16, fontWeight: '900', color: '#000' }),
  modalDismiss: androidReadableText({
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#6b7280',
  }),
});
