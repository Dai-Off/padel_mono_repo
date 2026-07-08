import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { useTranslation } from '../i18n';
import { useStripe } from '../stripe';
import { confirmPaymentFromClient, createIntentForSeasonPassElite } from '../api/payments';
import {
  fetchSeasonPassMe,
  rerollSeasonPassMission,
  type SeasonPassMeOk,
  type SeasonPassMissionDto,
  type SeasonPassTrackRewardDto,
} from '../api/seasonPass';
import { RARITY_CONFIG } from '../design/rarity';
import { resolveUnlockableIcon } from '../design/unlockableIcons';
import { FilterBottomSheet } from '../components/filters/FilterBottomSheet';
import { AuthButton } from '../components/auth/AuthButton';
import { PassHelpSheet } from '../components/seasonPass/PassHelpSheet';

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

/**
 * Tiempo restante hasta el fin del período, con granularidad según su tipo
 * (crea urgencia): diarias en horas/minutos, semanales en días/horas,
 * mensuales en días. Estático al render (no necesita segundos).
 */
function formatPeriodTimeLeft(endIso: string | null | undefined, period: MissionPeriod): string {
  if (!endIso) return '';
  const ms = new Date(endIso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return '';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (period === 'daily') return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  if (period === 'weekly') return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  return days > 0 ? `${days}d` : `${hours}h`; // monthly
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

/**
 * Thumb de recompensa del track (42px): render procedural desde el descriptor
 * `display` del backend — rareza (RARITY_CONFIG), preset de icono del catálogo,
 * paleta de colores para marcos. Sin recompensa → hueco tenue.
 */
function RewardThumb({
  reward,
  size,
  dimmed,
}: {
  reward: SeasonPassTrackRewardDto | null;
  size: number;
  dimmed: boolean;
}) {
  if (!reward) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.06)',
          backgroundColor: 'rgba(255,255,255,0.02)',
        }}
      />
    );
  }

  const d = reward.display;
  const rarity = RARITY_CONFIG[d.rarity ?? 'common'] ?? RARITY_CONFIG.common;
  const granted = reward.status === 'granted';
  const opacity = dimmed ? 0.28 : 1;

  let inner: ReactNode;
  if (d.kind === 'frame') {
    // Marco: anillo con su paleta (override `colors` o color de rareza).
    const palette =
      Array.isArray(d.colors) && d.colors.length >= 2
        ? (d.colors as [string, string, ...string[]])
        : ([rarity.color, rarity.border] as [string, string]);
    inner = (
      <LinearGradient
        colors={palette}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size - 14,
          height: size - 14,
          borderRadius: (size - 14) / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size - 22,
            height: size - 22,
            borderRadius: (size - 22) / 2,
            backgroundColor: '#111827',
          }}
        />
      </LinearGradient>
    );
  } else if (d.kind === 'sp' || d.kind === 'sp_boost') {
    inner = (
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 14 }}>{d.icon ?? '⚡'}</Text>
        <Text style={{ fontSize: 8, fontWeight: '800', color: ACCENT }} numberOfLines={1}>
          {d.label.replace(' SP', '')}
        </Text>
      </View>
    );
  } else {
    // trophy / badge / title: preset de icono del catálogo con color de rareza.
    inner = <Ionicons name={resolveUnlockableIcon(d.icon)} size={18} color={rarity.color} />;
  }

  return (
    <View style={{ opacity }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: rarity.border,
          backgroundColor: rarity.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {inner}
      </View>
      {granted ? (
        <View style={styles.rewardGrantedBadge}>
          <Ionicons name="checkmark" size={9} color="#0B1120" />
        </View>
      ) : null}
    </View>
  );
}

function LevelTrackColumn({
  level,
  isUnlocked,
  isCurrent,
  hasElite,
  freeReward,
  eliteReward,
}: {
  level: number;
  isUnlocked: boolean;
  isCurrent: boolean;
  hasElite: boolean;
  freeReward: SeasonPassTrackRewardDto | null;
  eliteReward: SeasonPassTrackRewardDto | null;
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
    <View style={{ width: w, alignItems: 'center' }}>
      <View style={{ height: thumbSize + 20, justifyContent: 'center' }}>
        <RewardThumb
          reward={eliteReward}
          size={thumbSize}
          dimmed={!hasElite || !isUnlocked}
        />
        {!hasElite && eliteReward && (
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
        <RewardThumb reward={freeReward} size={thumbSize} dimmed={!isUnlocked} />
      </View>
    </View>
  );
}

function MissionRow({
  m,
  canReroll = false,
  onReroll,
}: {
  m: SeasonPassMissionDto;
  canReroll?: boolean;
  onReroll?: () => void;
}) {
  const { t } = useTranslation();
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

  const spColor = m.done ? '#34d399' : ACCENT;
  return (
    <View style={[styles.missionCard, m.done ? styles.missionCardDone : null]}>
      <View style={styles.missionRow}>
        <View style={[styles.missionIconBox, m.done && styles.missionIconBoxDone]}>
          <Text style={{ fontSize: 17 }}>{m.icon}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.missionTitleRow}>
            <Text style={styles.missionTitle} numberOfLines={1}>
              {m.title}
            </Text>
            <View style={styles.missionSpBadge}>
              <Text style={[styles.missionMetaSp, { color: spColor }]}>
                {m.sp_reward.toLocaleString('es-ES')} SP
              </Text>
            </View>
            {!m.done && canReroll && onReroll ? (
              <Pressable
                onPress={onReroll}
                hitSlop={8}
                style={({ pressed }) => [styles.rerollBtn, pressed && styles.pressed]}
                accessibilityLabel={t('alerts.seasonPass.rerollTitle')}
              >
                <Ionicons name="refresh" size={13} color="rgba(255,255,255,0.6)" />
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.missionDesc} numberOfLines={1}>{m.description}</Text>
          {m.done ? (
            <View style={styles.missionDoneRow}>
              <Ionicons name="checkmark-circle" size={13} color="#34d399" />
              <Text style={styles.missionDoneText}>{t('alerts.seasonPass.missionCompleted')}</Text>
            </View>
          ) : (
            <View style={styles.missionProgressRow}>
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
              <Text style={styles.missionMetaLeft}>
                {m.current}/{m.target}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export function SeasonPassScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { session, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [tab, setTab] = useState<PassTab>('rewards');
  const [mTab, setMTab] = useState<MissionPeriod>('daily');
  const [showElite, setShowElite] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [elitePaying, setElitePaying] = useState(false);
  const [me, setMe] = useState<SeasonPassMeOk | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setMe(null);
      setLoadErr(t('alerts.seasonPass.loginRequiredLoad'));
      setLoading(false);
      return;
    }
    setLoadErr(null);
    const tz = 'Europe/Madrid';
    const data = await fetchSeasonPassMe(token, tz);
    if (!data) {
      setLoadErr(t('alerts.seasonPass.loadFail'));
      setMe(null);
    } else {
      setMe(data);
    }
    setLoading(false);
  }, [session?.access_token, t]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  // Confirmación de reroll: modal propio con el estilo dark de la app (el
  // Alert nativo desentona). rerollTarget != null = modal abierto.
  const [rerollTarget, setRerollTarget] = useState<SeasonPassMissionDto | null>(null);
  const [rerolling, setRerolling] = useState(false);
  const [rerollErr, setRerollErr] = useState<string | null>(null);
  // Fade propio y rápido: el animationType="fade" del Modal nativo dura ~300ms
  // fijos del sistema y se siente lento.
  const rerollFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (rerollTarget !== null) {
      rerollFade.setValue(0);
      Animated.timing(rerollFade, { toValue: 1, duration: 140, useNativeDriver: true }).start();
    }
  }, [rerollTarget, rerollFade]);

  const handleReroll = useCallback(
    (m: SeasonPassMissionDto) => {
      if (!m.assignment_id || rerolling) return;
      setRerollErr(null);
      setRerollTarget(m);
    },
    [rerolling],
  );

  const confirmReroll = useCallback(() => {
    const token = session?.access_token;
    const target = rerollTarget;
    if (!token || !target?.assignment_id || rerolling) return;
    setRerolling(true);
    setRerollErr(null);
    void rerollSeasonPassMission(token, target.assignment_id, 'Europe/Madrid')
      .then(async (r) => {
        if (!r.ok) {
          setRerollErr(t('alerts.seasonPass.rerollFail'));
          return;
        }
        setRerollTarget(null);
        await load();
      })
      .finally(() => setRerolling(false));
  }, [session?.access_token, rerollTarget, rerolling, load, t]);

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

  const trackRewardsByLevel = useMemo(() => {
    const map = new Map<number, SeasonPassTrackRewardDto[]>();
    for (const entry of me?.track_rewards ?? []) {
      map.set(entry.level, entry.rewards);
    }
    return map;
  }, [me?.track_rewards]);

  const boostPct = Math.round((me?.boosts?.total_bonus ?? 0) * 100);
  const boostSourcesLabel = useMemo(() => {
    const labels: Record<string, string> = {
      lesson_streak: t('home.seasonPass.boostSourceStreak'),
      pass_reward: t('home.seasonPass.boostSourceBooster'),
      catch_up: t('home.seasonPass.boostSourceCatchUp'),
      event: t('home.seasonPass.boostSourceEvent'),
    };
    return (me?.boosts?.breakdown ?? [])
      .map((b) => `${labels[b.source] ?? b.source} +${Math.round(b.bonus * 100)}%`)
      .join(' · ');
  }, [me?.boosts?.breakdown, t]);

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

  // Countdown del período activo: todas sus misiones comparten period_end_iso.
  const periodCountdown = useMemo(
    () => formatPeriodTimeLeft(missions[0]?.period_end_iso, mTab),
    [missions, mTab],
  );

  const contentOp = useRef(new Animated.Value(1)).current;

  /**
   * Pantalla única de espera: hidratación de auth o fetch del pase con sesión,
   * sin pintar chips/tabs con placeholders (evita cortes y renders por partes).
   */
  const awaitingPassPayload =
    authLoading || (Boolean(loading && session?.access_token) && me === null);
  const passReady = me !== null;

  const obtainedSP = useMemo(
    () => missions.filter((x) => x.done).reduce((a, x) => a + x.sp_reward, 0),
    [missions]
  );
  const totalSP = useMemo(() => missions.reduce((a, x) => a + x.sp_reward, 0), [missions]);
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
      Alert.alert(t('alerts.login.titleAlt'), t('alerts.seasonPass.login'));
      return;
    }
    try {
      setElitePaying(true);
      const intentRes = await createIntentForSeasonPassElite(token);
      if (!intentRes.ok || !intentRes.clientSecret || !intentRes.paymentIntentId) {
        Alert.alert(t('alerts.error.title'), intentRes.error ?? t('common.paymentStartError'));
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
        Alert.alert(t('alerts.error.title'), confirmRes.error ?? t('alerts.seasonPass.confirmFail'));
        return;
      }

      await load();
      setShowElite(false);
      const paid = formatEurFromCents(intentRes.amountCents ?? 999);
      Alert.alert(t('alerts.ready.title'), t('alerts.seasonPass.activated', { plan: paid }));
    } catch (e) {
      Alert.alert(t('alerts.error.title'), e instanceof Error ? e.message : t('common.paymentProcessError'));
    } finally {
      setElitePaying(false);
    }
  }, [session?.access_token, initPaymentSheet, presentPaymentSheet, load, t]);

  // El pase es full-screen y oculta la tab bar (MainApp), así que no necesita
  // el scrollBottomPadding pensado para dejarle sitio: solo safe area + aire.
  const scrollBottom = insets.bottom + 24;

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
              <Text style={styles.passLoadingHint}>{t('alerts.seasonPass.loading')}</Text>
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

              <Pressable
                onPress={() => setShowHowTo(true)}
                hitSlop={14}
                style={({ pressed }) => [styles.helpFab, { top: 8 }, pressed && styles.pressed]}
                accessibilityLabel={t('alerts.seasonPass.passHelpTitle')}
              >
                <Ionicons name="help" size={18} color="#fff" />
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
                    <Text style={styles.heroSubAccent}>{t('alerts.seasonPass.daysRemaining', { count: left })}</Text>
                  </Text>
                </View>

                <View style={{ marginTop: 14 }}>
                  <View style={styles.levelCard}>
                    <View style={styles.levelCardTop}>
                      <View>
                        <Text style={styles.levelCardHint}>{t('alerts.seasonPass.currentLevel')}</Text>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'baseline' }}>
                          <Text style={styles.levelHuge}>{level}</Text>
                          <Text style={styles.levelSlash}>/ {levelMax}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        {level >= levelMax ? (
                          <>
                            <Text style={styles.levelCardHint}>{t('alerts.seasonPass.totalSp')}</Text>
                            <Text style={styles.spHuge}>{sp.toLocaleString('es-ES')}</Text>
                            <Text style={styles.spTotalInline}>{t('alerts.seasonPass.seasonMax')}</Text>
                          </>
                        ) : (
                          <>
                            <Text style={styles.levelCardHint}>
                              {t('alerts.seasonPass.forNextLevel', { level: level + 1 })}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                              <Text style={styles.spHuge}>{spToNext.toLocaleString('es-ES')}</Text>
                              <Text style={styles.spHugeUnit}>SP</Text>
                            </View>
                            <Text style={styles.spTotalInline}>
                              {t('alerts.seasonPass.totalSpInline', { sp: sp.toLocaleString('es-ES') })}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>

                    <View style={styles.barLabels}>
                      <Text style={styles.barTiny}>{t('alerts.seasonPass.levelShort', { level })}</Text>
                      <Text style={styles.barTiny}>{t('alerts.seasonPass.levelShort', { level: Math.min(levelMax, level + 1) })}</Text>
                    </View>
                    <ShimmerBar pct={pct} />
                    <Text style={styles.barFoot}>
                      {t('alerts.seasonPass.spInLevel', {
                        into: into.toLocaleString('es-ES'),
                        total: spPer.toLocaleString('es-ES'),
                      })}
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
                            <Text style={styles.eliteTitle}>{t('alerts.seasonPass.elitePass')}</Text>
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
                        <Text style={styles.eliteActiveText}>{t('alerts.seasonPass.eliteActive')}</Text>
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
                {t('alerts.seasonPass.tabRewards')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onTabChange('missions')}
              style={[styles.tabMain, tab === 'missions' && styles.tabMainOn]}
            >
              <Text style={[styles.tabMainTxt, tab === 'missions' && styles.tabMainTxtOn]}>
                {t('alerts.seasonPass.tabMissions')}
              </Text>
            </Pressable>
          </View>
        </View>

        <Animated.View style={{ opacity: contentOp, paddingHorizontal: PAD, paddingTop: 8 }}>
          {tab === 'rewards' ? (
            <View>
              {boostPct > 0 ? (
                <View style={styles.boostBanner}>
                  <Ionicons name="flame" size={16} color={ACCENT} />
                  <Text style={styles.boostBannerTxt}>
                    {t('home.seasonPass.boostActive', { pct: boostPct })}
                  </Text>
                  <Text style={styles.boostBannerSources} numberOfLines={1}>
                    {boostSourcesLabel}
                  </Text>
                </View>
              ) : null}

              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <Ionicons name="ribbon" size={12} color="#facc15" />
                  <Text style={styles.legendTxt}>{t('alerts.seasonPass.legendElite')}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={styles.legendDot} />
                  <Text style={styles.legendTxt}>{t('alerts.seasonPass.legendFree')}</Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.trackScroll}
              >
                {trackLevels.map((lvl) => {
                  const levelRewards = trackRewardsByLevel.get(lvl) ?? [];
                  return (
                    <LevelTrackColumn
                      key={lvl}
                      level={lvl}
                      isUnlocked={level >= lvl}
                      isCurrent={level === lvl}
                      hasElite={eliteActive}
                      freeReward={levelRewards.find((r) => r.tier === 'free') ?? null}
                      eliteReward={levelRewards.find((r) => r.tier === 'elite') ?? null}
                    />
                  );
                })}
              </ScrollView>
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
                  {t('alerts.seasonPass.noMissionsConfigured')}
                </Text>
              )}
              <View style={styles.missionStats}>
                <View style={styles.missionStatBox}>
                  <Text style={styles.missionStatHint}>{t('alerts.seasonPass.completed')}</Text>
                  <Text style={styles.missionStatVal}>
                    {doneCount}
                    <Text style={styles.missionStatSlash}>/{missions.length}</Text>
                  </Text>
                </View>
                <View style={styles.missionStatBox}>
                  <Text style={styles.missionStatHint}>{t('alerts.seasonPass.spObtained')}</Text>
                  <Text style={styles.missionStatVal}>
                    {obtainedSP.toLocaleString('es-ES')}
                    <Text style={styles.missionStatSlash}>/{totalSP.toLocaleString('es-ES')}</Text>
                  </Text>
                </View>
              </View>
              {missions.map((m) => {
                const quotaAvailable =
                  m.period === 'daily'
                    ? me?.reroll?.daily_available === true
                    : m.period === 'weekly'
                      ? me?.reroll?.weekly_available === true
                      : false;
                const canReroll = (m.rerollable ?? false) && quotaAvailable && !rerolling;
                return (
                  <MissionRow
                    key={m.id}
                    m={m}
                    canReroll={canReroll}
                    onReroll={() => handleReroll(m)}
                  />
                );
              })}
              {missions.length === 0 && periodTabs.length > 0 ? (
                <Text style={[styles.missionDesc, { textAlign: 'center', paddingVertical: 16 }]}>
                  {t('alerts.seasonPass.noMissionsInTab')}
                </Text>
              ) : null}
              {periodCountdown ? (
                <View style={styles.periodCountdown}>
                  <Ionicons name="time-outline" size={13} color={ACCENT} />
                  <Text style={styles.periodCountdownTxt}>
                    {t('alerts.seasonPass.periodEndsIn', { time: periodCountdown })}
                  </Text>
                </View>
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
                <Text style={styles.passLoadingHint}>{t('alerts.seasonPass.displayFail')}</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={rerollTarget !== null}
        transparent
        animationType="none"
        onRequestClose={() => (!rerolling ? setRerollTarget(null) : undefined)}
      >
        <Animated.View style={{ flex: 1, opacity: rerollFade }}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (!rerolling ? setRerollTarget(null) : undefined)}
          >
            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          </Pressable>
          <View style={styles.rerollModalWrap} pointerEvents="box-none">
            <View style={styles.rerollModalCard}>
              <View style={styles.rerollModalIcon}>
                <Ionicons name="refresh" size={22} color={ACCENT} />
              </View>
              <Text style={styles.rerollModalTitle}>{t('alerts.seasonPass.rerollTitle')}</Text>
              <Text style={styles.rerollModalMsg}>
                {t('alerts.seasonPass.rerollMsg', { title: rerollTarget?.title ?? '' })}
              </Text>
              <Text style={styles.rerollModalQuota}>
                {rerollTarget?.period === 'weekly'
                  ? t('alerts.seasonPass.rerollQuotaWeekly')
                  : t('alerts.seasonPass.rerollQuotaDaily')}
              </Text>
              {rerollErr ? <Text style={styles.rerollModalErr}>{rerollErr}</Text> : null}
              <Pressable
                onPress={confirmReroll}
                disabled={rerolling}
                style={({ pressed }) => [
                  styles.rerollModalCta,
                  rerolling && { opacity: 0.7 },
                  pressed && !rerolling && styles.pressed,
                ]}
              >
                {rerolling ? (
                  <ActivityIndicator color="#0B1120" size="small" />
                ) : (
                  <Text style={styles.rerollModalCtaTxt}>
                    {t('alerts.seasonPass.rerollConfirm')}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setRerollTarget(null)}
                disabled={rerolling}
                style={{ marginTop: 10, paddingVertical: 6 }}
              >
                <Text style={styles.rerollModalCancelTxt}>
                  {t('alerts.seasonPass.rerollCancel')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </Modal>

      <FilterBottomSheet
        visible={showElite}
        title={t('alerts.seasonPass.elitePass')}
        onClose={() => setShowElite(false)}
        footer={
          <View style={styles.eliteSheetFooter}>
            <AuthButton
              loading={elitePaying}
              icon="ribbon"
              onPress={() => void purchaseEliteWithStripe()}
            >
              {t('alerts.seasonPass.getEliteCta')}
            </AuthButton>
            <Pressable onPress={() => setShowElite(false)} style={{ paddingVertical: 8 }}>
              <Text style={styles.modalDismiss}>{t('alerts.seasonPass.continueFree')}</Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.modalCrown}>
          <Text style={{ fontSize: 36 }}>👑</Text>
        </View>
        <Text style={styles.modalSub}>
          {[me?.season.slug, me?.season.title].filter(Boolean).join(' · ') || t('alerts.seasonPass.elitePass')}
        </Text>
        <View style={{ gap: 12, marginBottom: 4 }}>
          {eliteBullets.length > 0 ? (
            eliteBullets.map((b) => (
              <View key={b.text} style={styles.modalBullet}>
                <Text style={{ fontSize: 18 }}>{b.icon}</Text>
                <Text style={styles.modalBulletTxt}>{b.text}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.modalBulletTxt}>{t('alerts.seasonPass.modalBenefitsDefault')}</Text>
          )}
        </View>
      </FilterBottomSheet>

      <PassHelpSheet
        visible={showHowTo}
        onClose={() => setShowHowTo(false)}
        period={me?.season.subtitle ?? ''}
        daysLeft={left}
        spPerLevel={spPer}
        levelMax={levelMax}
      />
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
  helpFab: {
    position: 'absolute',
    right: 16,
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
    color: '#9ca3af',
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
    color: '#9ca3af',
    fontWeight: '700',
  }),
  spHuge: androidReadableText({
    fontSize: 22,
    fontWeight: '900',
    color: ACCENT,
  }),
  spHugeUnit: androidReadableText({
    fontSize: 12,
    fontWeight: '800',
    color: ACCENT,
  }),
  spTotalInline: androidReadableText({
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 4,
  }),
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  barTiny: androidReadableText({ fontSize: 10, color: '#9ca3af' }),
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
    color: '#9ca3af',
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
  rewardGrantedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#34d399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(241,143,52,0.08)',
    borderColor: 'rgba(241,143,52,0.25)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  boostBannerTxt: { color: ACCENT, fontSize: 13, fontWeight: '800' },
  boostBannerSources: { flex: 1, color: 'rgba(255,255,255,0.55)', fontSize: 11, textAlign: 'right' },
  rerollBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  rerollModalWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  rerollModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#141414',
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
  },
  rerollModalIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(241,143,52,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  rerollModalTitle: androidReadableText({
    color: '#F9FAFB',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  }),
  rerollModalMsg: androidReadableText({
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  }),
  rerollModalQuota: androidReadableText({
    color: ACCENT,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  }),
  rerollModalErr: androidReadableText({
    color: '#f87171',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  }),
  rerollModalCta: {
    marginTop: 16,
    alignSelf: 'stretch',
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  rerollModalCtaTxt: { color: '#0B1120', fontSize: 15, fontWeight: '800' },
  rerollModalCancelTxt: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
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
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
  },
  missionCardDone: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.25)',
  },
  missionRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  missionIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionIconBoxDone: { backgroundColor: 'rgba(16,185,129,0.2)' },
  missionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  missionTitle: androidReadableText({ fontSize: 13, fontWeight: '800', color: '#fff', flex: 1 }),
  missionSpBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  missionDesc: androidReadableText({ fontSize: 11, color: '#9ca3af', marginBottom: 7 }),
  missionProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  missionBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  missionMetaLeft: androidReadableText({ fontSize: 10, color: '#9ca3af', fontWeight: '700' }),
  missionMetaSp: androidReadableText({ fontSize: 12, fontWeight: '900', color: ACCENT }),
  missionDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  missionDoneText: androidReadableText({ fontSize: 11, fontWeight: '800', color: '#34d399' }),
  periodCountdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 5,
    marginTop: 4,
  },
  periodCountdownTxt: androidReadableText({ fontSize: 12, fontWeight: '700', color: ACCENT }),
  pressed: { opacity: 0.9 },
  eliteSheetFooter: {
    paddingHorizontal: 16,
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
  modalSub: androidReadableText({
    fontSize: 11,
    color: '#facc15',
    textAlign: 'center',
    marginBottom: 16,
  }),
  modalBullet: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalBulletTxt: androidReadableText({ flex: 1, fontSize: 13, color: '#d1d5db' }),
  modalDismiss: androidReadableText({
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#6b7280',
  }),
});
