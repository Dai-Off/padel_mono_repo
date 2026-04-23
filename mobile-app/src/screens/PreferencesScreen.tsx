import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyPlayerProfile, updateMyPlayerPreferences, type PlayerPreferences } from '../api/players';
import { fetchClubAvailabilityForCreate } from '../api/partidoClubs';
import { theme } from '../theme';

type PreferencesScreenProps = {
  onBack: () => void;
};

function TargetIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" stroke="#F18F34" strokeWidth={2} fill="none" />
      <Circle cx="12" cy="12" r="6" stroke="#F18F34" strokeWidth={2} fill="none" />
      <Circle cx="12" cy="12" r="2" stroke="#F18F34" strokeWidth={2} fill="none" />
    </Svg>
  );
}

function HeartIcon({
  color,
  filled = false,
  size = 20,
}: {
  color: string;
  filled?: boolean;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

function ClockIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" stroke="#C084FC" strokeWidth={2} fill="none" />
      <Polyline
        points="12 6 12 12 16 14"
        stroke="#C084FC"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ClockIconRed() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" stroke="#F87171" strokeWidth={2} fill="none" />
      <Polyline
        points="12 6 12 12 16 14"
        stroke="#F87171"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GlobeIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" stroke="#4ADE80" strokeWidth={2} fill="none" />
      <Path
        d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"
        stroke="#4ADE80"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 12h20"
        stroke="#4ADE80"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ZapIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
        stroke="#FACC15"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function UsersIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="#818CF8"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="9" cy="7" r="4" stroke="#818CF8" strokeWidth={2} fill="none" />
      <Path
        d="M22 21v-2a4 4 0 0 0-3-3.87"
        stroke="#818CF8"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 3.13a4 4 0 0 1 0 7.75"
        stroke="#818CF8"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const BG = '#0F0F0F';
const CARD = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.08)';
const ACCENT = '#F18F34';

const DEFAULT_PREFERENCES: PlayerPreferences = {
  preferredSide: 'both',
  preferredScheduleSlots: [],
  preferredDays: [],
  preferredPlayStyle: 'balanced',
  preferredMatchDurationMin: 90,
  preferredPartnerLevel: 'any',
  favoriteClubs: [],
  notifNewMatches: true,
  notifTournamentReminders: true,
  notifClassUpdates: true,
  notifChatMessages: true,
};

const FALLBACK_FAVORITE_CLUB_CANDIDATES = [
  { name: 'Pintopadel', subtitle: 'Madrid · 12 km' },
  { name: 'X7 Padel Sabadell Sur', subtitle: 'Fuenlabrada · 3 km' },
  { name: 'Club De Padel Mirasur', subtitle: 'Madrid · 15 km' },
  { name: 'CourtHub Padel Center', subtitle: 'Madrid · 5 km' },
  { name: 'Pádel Y Tenis San Martín', subtitle: 'Madrid · 7 km' },
  { name: 'Padel Family Indoor', subtitle: 'Madrid · 8 km' },
];

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function preferencesEqual(a: PlayerPreferences, b: PlayerPreferences): boolean {
  return (
    a.preferredSide === b.preferredSide &&
    arraysEqual(a.preferredScheduleSlots, b.preferredScheduleSlots) &&
    arraysEqual(a.preferredDays, b.preferredDays) &&
    a.preferredPlayStyle === b.preferredPlayStyle &&
    a.preferredMatchDurationMin === b.preferredMatchDurationMin &&
    a.preferredPartnerLevel === b.preferredPartnerLevel &&
    arraysEqual(a.favoriteClubs, b.favoriteClubs) &&
    a.notifNewMatches === b.notifNewMatches &&
    a.notifTournamentReminders === b.notifTournamentReminders &&
    a.notifClassUpdates === b.notifClassUpdates &&
    a.notifChatMessages === b.notifChatMessages
  );
}

export function PreferencesScreen({ onBack }: PreferencesScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [base, setBase] = useState<PlayerPreferences>(DEFAULT_PREFERENCES);
  const [prefs, setPrefs] = useState<PlayerPreferences>(DEFAULT_PREFERENCES);
  const [clubCandidates, setClubCandidates] = useState(FALLBACK_FAVORITE_CLUB_CANDIDATES);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMyPlayerProfile(token).then((profile) => {
      const next = profile?.preferences ?? DEFAULT_PREFERENCES;
      setBase(next);
      setPrefs(next);
      setLoading(false);
    });
  }, [token]);

  useEffect(() => {
    let mounted = true;
    fetchClubAvailabilityForCreate()
      .then((clubs) => {
        if (!mounted || clubs.length === 0) return;
        const mapped = clubs
          .map((club) => ({
            name: club.clubName,
            subtitle: club.location || 'Club disponible',
          }))
          .filter((club) => club.name.trim().length > 0);

        const deduped: { name: string; subtitle: string }[] = [];
        const seen = new Set<string>();
        for (const item of mapped) {
          const key = item.name.trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(item);
        }
        if (deduped.length > 0) {
          setClubCandidates(deduped);
        }
      })
      .catch(() => {
        // fallback silently to static club list
      });
    return () => {
      mounted = false;
    };
  }, []);

  const dirty = useMemo(() => !preferencesEqual(base, prefs), [base, prefs]);

  const toggleScheduleSlot = (slot: PlayerPreferences['preferredScheduleSlots'][number]) => {
    setPrefs((prev) => {
      const exists = prev.preferredScheduleSlots.includes(slot);
      return {
        ...prev,
        preferredScheduleSlots: exists
          ? prev.preferredScheduleSlots.filter((x) => x !== slot)
          : [...prev.preferredScheduleSlots, slot],
      };
    });
  };

  const toggleDay = (day: PlayerPreferences['preferredDays'][number]) => {
    setPrefs((prev) => {
      const exists = prev.preferredDays.includes(day);
      return {
        ...prev,
        preferredDays: exists ? prev.preferredDays.filter((x) => x !== day) : [...prev.preferredDays, day],
      };
    });
  };

  const toggleFavoriteClub = (club: string) => {
    setPrefs((prev) => {
      const exists = prev.favoriteClubs.includes(club);
      return {
        ...prev,
        favoriteClubs: exists ? prev.favoriteClubs.filter((x) => x !== club) : [...prev.favoriteClubs, club],
      };
    });
  };

  const save = async () => {
    if (!token) {
      Alert.alert('Preferencias', 'Inicia sesión para guardar cambios.');
      return;
    }
    setSaving(true);
    const res = await updateMyPlayerPreferences(token, prefs);
    setSaving(false);
    if (!res.ok) {
      Alert.alert('Preferencias', res.error);
      return;
    }
    setBase(res.player.preferences);
    setPrefs(res.player.preferences);
    Alert.alert('Preferencias', 'Cambios guardados.');
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Preferencias de Juego</Text>
          <Text style={styles.subtitle}>Personaliza tu experiencia</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: theme.spacing.xl + insets.bottom, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(241,143,52,0.2)' }]}>
                <TargetIcon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Lado Preferido</Text>
                <Text style={styles.cardSubtitle}>¿De qué lado prefieres jugar?</Text>
              </View>
            </View>
            <View style={styles.sideGrid}>
              {[
                { id: 'right', label: 'Derecha' },
                { id: 'left', label: 'Izquierda' },
                { id: 'both', label: 'Ambos' },
              ].map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => setPrefs((prev) => ({ ...prev, preferredSide: opt.id as PlayerPreferences['preferredSide'] }))}
                  style={styles.sideOptionPressable}
                >
                  {prefs.preferredSide === opt.id ? (
                    <LinearGradient
                      colors={['#F18F34', '#E95F32']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.sideOptionActive}
                    >
                      <Text style={styles.sideOptionActiveText} numberOfLines={1}>
                        {opt.label}
                      </Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.sideOptionIdle}>
                      <Text style={styles.sideOptionIdleText} numberOfLines={1}>
                        {opt.label}
                      </Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(234,179,8,0.2)' }]}>
                <HeartIcon color="#FACC15" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Clubes Favoritos</Text>
                <Text style={styles.cardSubtitle}>Marca tus clubes de confianza</Text>
              </View>
            </View>
            <View style={styles.columnGap}>
              {clubCandidates.map((club) => {
                const active = prefs.favoriteClubs.includes(club.name);
                return (
                  <Pressable
                    key={club.name}
                    onPress={() => toggleFavoriteClub(club.name)}
                    style={styles.clubRowPressable}
                  >
                    {active ? (
                      <LinearGradient
                        colors={['rgba(234,179,8,0.2)', 'rgba(249,115,22,0.2)']}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.clubRowActive}
                      >
                        <View style={styles.clubBuildingWrap}>
                          <Ionicons name="business-outline" size={18} color="#9CA3AF" />
                        </View>
                        <View style={styles.clubTextCol}>
                          <Text style={styles.clubName}>{club.name}</Text>
                          <Text style={styles.clubSubtitle}>{club.subtitle}</Text>
                        </View>
                        <View style={styles.clubHeartWrap}>
                          <HeartIcon color="#FACC15" filled />
                        </View>
                      </LinearGradient>
                    ) : (
                      <View style={styles.clubRow}>
                        <View style={styles.clubBuildingWrap}>
                          <Ionicons name="business-outline" size={18} color="#9CA3AF" />
                        </View>
                        <View style={styles.clubTextCol}>
                          <Text style={styles.clubName}>{club.name}</Text>
                          <Text style={styles.clubSubtitle}>{club.subtitle}</Text>
                        </View>
                        <View style={styles.clubHeartWrap}>
                          <HeartIcon color="#6B7280" />
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(168,85,247,0.2)' }]}>
                <ClockIcon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Horario Disponible</Text>
                <Text style={styles.cardSubtitle}>¿Cuándo sueles jugar?</Text>
              </View>
            </View>
            <View style={styles.columnGap}>
              {[
                { id: 'morning', label: 'Mañana', time: '08:00 - 12:00', emoji: '🌅' },
                { id: 'afternoon', label: 'Tarde', time: '12:00 - 18:00', emoji: '☀️' },
                { id: 'evening', label: 'Noche', time: '18:00 - 22:00', emoji: '🌆' },
                { id: 'night', label: 'Madrugada', time: '22:00 - 24:00', emoji: '🌙' },
              ].map((slot) => {
                const active = prefs.preferredScheduleSlots.includes(slot.id as PlayerPreferences['preferredScheduleSlots'][number]);
                return (
                  <Pressable
                    key={slot.id}
                    onPress={() => toggleScheduleSlot(slot.id as PlayerPreferences['preferredScheduleSlots'][number])}
                    style={styles.scheduleRowPressable}
                  >
                    {active ? (
                      <LinearGradient
                        colors={['rgba(241,143,52,0.2)', 'rgba(233,95,50,0.2)']}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.scheduleRowActive}
                      >
                        <Text style={styles.scheduleEmoji}>{slot.emoji}</Text>
                        <View style={styles.scheduleTextCol}>
                          <Text style={styles.scheduleTitle}>{slot.label}</Text>
                          <Text style={styles.scheduleTime}>{slot.time}</Text>
                        </View>
                        <View style={styles.scheduleDotOuterActive}>
                          <View style={styles.scheduleDotInner} />
                        </View>
                      </LinearGradient>
                    ) : (
                      <View style={styles.scheduleRowIdle}>
                        <Text style={styles.scheduleEmoji}>{slot.emoji}</Text>
                        <View style={styles.scheduleTextCol}>
                          <Text style={styles.scheduleTitle}>{slot.label}</Text>
                          <Text style={styles.scheduleTime}>{slot.time}</Text>
                        </View>
                        <View style={styles.scheduleDotOuterIdle} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(34,197,94,0.2)' }]}>
                <GlobeIcon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Días Preferidos</Text>
                <Text style={styles.cardSubtitle}>Selecciona tus días favoritos</Text>
              </View>
            </View>
            <View style={styles.daysGrid}>
              {[
                { id: 'mon', label: 'Lun' },
                { id: 'tue', label: 'Mar' },
                { id: 'wed', label: 'Mié' },
                { id: 'thu', label: 'Jue' },
                { id: 'fri', label: 'Vie' },
                { id: 'sat', label: 'Sáb' },
                { id: 'sun', label: 'Dom' },
              ].map((day) => {
                const active = prefs.preferredDays.includes(day.id as PlayerPreferences['preferredDays'][number]);
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => toggleDay(day.id as PlayerPreferences['preferredDays'][number])}
                    style={styles.dayBtnPressable}
                  >
                    {active ? (
                      <LinearGradient
                        colors={['#F18F34', '#E95F32']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.dayBtnActive}
                      >
                        <Text style={styles.dayTextActive}>{day.label}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={styles.dayBtnIdle}>
                        <Text style={styles.dayTextIdle}>{day.label}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(234,179,8,0.2)' }]}>
                <ZapIcon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Estilo de Juego</Text>
                <Text style={styles.cardSubtitle}>¿Cómo te gusta jugar?</Text>
              </View>
            </View>
            <View style={styles.playStyleGrid}>
              {[
                { id: 'competitive', label: 'Competitivo' },
                { id: 'social', label: 'Social' },
                { id: 'learning', label: 'Aprendizaje' },
                { id: 'balanced', label: 'Equilibrado' },
              ].map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => setPrefs((prev) => ({ ...prev, preferredPlayStyle: opt.id as PlayerPreferences['preferredPlayStyle'] }))}
                  style={styles.playStyleOptionPressable}
                >
                  {prefs.preferredPlayStyle === opt.id ? (
                    <LinearGradient
                      colors={['#F18F34', '#E95F32']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.playStyleOptionActive}
                    >
                      <Text style={styles.playStyleOptionTextActive}>{opt.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.playStyleOptionIdle}>
                      <Text style={styles.playStyleOptionTextIdle}>{opt.label}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(239,68,68,0.2)' }]}>
                <ClockIconRed />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Duración del Partido</Text>
                <Text style={styles.cardSubtitle}>Tiempo preferido de juego</Text>
              </View>
            </View>
            <View style={styles.durationGrid}>
              {[60, 90, 120].map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setPrefs((prev) => ({ ...prev, preferredMatchDurationMin: m as 60 | 90 | 120 }))}
                  style={styles.durationOptionPressable}
                >
                  {prefs.preferredMatchDurationMin === m ? (
                    <LinearGradient
                      colors={['#F18F34', '#E95F32']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.durationOptionActive}
                    >
                      <Text style={styles.durationOptionTextActive}>{m} min</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.durationOptionIdle}>
                      <Text style={styles.durationOptionTextIdle}>{m} min</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(99,102,241,0.2)' }]}>
                <UsersIcon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Nivel de Compañero</Text>
                <Text style={styles.cardSubtitle}>Nivel que buscas en rivales</Text>
              </View>
            </View>
            <View style={styles.partnerLevelGrid}>
              {[
                { id: 'similar', label: 'Similar' },
                { id: 'higher', label: 'Superior' },
                { id: 'lower', label: 'Inferior' },
                { id: 'any', label: 'Cualquiera' },
              ].map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => setPrefs((prev) => ({ ...prev, preferredPartnerLevel: opt.id as PlayerPreferences['preferredPartnerLevel'] }))}
                  style={styles.partnerLevelOptionPressable}
                >
                  {prefs.preferredPartnerLevel === opt.id ? (
                    <LinearGradient
                      colors={['#F18F34', '#E95F32']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.partnerLevelOptionActive}
                    >
                      <Text style={styles.partnerLevelOptionTextActive}>{opt.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.partnerLevelOptionIdle}>
                      <Text style={styles.partnerLevelOptionTextIdle}>{opt.label}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(236,72,153,0.2)' }]}>
                <Text style={styles.notificationHeaderEmoji}>🔔</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Notificaciones</Text>
                <Text style={styles.cardSubtitle}>Mantente informado</Text>
              </View>
            </View>
            <View style={styles.columnGap}>
              {[
                {
                  key: 'notifNewMatches',
                  label: 'Nuevos partidos',
                  subtitle: 'Notificaciones de nuevas oportunidades',
                },
                {
                  key: 'notifTournamentReminders',
                  label: 'Recordatorios de torneos',
                  subtitle: 'Avisos de competiciones',
                },
                {
                  key: 'notifClassUpdates',
                  label: 'Actualizaciones de clases',
                  subtitle: 'Novedades de tus cursos',
                },
                {
                  key: 'notifChatMessages',
                  label: 'Alertas de mensajes',
                  subtitle: 'Nuevos mensajes en chat',
                },
              ].map((row) => {
                const active = prefs[row.key as keyof PlayerPreferences] as boolean;
                return (
                  <Pressable
                    key={row.key}
                    onPress={() => setPrefs((prev) => ({ ...prev, [row.key]: !active }))}
                    style={styles.notificationRow}
                  >
                    <View style={styles.notificationTextWrap}>
                      <Text style={styles.notificationTitle}>{row.label}</Text>
                      <Text style={styles.notificationSubtitle}>{row.subtitle}</Text>
                    </View>
                    <View style={[styles.notificationSwitchTrack, active && styles.notificationSwitchTrackOn]}>
                      <View style={[styles.notificationSwitchThumb, active && styles.notificationSwitchThumbOn]} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.footerActions}>
            <Pressable
              onPress={() => setPrefs(base)}
              style={styles.restoreBtn}
              disabled={!dirty || saving}
            >
              <Text style={styles.restoreText}>Restaurar</Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              style={[styles.saveBtnPressable, (!dirty || saving) && styles.saveBtnDisabled]}
              disabled={!dirty || saving}
            >
              {!dirty || saving ? (
                <View style={styles.saveBtnDisabledInner}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Guardar Cambios</Text>}
                </View>
              ) : (
                <LinearGradient
                  colors={['#F18F34', '#E95F32']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.saveBtnGradient}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Guardar Cambios</Text>}
                </LinearGradient>
              )}
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 18 },
  subtitle: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, padding: 16 },
  card: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cardSubtitle: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sideGrid: { flexDirection: 'row', gap: 8 },
  sideOptionPressable: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sideOptionActive: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sideOptionActiveText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  sideOptionIdle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  sideOptionIdleText: { color: '#9CA3AF', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  optionBtn: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBtnActive: {
    backgroundColor: 'rgba(241,143,52,0.2)',
    borderColor: 'rgba(241,143,52,0.5)',
  },
  optionText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  optionTextActive: { color: '#fff' },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayBtnPressable: {
    width: '23%',
    minHeight: 36,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dayBtnIdle: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  dayBtnActive: {
    minHeight: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  dayTextIdle: { color: '#9CA3AF', fontSize: 12, fontWeight: '500' },
  dayTextActive: { color: '#fff', fontSize: 12, fontWeight: '500' },
  columnGap: { gap: 8 },
  listRow: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  listRowActive: {
    backgroundColor: 'rgba(241,143,52,0.2)',
    borderColor: 'rgba(241,143,52,0.45)',
  },
  listRowText: { color: '#D1D5DB', fontSize: 13, fontWeight: '600' },
  listRowTextActive: { color: '#fff' },
  clubRowPressable: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  clubRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  clubRowActive: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.4)',
  },
  clubBuildingWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubTextCol: { flex: 1 },
  clubName: { color: '#fff', fontSize: 14, fontWeight: '500' },
  clubSubtitle: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  clubHeartWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  switchTrackOn: { backgroundColor: ACCENT },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  switchThumbOn: { transform: [{ translateX: 20 }] },
  notificationHeaderEmoji: { fontSize: 18 },
  notificationRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  notificationTextWrap: { flex: 1 },
  notificationTitle: { color: '#fff', fontSize: 14, fontWeight: '500' },
  notificationSubtitle: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  notificationSwitchTrack: {
    position: 'relative',
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  notificationSwitchTrackOn: {
    backgroundColor: ACCENT,
  },
  notificationSwitchThumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  notificationSwitchThumbOn: {
    transform: [{ translateX: 20 }],
  },
  scheduleRowPressable: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  scheduleRowIdle: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  scheduleRowActive: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.4)',
  },
  scheduleEmoji: { fontSize: 20 },
  scheduleTextCol: { flex: 1 },
  scheduleTitle: { color: '#fff', fontSize: 14, fontWeight: '500' },
  scheduleTime: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  scheduleDotOuterIdle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4B5563',
  },
  scheduleDotOuterActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: ACCENT,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  playStyleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  playStyleOptionPressable: {
    width: '48.6%',
    minHeight: 46,
    borderRadius: 12,
    overflow: 'hidden',
  },
  playStyleOptionIdle: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  playStyleOptionActive: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#F18F34',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  playStyleOptionTextIdle: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  playStyleOptionTextActive: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  durationGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  durationOptionPressable: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderRadius: 12,
    overflow: 'hidden',
  },
  durationOptionIdle: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  durationOptionActive: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#F18F34',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  durationOptionTextIdle: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  durationOptionTextActive: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  partnerLevelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  partnerLevelOptionPressable: {
    width: '48.6%',
    minHeight: 46,
    borderRadius: 12,
    overflow: 'hidden',
  },
  partnerLevelOptionIdle: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  partnerLevelOptionActive: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#F18F34',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  partnerLevelOptionTextIdle: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  partnerLevelOptionTextActive: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  footerActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  restoreBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  restoreText: { color: '#9CA3AF', fontWeight: '600' },
  saveBtnPressable: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#F18F34',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  saveBtnGradient: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  saveBtnDisabled: {
    shadowOpacity: 0,
  },
  saveBtnDisabledInner: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  saveText: { color: '#fff', fontWeight: '700' },
});
