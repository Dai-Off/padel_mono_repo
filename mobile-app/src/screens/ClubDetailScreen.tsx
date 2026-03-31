import { useCallback, useEffect, useMemo, useState } from "react";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useStripe } from "@stripe/stripe-react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SearchCourtResult } from "../api/search";
import { fetchSearchCourts } from "../api/search";
import { fetchClubById } from "../api/clubs";
import { fetchCourtsByClubId, type Court } from "../api/courts";
import { fetchMatches } from "../api/matches";
import { mapMatchToPartido } from "../api/mapMatchToPartido";
import {
  createIntentForNewMatch,
  confirmPaymentFromClient,
} from "../api/payments";
import { fetchMyPlayerId } from "../api/players";
import { useAuth } from "../contexts/AuthContext";
import { PartidoCard } from "../components/partido/PartidoCard";
import type { BookingConfirmationData } from "./BookingConfirmationScreen";
import { PrivateReservationModal } from "../components/partido/PrivateReservationModal";
import type { PartidoItem } from "./PartidosScreen";
import { theme } from "../theme";

const DURATION_MIN = 60;

type ClubDetailScreenProps = {
  court: SearchCourtResult;
  onClose: () => void;
  onPartidoPress?: (partido: PartidoItem) => void;
};

const TABS = [
  "Home",
  "Reservar",
  "Partidos abiertos",
  "Competiciones",
] as const;
type TabId = (typeof TABS)[number];

const DAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const MONTHS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/** Fecha en YYYY-MM-DD según hora local (evita desfase por toISOString en UTC). */
function toDateStringLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCerramientoLabel(indoor: boolean): string {
  return indoor ? "Indoor" : "Exterior";
}

function getParedesLabel(glassType: string): string {
  return glassType === "panoramic" ? "Cristal" : "Muro";
}

/** Formatea weekly_schedule (jsonb) a texto legible. Si está vacío devuelve null. */
function formatWeeklySchedule(
  ws: Record<string, unknown> | null | undefined,
): string | null {
  if (!ws || typeof ws !== "object" || Object.keys(ws).length === 0)
    return null;
  const DAY_NAMES: Record<string, string> = {
    "0": "Dom",
    "1": "Lun",
    "2": "Mar",
    "3": "Mié",
    "4": "Jue",
    "5": "Vie",
    "6": "Sáb",
    mon: "Lun",
    tue: "Mar",
    wed: "Mié",
    thu: "Jue",
    fri: "Vie",
    sat: "Sáb",
    sun: "Dom",
  };
  const lines: string[] = [];
  const keys = Object.keys(ws).sort();
  for (const k of keys) {
    const v = ws[k];
    const dayLabel = DAY_NAMES[k] ?? k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const open = obj.open ?? obj.open_time ?? obj.start;
      const close = obj.close ?? obj.close_time ?? obj.end;
      if (open != null && close != null) {
        lines.push(`${dayLabel}: ${String(open)} - ${String(close)}`);
      }
    } else if (typeof v === "string" && v) {
      lines.push(`${dayLabel}: ${v}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

function getNextDays(count: number) {
  const out: { day: number; dayName: string; month: string; date: Date }[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      day: d.getDate(),
      dayName: DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1],
      month: MONTHS[d.getMonth()],
      date: d,
    });
  }
  return out;
}

function matchBelongsToClub(
  match: { bookings?: { courts?: { club_id?: string } | null } | null },
  clubId: string,
): boolean {
  const clubIdFromMatch = match.bookings?.courts?.club_id;
  return clubIdFromMatch != null && clubIdFromMatch === clubId;
}

function formatDateTimeForConfirmation(date: Date, time: string): string {
  const dayNames = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const d = new Date(date);
  d.setHours(
    parseInt(time.slice(0, 2), 10),
    parseInt(time.slice(3, 5) || "0", 10),
    0,
    0,
  );
  const dayName = dayNames[d.getDay()] ?? "Día";
  const dayNum = d.getDate();
  const month = months[d.getMonth()] ?? "";
  return `${dayName}, ${dayNum} ${month} · ${time}`;
}

export function ClubDetailScreen({
  court,
  onClose,
  onPartidoPress,
}: ClubDetailScreenProps) {
  const { session } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [activeTab, setActiveTab] = useState<TabId>("Home");
  const [clubPartidos, setClubPartidos] = useState<PartidoItem[]>([]);
  const [organizerPlayerId, setOrganizerPlayerId] = useState<string | null>(
    null,
  );
  const [confirmationModalData, setConfirmationModalData] =
    useState<BookingConfirmationData | null>(null);
  const [partidosLoading, setPartidosLoading] = useState(false);
  const [clubCourts, setClubCourts] = useState<Court[]>([]);
  const [scheduleText, setScheduleText] = useState<string | null>(null);
  const [clubCourtsLoading, setClubCourtsLoading] = useState(true);

  const loadClubData = useCallback(async () => {
    setClubCourtsLoading(true);
    const [club, courts] = await Promise.all([
      fetchClubById(court.clubId),
      fetchCourtsByClubId(court.clubId),
    ]);
    setClubCourts(courts);
    setScheduleText(
      club?.weekly_schedule
        ? formatWeeklySchedule(club.weekly_schedule as Record<string, unknown>)
        : null,
    );
    setClubCourtsLoading(false);
  }, [court.clubId]);

  useEffect(() => {
    loadClubData();
  }, [loadClubData]);

  const loadClubPartidos = useCallback(async () => {
    setPartidosLoading(true);
    const matches = await fetchMatches({ expand: true });
    const filtered = matches
      .filter((m) => matchBelongsToClub(m, court.clubId))
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.matchPhase !== "past")
      .filter((p) => p.visibility !== "private");
    setClubPartidos(filtered);
    setPartidosLoading(false);
  }, [court.clubId]);

  useEffect(() => {
    if (activeTab === "Partidos abiertos") {
      loadClubPartidos();
    }
  }, [activeTab, loadClubPartidos]);
  const [selectedDateIndex, setSelectedDateIndex] = useState(1);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [partidosAlertsEnabled, setPartidosAlertsEnabled] = useState(false);
  const [timeSlotsForDate, setTimeSlotsForDate] = useState<string[]>([]);
  const [slotsByCourt, setSlotsByCourt] = useState<Record<string, string[]>>(
    {},
  );
  const [timeSlotsLoading, setTimeSlotsLoading] = useState(false);
  const [courtPrices, setCourtPrices] = useState<
    Record<string, { minPriceCents: number; minPriceFormatted: string }>
  >({});
  const [expandedCourtId, setExpandedCourtId] = useState<string | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [reserving, setReserving] = useState(false);
  const dateOptions = getNextDays(7);

  const selectedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + selectedDateIndex);
    return d;
  }, [selectedDateIndex]);

  const loadTimeSlotsForDate = useCallback(
    async (date: Date) => {
      setTimeSlotsLoading(true);
      try {
        const dateStr = toDateStringLocal(date);
        const slotsPerCourt: Record<string, string[]> = {};
        const results = await fetchSearchCourts({
          dateFrom: dateStr,
          dateTo: dateStr,
        });
        const clubResults = results.filter((r) => r.clubId === court.clubId);
        const allSlots: string[] = [];
        const prices: Record<
          string,
          { minPriceCents: number; minPriceFormatted: string }
        > = {};
        for (const r of clubResults) {
          const courtSlots = r.timeSlots ?? [];
          allSlots.push(...courtSlots);
          slotsPerCourt[r.id] = courtSlots;
          if (r.minPriceCents > 0) {
            prices[r.id] = {
              minPriceCents: r.minPriceCents,
              minPriceFormatted:
                r.minPriceFormatted ?? `${Math.round(r.minPriceCents / 100)}€`,
            };
          }
        }
        setTimeSlotsForDate([...new Set(allSlots)].sort());
        setCourtPrices(prices);
        setSlotsByCourt(slotsPerCourt);
      } catch {
        setTimeSlotsForDate([]);
        setCourtPrices({});
        setSlotsByCourt({});
      } finally {
        setTimeSlotsLoading(false);
      }
    },
    [court.clubId],
  );

  useEffect(() => {
    if (activeTab === "Reservar") {
      // Al cambiar de día, limpiamos horario seleccionado y pista expandida
      setSelectedTimeSlot(null);
      setExpandedCourtId(null);
      loadTimeSlotsForDate(selectedDate);
    }
  }, [activeTab, selectedDate, loadTimeSlotsForDate]);

  useEffect(() => {
    if (session?.access_token) {
      fetchMyPlayerId(session.access_token).then(setOrganizerPlayerId);
    } else {
      setOrganizerPlayerId(null);
    }
  }, [session?.access_token]);

  const handleReservar = useCallback(
    async (
      c: Court,
      priceInfo:
        | { minPriceCents: number; minPriceFormatted: string }
        | undefined,
    ) => {
      if (!selectedTimeSlot) {
        Alert.alert(
          "Elige un horario",
          "Selecciona primero una hora en la lista de arriba.",
        );
        return;
      }
      if (!organizerPlayerId || !session?.access_token) {
        Alert.alert("Inicia sesión", "Debes iniciar sesión para reservar.");
        return;
      }
      if (!priceInfo || priceInfo.minPriceCents <= 0) {
        Alert.alert(
          "No disponible",
          "No hay precio disponible para esta pista en la fecha seleccionada.",
        );
        return;
      }

      setReserving(true);
      const dateStr = toDateStringLocal(selectedDate);
      // Parse as local time (no Z suffix) so JS converts correctly to UTC when sending to backend
      const startDate = new Date(`${dateStr}T${selectedTimeSlot}:00`);
      const start_at = startDate.toISOString();
      const endDate = new Date(startDate.getTime() + DURATION_MIN * 60 * 1000);
      const end_at = endDate.toISOString();
      const totalPriceCents = Math.max(priceInfo.minPriceCents, 100);

      const intentRes = await createIntentForNewMatch(
        {
          court_id: c.id,
          organizer_player_id: organizerPlayerId,
          start_at,
          end_at,
          total_price_cents: totalPriceCents,
          pay_full: true,
          visibility: "private",
          competitive: false,
          gender: "any",
        },
        session.access_token,
      );

      if (!intentRes.ok || !intentRes.clientSecret) {
        setReserving(false);
        const errMsg =
          intentRes.error ?? "No se pudo iniciar el pago. Inténtalo de nuevo.";
        if (errMsg.includes("esa hora") || errMsg.includes("otro horario")) {
          Alert.alert(
            "Horario no disponible",
            "Ya tienes un partido a esa hora. Elige otro horario.",
          );
        } else {
          Alert.alert("Error", errMsg);
        }
        return;
      }

      const returnURL = Linking.createURL("stripe-redirect");
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: intentRes.clientSecret,
        merchantDisplayName: "WeMatch Padel",
        returnURL,
      });

      if (initErr) {
        setReserving(false);
        Alert.alert(
          "Error",
          "Error al configurar el pago. Inténtalo de nuevo.",
        );
        return;
      }

      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        setReserving(false);
        if (presentErr.code === "Canceled") {
          // Usuario canceló, no mostrar error
        } else {
          Alert.alert(
            "Error",
            "Error al procesar el pago. Inténtalo de nuevo.",
          );
        }
        return;
      }

      const confirmRes = await confirmPaymentFromClient(
        intentRes.paymentIntentId!,
        session.access_token,
      );
      setReserving(false);

      if (!confirmRes.ok) {
        Alert.alert(
          "Error",
          "No se pudo confirmar la reserva. Inténtalo de nuevo.",
        );
        return;
      }

      // Refrescar disponibilidad para que la pista desaparezca automáticamente
      await loadTimeSlotsForDate(selectedDate);
      setExpandedCourtId(null);

      setConfirmationModalData({
        courtName: c.name,
        clubName: court.clubName,
        dateTimeFormatted: formatDateTimeForConfirmation(
          selectedDate,
          selectedTimeSlot,
        ),
        duration: `${DURATION_MIN} min`,
        priceFormatted: priceInfo.minPriceFormatted,
        matchVisibility: "private",
      });
    },
    [
      selectedTimeSlot,
      selectedDate,
      organizerPlayerId,
      session?.access_token,
      court.clubName,
      initPaymentSheet,
      presentPaymentSheet,
      loadTimeSlotsForDate,
    ],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="notifications-outline" size={20} color="#fff" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="heart-outline" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={({ pressed }) => [
              styles.tab,
              tab === "Partidos abiertos" && styles.tabPartidosAbiertos,
              activeTab === tab ? styles.tabActive : styles.tabInactive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab
                  ? styles.tabTextActive
                  : styles.tabTextInactive,
              ]}
              numberOfLines={tab === "Partidos abiertos" ? 1 : 2}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: theme.scrollBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <LinearGradient
            colors={["#1a1a1a", "#2a2a2a"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroOrb} />
            <View style={styles.heroContent}>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Abierto ahora</Text>
              </View>
              <Text style={styles.heroTitle}>{court.clubName}</Text>
              <View style={styles.heroLocation}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color="rgba(255,255,255,0.5)"
                />
                <Text style={styles.heroAddress} numberOfLines={1}>
                  {court.address || court.city}
                </Text>
              </View>
              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Ionicons name="star" size={12} color="#fbbf24" />
                  <Text style={styles.heroStatText}>4.8</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatText}>
                    {clubCourtsLoading
                      ? "..."
                      : clubCourts.length === 0
                        ? "Sin pistas"
                        : clubCourts.length === 1
                          ? "1 Pista"
                          : `${clubCourts.length} Pistas`}
                  </Text>
                </View>
                {court.distanceKm != null && (
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatText}>
                      {Math.round(court.distanceKm)}km
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </LinearGradient>
        </View>

        {activeTab === "Reservar" ? (
          <>
            <View style={styles.section}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.datePickerRow}
              >
                <Pressable style={styles.dateSearchBtn}>
                  <Ionicons name="search-outline" size={16} color="#6b7280" />
                </Pressable>
                {dateOptions.map((opt, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setSelectedDateIndex(i)}
                    style={({ pressed }) => [
                      styles.dateBtn,
                      selectedDateIndex === i
                        ? styles.dateBtnActive
                        : styles.dateBtnInactive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateDayName,
                        selectedDateIndex === i && styles.dateTextActive,
                      ]}
                    >
                      {opt.dayName}
                    </Text>
                    <Text
                      style={[
                        styles.dateDayNum,
                        selectedDateIndex === i && styles.dateTextActive,
                      ]}
                    >
                      {opt.day}
                    </Text>
                    <Text
                      style={[
                        styles.dateMonth,
                        selectedDateIndex === i && styles.dateTextActive,
                      ]}
                    >
                      {opt.month}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <View style={styles.section}>
              {timeSlotsLoading ? (
                <ActivityIndicator
                  size="small"
                  color={theme.auth.accent}
                  style={{ paddingVertical: 16 }}
                />
              ) : timeSlotsForDate.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.timeSlotsCarousel}
                >
                  {timeSlotsForDate.map((slot) => {
                    const isSelected = selectedTimeSlot === slot;
                    return (
                      <Pressable
                        key={slot}
                        onPress={() => setSelectedTimeSlot(slot)}
                        style={({ pressed }) => [
                          styles.timeSlotBtn,
                          isSelected && styles.timeSlotBtnSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.timeSlotText,
                            isSelected && styles.timeSlotTextSelected,
                          ]}
                        >
                          {slot}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={styles.partidosEmptySubtitle}>
                  Sin horarios disponibles
                </Text>
              )}
            </View>
            <View style={styles.section}>
              <View style={styles.alertHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.alertTitleRow}>
                    <Ionicons
                      name="notifications-outline"
                      size={16}
                      color="#f97316"
                    />
                    <Text style={styles.alertSectionTitle}>
                      Alertas prioritarias
                    </Text>
                  </View>
                  <Text style={styles.alertSub}>
                    Configura tu alerta con un click
                  </Text>
                </View>
                <Switch
                  value={alertsEnabled}
                  onValueChange={setAlertsEnabled}
                  trackColor={{ false: "#e5e7eb", true: theme.auth.accent }}
                  thumbColor="#fff"
                />
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.reservaTitle}>Reserva una pista</Text>
              <Text style={styles.reservaSub}>
                Crea un partido privado e invita a tus amigos
              </Text>
              <View style={styles.courtList}>
                {!selectedTimeSlot ? (
                  <Text style={styles.partidosEmptySubtitle}>
                    Selecciona primero un horario para ver qué pistas están
                    libres.
                  </Text>
                ) : clubCourtsLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.auth.accent}
                    style={{ paddingVertical: 16 }}
                  />
                ) : clubCourts.length > 0 ? (
                  (() => {
                    const courtsToShow = selectedTimeSlot
                      ? clubCourts.filter((c) =>
                          (slotsByCourt[c.id] ?? []).includes(selectedTimeSlot),
                        )
                      : clubCourts;

                    if (courtsToShow.length === 0 && selectedTimeSlot) {
                      return (
                        <Text style={styles.partidosEmptySubtitle}>
                          No hay pistas disponibles para este horario.
                        </Text>
                      );
                    }

                    return courtsToShow.map((c) => {
                      const isExpanded = expandedCourtId === c.id;
                      const priceInfo = courtPrices[c.id];
                      return (
                        <View key={c.id} style={styles.courtCard}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.courtCardHeader,
                              pressed && styles.pressed,
                            ]}
                            onPress={() =>
                              setExpandedCourtId(isExpanded ? null : c.id)
                            }
                          >
                            <View style={styles.courtRowLeft}>
                              <Text style={styles.courtCardName}>{c.name}</Text>
                              <Text style={styles.courtCardSub}>
                                {getCerramientoLabel(c.indoor)} |{" "}
                                {getParedesLabel(c.glass_type)} | Dobles
                              </Text>
                            </View>
                            <Ionicons
                              name={isExpanded ? "chevron-up" : "chevron-down"}
                              size={20}
                              color="#9ca3af"
                            />
                          </Pressable>
                          {isExpanded && (
                            <View style={styles.courtCardActions}>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.courtPriceBtn,
                                  pressed && styles.pressed,
                                ]}
                              >
                                <Text style={styles.courtPriceAmount}>
                                  {priceInfo?.minPriceFormatted ?? "-"}
                                </Text>
                                <Text style={styles.courtPriceDuration}>
                                  60 min
                                </Text>
                              </Pressable>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.courtReservarBtn,
                                  (!selectedTimeSlot || reserving) &&
                                    styles.courtReservarBtnDisabled,
                                  pressed &&
                                    !reserving &&
                                    selectedTimeSlot &&
                                    styles.pressed,
                                ]}
                                onPress={() =>
                                  selectedTimeSlot
                                    ? handleReservar(c, priceInfo ?? undefined)
                                    : undefined
                                }
                                disabled={reserving || !selectedTimeSlot}
                              >
                                {reserving ? (
                                  <ActivityIndicator
                                    size="small"
                                    color="#1A1A1A"
                                  />
                                ) : !selectedTimeSlot ? (
                                  <Text
                                    style={styles.courtReservarTextDisabled}
                                  >
                                    Elige hora
                                  </Text>
                                ) : (
                                  <Text style={styles.courtReservarText}>
                                    Reservar
                                  </Text>
                                )}
                              </Pressable>
                            </View>
                          )}
                        </View>
                      );
                    });
                  })()
                ) : (
                  <Text style={styles.partidosEmptySubtitle}>
                    Sin pistas en este club
                  </Text>
                )}
              </View>
            </View>
          </>
        ) : activeTab === "Partidos abiertos" ? (
          <>
            <View style={styles.section}>
              <Text style={styles.partidosSectionTitle}>
                Partidos abiertos en {court.clubName}
              </Text>
              <Text style={styles.partidosSectionSub}>
                Únete a un partido en este club
              </Text>
            </View>
            {partidosLoading ? (
              <View style={[styles.section, styles.partidosEmptySection]}>
                <ActivityIndicator size="large" color={theme.auth.accent} />
                <Text style={[styles.partidosEmptySubtitle, { marginTop: 12 }]}>
                  Cargando partidos...
                </Text>
              </View>
            ) : clubPartidos.length > 0 ? (
              <View style={[styles.section, styles.partidosListWrap]}>
                {clubPartidos.map((item) => (
                  <PartidoCard
                    key={item.id}
                    item={item}
                    onPress={() => onPartidoPress?.(item)}
                    surface="dark"
                  />
                ))}
              </View>
            ) : (
              <View
                style={[
                  styles.section,
                  styles.partidosEmptySection,
                  styles.partidosOpenEmptySection,
                ]}
              >
                <View style={styles.partidosEmptyState}>
                  <View style={styles.partidosEmptyIcon}>
                    <Text style={styles.partidosEmptyEmoji}>🎾</Text>
                  </View>
                  <Text style={styles.partidosEmptyTitle}>
                    No hay pistas disponibles hoy
                  </Text>
                  <Text style={styles.partidosEmptySubtitle}>
                    Prueba otro día o busca en otro club
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.section}>
              <View style={styles.partidosAlertHeader}>
                <Ionicons
                  name="notifications-outline"
                  size={16}
                  color="#f97316"
                />
                <Text style={styles.partidosAlertTitle}>
                  Alertas prioritarias
                </Text>
              </View>
              <Text style={styles.partidosAlertDesc}>
                Configura tu alerta con tus preferencias predefinidas
              </Text>
              <View style={styles.partidosAlertRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.manageAlertsBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.manageAlertsText}>Gestionar alertas</Text>
                </Pressable>
                <Switch
                  value={partidosAlertsEnabled}
                  onValueChange={setPartidosAlertsEnabled}
                  trackColor={{ false: "#e5e7eb", true: theme.auth.accent }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </>
        ) : activeTab === "Competiciones" ? (
          <>
            <View style={styles.partidosFiltersWrap}>
              <View style={styles.partidosFilters}>
                <Pressable
                  style={({ pressed }) => [
                    styles.partidosFilterBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.partidosFilterText}>
                    Todos los deportes
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#fff" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.partidosFilterBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.partidosFilterText}>Cualquier día</Text>
                  <Ionicons name="chevron-down" size={14} color="#fff" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.partidosFilterBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.partidosFilterText}>Mixto</Text>
                  <Ionicons name="chevron-down" size={14} color="#fff" />
                </Pressable>
              </View>
            </View>
            <View style={styles.partidosEmptySection}>
              <View style={styles.partidosEmptyState}>
                <View style={styles.partidosEmptyIcon}>
                  <Text style={styles.partidosEmptyEmoji}>🏆</Text>
                </View>
                <Text style={styles.partidosEmptyTitle}>
                  No hay competiciones
                </Text>
                <Text style={styles.partidosEmptySubtitle}>
                  Próximamente podrás ver competiciones de este club
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Información del club</Text>
              <View style={styles.tagsRow}>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>🎾 Pádel</Text>
                </View>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>🎾 Tenis</Text>
                </View>
              </View>
              <Text style={styles.pistasLabel}>
                {clubCourts.length === 0
                  ? "Pista disponible"
                  : clubCourts.length === 1
                    ? "1 pista"
                    : `${clubCourts.length} pistas`}
              </Text>
              <View style={styles.amenitiesRow}>
                <View style={styles.amenity}>
                  <Ionicons
                    name="accessibility-outline"
                    size={14}
                    color="#6b7280"
                  />
                  <Text style={styles.amenityText}>Accesible</Text>
                </View>
                <View style={styles.amenity}>
                  <Ionicons
                    name="construct-outline"
                    size={14}
                    color="#6b7280"
                  />
                  <Text style={styles.amenityText}>Alquiler de material</Text>
                </View>
                <View style={styles.amenity}>
                  <Ionicons name="car-outline" size={14} color="#6b7280" />
                  <Text style={styles.amenityText}>Parking</Text>
                </View>
              </View>
              <View style={styles.tagsRow}>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>
                    {getCerramientoLabel(court.indoor)}
                  </Text>
                </View>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>
                    {getParedesLabel(court.glassType)}
                  </Text>
                </View>
              </View>
              <View style={styles.actionsRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="navigate" size={20} color="#fff" />
                  <Text style={styles.actionLabel}>CÓMO LLEGAR</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionButtonOutline,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="globe-outline" size={20} color="#6b7280" />
                  <Text style={styles.actionLabelOutline}>WEB</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionButtonOutline,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="call-outline" size={20} color="#6b7280" />
                  <Text style={styles.actionLabelOutline}>LLAMAR</Text>
                </Pressable>
              </View>
              <View style={styles.mapPlaceholder}>
                <Text style={styles.mapPlaceholderText}>Mapa de ubicación</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Horarios</Text>
              <View style={[styles.scheduleRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.scheduleDay}>Horarios</Text>
                <Text style={styles.scheduleHours} numberOfLines={3}>
                  {scheduleText ?? "Consulta en el club"}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Promociones</Text>
              <View style={styles.partidosEmptyState}>
                <Text style={styles.partidosEmptySubtitle}>
                  No hay promociones disponibles
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Jugadores</Text>
              <View style={styles.partidosEmptyState}>
                <Text style={styles.partidosEmptySubtitle}>
                  No hay datos de jugadores
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resultados recientes</Text>
              <View style={styles.partidosEmptyState}>
                <Text style={styles.partidosEmptySubtitle}>
                  No hay resultados recientes
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                ¿Tienes cuenta en este Club?
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.accountCard,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.accountText}>
                  Asocia tu cuenta y recibe los mismos beneficios que te ofrece
                  el club.
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {confirmationModalData != null ? (
        <PrivateReservationModal
          visible
          data={confirmationModalData}
          onClose={() => setConfirmationModalData(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F0F",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    ...theme.headerPadding,
    backgroundColor: "#0F0F0F",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRight: {
    flexDirection: "row",
    gap: theme.spacing.xs,
  },
  pressed: { opacity: 0.8 },
  tabsScroll: {
    flexGrow: 0,
    backgroundColor: "transparent",
  },
  tabsContent: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    paddingRight: theme.spacing.lg + 8,
    paddingBottom: theme.spacing.sm,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Ancho extra para que “Partidos abiertos” quepa en una línea sin solaparse. */
  tabPartidosAbiertos: {
    minWidth: 220,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  tabActive: {
    backgroundColor: theme.auth.accent,
  },
  tabInactive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  tabText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
  },
  tabTextActive: {    flexShrink: 1,
    maxWidth: "100%",

    color: "#fff",
  },
  tabTextInactive: {    flexShrink: 1,
    maxWidth: "100%",

    color: "rgba(255,255,255,0.6)",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 40,
    flexGrow: 1,
  },
  hero: {
    marginBottom: theme.spacing.lg,
    borderRadius: 16,
    overflow: "hidden",
  },
  heroGradient: {
    padding: theme.spacing.lg,
    position: "relative",
  },
  heroOrb: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(241, 143, 52, 0.15)",
  },
  heroContent: {
    position: "relative",
    zIndex: 10,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  statusText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1,
    lineHeight: 14,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  heroTitle: {    maxWidth: "100%",

    fontSize: theme.fontSize.lg,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
    lineHeight: theme.lineHeightFor(theme.fontSize.lg),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  heroLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroAddress: {    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.5)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  heroStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  heroStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    flexShrink: 1,
  },
  heroStatText: {    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  section: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sectionTitle: {    maxWidth: "100%",

    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: theme.spacing.md,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
  },
  tagText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "500",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  pistasLabel: {    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    marginBottom: theme.spacing.lg,
    width: "100%",
    flexShrink: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 4,
    backgroundColor: theme.auth.accent,
    borderRadius: 16,
  },
  actionLabel: {
    textAlign: "center",

    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
    lineHeight: 14,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  actionButtonOutline: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
  },
  actionLabelOutline: {
    textAlign: "center",

    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 14,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  mapPlaceholder: {
    height: 144,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.md,
  },
  mapPlaceholderText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    alignSelf: "stretch",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  scheduleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  scheduleDay: {    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    flexShrink: 0,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  scheduleHours: {    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    flex: 1,
    textAlign: "right",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  amenitiesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  amenity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
  },
  amenityText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  promoCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
  },
  promoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
  },
  promoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(241, 143, 52, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  promoEmoji: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 18,
  },
  promoTextWrap: {
    flex: 1,
  },
  promoTitle: {    maxWidth: "100%",

    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  promoSub: {    maxWidth: "100%",

    fontSize: 10,
    color: "#9ca3af",
    marginTop: 2,
    lineHeight: 14,
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  promoCta: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    color: theme.auth.accent,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  topPlayersScroll: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.lg,
  },
  topPlayerItem: {
    alignItems: "center",
    flexShrink: 0,
  },
  topPlayerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  topPlayerImg: {
    width: "100%",
    height: "100%",
  },
  topPlayerInitial: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    color: "#fff",
  },
  topPlayerBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: theme.auth.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  topPlayerRank: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
  },
  topPlayerName: {    flexShrink: 1,

    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "500",
    marginTop: 6,
    maxWidth: 48,
    textAlign: "center",
    lineHeight: 14,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  resultCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  resultDate: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    textAlign: "right",
    marginBottom: theme.spacing.sm,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  resultTeams: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  resultTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  resultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  resultName: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 9,
    fontWeight: "500",
    color: "#ffffff",
  },
  resultLevel: {
    backgroundColor: "#fde047",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resultLevelText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 8,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  resultScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  resultScoreWin: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
  },
  resultScoreLose: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 24,
    fontWeight: "800",
    color: "rgba(255,255,255,0.35)",
  },
  resultScoreDash: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 18,
    color: "#d1d5db",
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
  },
  accountText: {    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  datePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.lg,
  },
  dateSearchBtn: {
    width: 48,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  dateBtn: {
    width: 48,
    minHeight: 56,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dateBtnActive: {
    backgroundColor: theme.auth.accent,
  },
  dateBtnInactive: {
    backgroundColor: "transparent",
  },
  dateDayName: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 14,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  dateDayNum: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 18,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 22,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  dateMonth: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 14,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  dateTextActive: {    flexShrink: 1,
    maxWidth: "100%",

    color: "#fff",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  timeSlotsCarousel: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.lg,
  },
  timeSlotBtn: {
    width: 72,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  timeSlotBtnSelected: {
    backgroundColor: theme.auth.accent,
    borderColor: theme.auth.accent,
  },
  timeSlotTextSelected: {    flexShrink: 1,
    maxWidth: "100%",

    color: "#fff",
  },
  timeSlotText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    alignSelf: "stretch",
    textAlign: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  alertTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  alertSectionTitle: {    maxWidth: "100%",

    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  alertSub: {
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    width: "100%",
    maxWidth: "100%",
    minHeight: theme.lineHeightFor(theme.fontSize.xs) * 2,
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  reservaTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    width: "100%",
    maxWidth: "100%",
    minHeight: theme.lineHeightFor(theme.fontSize.sm),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  reservaSub: {
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    marginBottom: theme.spacing.md,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    width: "100%",
    maxWidth: "100%",
    minHeight: theme.lineHeightFor(theme.fontSize.xs) * 2,
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtList: {
    gap: theme.spacing.md,
  },
  courtCard: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    // overflow:hidden es necesario para el borderRadius visual
    // pero aseguramos que el texto tenga espacio adecuado con courtRowLeft flex:1
  },
  courtCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
  },
  courtCardName: {    maxWidth: "100%",

    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtCardSub: {    maxWidth: "100%",

    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
    lineHeight: 16,
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtCardActions: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  courtPriceBtn: {
    flex: 1,
    backgroundColor: theme.auth.accent,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.sm,
    alignItems: "center",
  },
  courtPriceAmount: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 18,
    alignSelf: "stretch",
    textAlign: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtPriceDuration: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    color: "rgba(255,255,255,0.9)",
    marginTop: 1,
    lineHeight: 14,
    alignSelf: "stretch",
    textAlign: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtReservarBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  courtReservarText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    alignSelf: "stretch",
    textAlign: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtReservarTextDisabled: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    alignSelf: "stretch",
    textAlign: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtReservarBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.03)",
    opacity: 0.85,
  },
  courtRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  courtRowLeft: {
    flex: 1,
    minWidth: 0,
  },
  courtName: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: "#ffffff",
  },
  courtSub: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  partidosSectionTitle: {    maxWidth: "100%",

    fontSize: theme.fontSize.lg,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    lineHeight: theme.lineHeightFor(theme.fontSize.lg),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosSectionSub: {
    fontSize: theme.fontSize.xs,
    color: "#9ca3af",
    marginBottom: theme.spacing.md,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    width: "100%",
    maxWidth: "100%",
    minHeight: theme.lineHeightFor(theme.fontSize.xs) * 2,
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosListWrap: {
    gap: 12,
    marginBottom: theme.spacing.lg,
  },
  partidosFiltersWrap: {
    marginBottom: theme.spacing.md,
  },
  partidosFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  partidosFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
  },
  partidosFilterText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosEmptySection: {
    padding: 40,
  },
  partidosOpenEmptySection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  partidosEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    paddingHorizontal: theme.spacing.sm,
  },
  partidosEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  partidosEmptyEmoji: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 30,
  },
  partidosEmptyTitle: {    maxWidth: "100%",

    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    textAlign: "center",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosEmptySubtitle: {
    fontSize: theme.fontSize.xs,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    width: "100%",
    maxWidth: "100%",
    minHeight: theme.lineHeightFor(theme.fontSize.xs) * 2,
    flexShrink: 1,
    paddingHorizontal: theme.spacing.xs,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  partidosAlertTitle: {    maxWidth: "100%",

    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosAlertDesc: {
    fontSize: theme.fontSize.xs,
    color: "#9ca3af",
    marginBottom: theme.spacing.sm,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    width: "100%",
    maxWidth: "100%",
    minHeight: theme.lineHeightFor(theme.fontSize.xs) * 2,
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosAlertRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  manageAlertsBtn: {
    paddingVertical: 4,
  },
  manageAlertsText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    color: theme.auth.accent,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosReservaTitle: {    maxWidth: "100%",

    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosReservaSub: {
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 8,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    width: "100%",
    maxWidth: "100%",
    minHeight: theme.lineHeightFor(theme.fontSize.xs) * 2,
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosReservaHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  partidosReservaHintText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosClockEmoji: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 16,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xl,
    alignSelf: "stretch",
    paddingHorizontal: theme.spacing.sm,
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  emptyStateEmoji: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 28,
  },
  emptyStateTitle: {    maxWidth: "100%",

    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  emptyStateSub: {
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    width: "100%",
    maxWidth: "100%",
    minHeight: theme.lineHeightFor(theme.fontSize.xs) * 2,
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  compCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    marginBottom: theme.spacing.md,
  },
  compCardBar: {
    height: 4,
    backgroundColor: theme.auth.accent,
  },
  compCardContent: {
    padding: theme.spacing.lg,
  },
  compCardDate: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    marginBottom: theme.spacing.sm,
  },
  compCardMain: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  compCardIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(241, 143, 52, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  compCardBody: {
    flex: 1,
  },
  compCardDateTime: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 4,
  },
  compCardTitle: {    maxWidth: "100%",

    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    flexShrink: 1,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  compCardTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  compTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
  },
  compTagText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
  },
  compCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: theme.spacing.sm,
  },
  compCardMetaText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
  },
  compCardTeams: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compTeamDots: {
    flexDirection: "row",
    alignItems: "center",
  },
  compTeamDot: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
  },
  compCardTeamsText: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    color: "#9ca3af",
    fontWeight: "500",
  },
  compCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: "#f9fafb",
  },
  compCardVenue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compVenueName: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  compVenueSub: {    flexShrink: 1,
    maxWidth: "100%",

    fontSize: 10,
    color: "#9ca3af",
  },
});
