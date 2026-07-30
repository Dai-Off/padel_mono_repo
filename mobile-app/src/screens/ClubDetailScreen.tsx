import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  InteractionManager,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useStripe } from "../stripe";
import { Ionicons } from "@expo/vector-icons";
import type { SearchCourtResult } from "../api/search";
import { fetchSearchCourts } from "../api/search";
import { fetchAvailableSlots } from "../api/availability";
import { createCourtReservationPayLater } from "../api/bookings";
import { fetchClubById, fetchClubPublicInfo } from "../api/clubs";
import { fetchPublicClubReviews } from "../api/clubReviews";
import { fetchCourtsByClubId, type Court } from "../api/courts";
import { fetchMatches, type MatchEnriched } from "../api/matches";
import { mapMatchToPartido } from "../api/mapMatchToPartido";
import { resolveSlotStartEndUtc } from "../lib/bookingSlotTime";
import {
  addDaysToClubKey,
  clubIanaTimeZone,
  clubLocalDateTimeToUtcIso,
  dayKeyInClubTz,
  setClubTimeZone,
} from "../lib/clubTimeZone";
import {
  createIntentForCourtReservation,
  confirmPaymentFromClient,
} from "../api/payments";
import { fetchMyPlayerId } from "../api/players";
import { useAuth } from "../contexts/AuthContext";
import { useMyProfile } from "../queries/profile";
import { useHomeActions } from "../queries/home";
import { PartidoCard } from "../components/partido/PartidoCard";
import type { BookingConfirmationData } from "./BookingConfirmationScreen";
import { PrivateReservationModal } from "../components/partido/PrivateReservationModal";
import type { PartidoItem } from "./PartidosScreen";
import { formatLocale, useTranslation, type AppLocale } from "../i18n";
import { es } from "../i18n/es";
import { zhHK } from "../i18n/zh-HK";
import { theme } from "../theme";
import { filterSlotsStartingAfterNow } from "../domain/localSlotAvailability";
import { getMatchBooking } from "../domain/matchLifecycle";
import { useSlotPrice } from "../hooks/useSlotPrice";
import {
  COURT_RESERVATION_DURATION_OPTIONS,
  defaultCourtReservationDuration,
  courtReservationSlotStepMinutes,
  type CourtReservationDuration,
} from "../lib/courtReservationDuration";
import { isFeatureHidden } from "../config";

type ClubDetailScreenProps = {
  court: SearchCourtResult;
  onClose: () => void;
  onPartidoPress?: (partido: PartidoItem) => void;
};

const TAB_IDS = ["home", "book", "openMatches", "competitions"] as const;
type TabId = (typeof TAB_IDS)[number];

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function getLocaleBundle(locale: AppLocale) {
  return locale === "zh-HK" ? zhHK : es;
}

function bookTabLabel(t: TranslateFn): string {
  return t("common.bookAtTime", { time: "" })
    .replace(/\s*(a las|\{time\})\s*$/i, "")
    .trim();
}

function getTabLabel(tab: TabId, t: TranslateFn): string {
  switch (tab) {
    case "home":
      return "Home";
    case "book":
      return bookTabLabel(t);
    case "openMatches":
      return t("partidos.detailOpenMatch");
    case "competitions":
      return t("common.comingSoon");
  }
}

function getCerramientoLabel(indoor: boolean, t: TranslateFn): string {
  return indoor ? t("common.indoor") : t("common.outdoor");
}

function getParedesLabel(glassType: string, t: TranslateFn): string {
  return glassType === "panoramic"
    ? t("common.wallCristal")
    : t("common.wallMuro");
}

/** Formatea weekly_schedule (jsonb) a texto legible. Si está vacío devuelve null. */
function formatWeeklySchedule(
  ws: Record<string, unknown> | null | undefined,
  t: TranslateFn,
): string | null {
  if (!ws || typeof ws !== "object" || Object.keys(ws).length === 0)
    return null;
  const DAY_NAMES: Record<string, string> = {
    "0": t("common.weekdaySun"),
    "1": t("common.weekdayMon"),
    "2": t("common.weekdayTue"),
    "3": t("common.weekdayWed"),
    "4": t("common.weekdayThu"),
    "5": t("common.weekdayFri"),
    "6": t("common.weekdaySat"),
    mon: t("common.weekdayMon"),
    tue: t("common.weekdayTue"),
    wed: t("common.weekdayWed"),
    thu: t("common.weekdayThu"),
    fri: t("common.weekdayFri"),
    sat: t("common.weekdaySat"),
    sun: t("common.weekdaySun"),
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

function getNextClubDays(
  count: number,
  days: readonly string[],
  months: readonly string[],
  timeZone: string,
) {
  const out: { day: number; dayName: string; month: string; dateStr: string }[] = [];
  const todayKey = dayKeyInClubTz(new Date());
  const weekdayToIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  for (let i = 0; i < count; i++) {
    const dateStr = addDaysToClubKey(todayKey, i);
    const ref = new Date(clubLocalDateTimeToUtcIso(dateStr, "12:00", timeZone));
    const weekdayShort = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(ref);
    const dow = weekdayToIndex[weekdayShort] ?? 0;
    out.push({
      day: parseInt(dateStr.slice(8, 10), 10),
      dayName: days[dow === 0 ? 6 : dow - 1] ?? "",
      month: months[parseInt(dateStr.slice(5, 7), 10) - 1] ?? "",
      dateStr,
    });
  }
  return out;
}

function formatDateTimeForConfirmation(
  dateStr: string,
  time: string,
  days: readonly string[],
  months: readonly string[],
  timeZone: string,
): string {
  const ref = new Date(clubLocalDateTimeToUtcIso(dateStr, "12:00", timeZone));
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(ref);
  const weekdayToIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = weekdayToIndex[weekdayShort] ?? 0;
  const dayName = days[dow === 0 ? 6 : dow - 1] ?? "";
  const dayNum = parseInt(dateStr.slice(8, 10), 10);
  const month = months[parseInt(dateStr.slice(5, 7), 10) - 1] ?? "";
  return `${dayName}, ${dayNum} ${month} · ${time}`;
}

function matchBelongsToClub(match: MatchEnriched, clubId: string): boolean {
  const clubIdFromMatch = getMatchBooking(match)?.courts?.club_id;
  return clubIdFromMatch != null && clubIdFromMatch === clubId;
}

/** Evita presentar Stripe mientras otro Modal aún se está cerrando. */
function waitForStripePresent(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

interface CourtCardDynamicProps {
  court: Court;
  isExpanded: boolean;
  onToggleExpand: () => void;
  priceInfo?: { minPriceCents: number; minPriceFormatted: string };
  selectedTimeSlot: string | null;
  selectedDateStr: string;
  clubId: string;
  reservingCourtId: string | null;
  bookingFlowLocked: boolean;
  onReservar: (c: Court, finalPriceCents: number) => void;
  token?: string;
  duration: number;
  t: TranslateFn;
}

function CourtCardDynamic({
  court,
  isExpanded,
  onToggleExpand,
  priceInfo,
  selectedTimeSlot,
  selectedDateStr,
  clubId,
  reservingCourtId,
  bookingFlowLocked,
  onReservar,
  token,
  duration,
  t,
}: CourtCardDynamicProps) {
  const quoteSlot =
    isExpanded && selectedTimeSlot ? selectedTimeSlot : undefined;

  const { priceData, loading, error: priceError } = useSlotPrice({
    clubId,
    courtId: court.id,
    date: selectedDateStr,
    slot: quoteSlot,
    durationMinutes: duration,
    reservationType: "standard",
    token,
  });

  const hasSlotQuote = Boolean(quoteSlot);

  const getPriceDisplay = () => {
    if (!hasSlotQuote) return priceInfo?.minPriceFormatted ?? "-";
    if (loading) return "…";
    if (priceError) return "—";
    if (priceData && priceData.total_price_cents > 0) {
      return `${(priceData.total_price_cents / 100).toFixed(2)} €`;
    }
    return priceInfo?.minPriceFormatted ?? "-";
  };

  const finalPriceCents =
    hasSlotQuote && priceData && priceData.total_price_cents > 0
      ? priceData.total_price_cents
      : 0;

  const isReservingThisCourt = reservingCourtId === court.id;
  const canReserve =
    Boolean(selectedTimeSlot) &&
    !bookingFlowLocked &&
    !isReservingThisCourt &&
    !loading &&
    finalPriceCents > 0;

  const reserveLabel = !selectedTimeSlot
    ? t("search.filterTime")
    : bookTabLabel(t);

  return (
    <View style={styles.courtCard}>
      <Pressable
        style={({ pressed }) => [
          styles.courtCardHeader,
          pressed && styles.pressed,
        ]}
        onPress={onToggleExpand}
      >
        <View style={styles.courtRowLeft}>
          <Text style={styles.courtCardName}>{court.name}</Text>
          <Text style={styles.courtCardSub}>
            {getCerramientoLabel(court.indoor, t)} |{" "}
            {getParedesLabel(court.glass_type, t)} | {t("common.doubles")}
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
          <View style={styles.courtPriceBox}>
            <Text style={styles.courtPriceAmount}>{getPriceDisplay()}</Text>
            {hasSlotQuote ? (
              <Text style={styles.courtPriceHint}>
                Total · {t("common.durationMin", { minutes: duration })}
              </Text>
            ) : null}
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.courtReservarBtn,
              (!canReserve && !isReservingThisCourt) && styles.courtReservarBtnDisabled,
              pressed && canReserve && styles.pressed,
            ]}
            onPress={() =>
              canReserve ? onReservar(court, finalPriceCents) : undefined
            }
            disabled={!canReserve || isReservingThisCourt}
          >
            <View style={styles.courtReservarBtnInner}>
              <Text
                style={[
                  canReserve || isReservingThisCourt
                    ? styles.courtReservarText
                    : styles.courtReservarTextDisabled,
                  isReservingThisCourt && styles.courtReservarTextHidden,
                ]}
              >
                {reserveLabel}
              </Text>
              {isReservingThisCourt ? (
                <View style={styles.courtReservarSpinner} pointerEvents="none">
                  <ActivityIndicator size="small" color="#ffffff" />
                </View>
              ) : null}
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function ClubDetailScreen({
  court,
  onClose,
  onPartidoPress,
}: ClubDetailScreenProps) {
  const { t, locale } = useTranslation();
  const visibleTabs = useMemo(
    () =>
      isFeatureHidden("clubDetail.competitionsTab")
        ? TAB_IDS.filter((tab) => tab !== "competitions")
        : TAB_IDS,
    [],
  );
  const localeBundle = useMemo(() => getLocaleBundle(locale), [locale]);
  const dateLocale = formatLocale(locale);
  const { session } = useAuth();
  const profile = useMyProfile().data ?? null;
  const { refreshCourtReservations } = useHomeActions();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [activeTab, setActiveTab] = useState<TabId>("home");
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
  const [duration, setDuration] = useState<CourtReservationDuration>(60);
  const durationInitClubIdRef = useRef<string | null>(null);
  const [reviewsAverage, setReviewsAverage] = useState<number | null>(null);
  const loadClubData = useCallback(async () => {
    setClubCourtsLoading(true);
    const token = session?.access_token;
    const [club, clubPublic, courts, reviewsRes] = await Promise.all([
      fetchClubById(court.clubId, token),
      fetchClubPublicInfo(court.clubId),
      fetchCourtsByClubId(court.clubId),
      fetchPublicClubReviews(court.clubId),
    ]);
    setClubCourts(courts);
    // Solo fijar duración inicial al entrar al club; no pisar si el usuario ya eligió otra.
    if (durationInitClubIdRef.current !== court.clubId) {
      const clubDur = Number(club?.slot_duration_min);
      setDuration(defaultCourtReservationDuration(clubDur));
      durationInitClubIdRef.current = court.clubId;
    }
    const tz =
      clubPublic?.timezone?.trim() ||
      club?.timezone?.trim() ||
      undefined;
    if (tz) {
      setClubTimezone(tz);
      setClubTimeZone(tz);
    }
    setScheduleText(
      club?.weekly_schedule
        ? formatWeeklySchedule(
            club.weekly_schedule as Record<string, unknown>,
            t,
          )
        : null,
    );
    setReviewsAverage(reviewsRes ? reviewsRes.summary.average : null);
    setClubCourtsLoading(false);
  }, [court.clubId, session?.access_token, t]);

  useEffect(() => {
    loadClubData();
  }, [loadClubData]);

  const loadClubPartidos = useCallback(async () => {
    setPartidosLoading(true);
    const matches = await fetchMatches({
      expand: true,
      clubId: court.clubId,
      activeOnly: true,
      visibility: "public",
      discovery: true,
    });
    const filtered = matches
      .filter((m) => matchBelongsToClub(m, court.clubId))
      .map((m) => mapMatchToPartido(m))
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.matchPhase !== "past")
      .filter((p) => p.visibility !== "private");
    setClubPartidos(filtered);
    setPartidosLoading(false);
  }, [court.clubId]);

  useEffect(() => {
    if (activeTab === "openMatches") {
      loadClubPartidos();
    }
  }, [activeTab, loadClubPartidos]);
  const [selectedDateIndex, setSelectedDateIndex] = useState(1);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [partidosAlertsEnabled, setPartidosAlertsEnabled] = useState(false);
  const [rawTimeSlotsUnion, setRawTimeSlotsUnion] = useState<string[]>([]);
  const [rawSlotsByCourt, setRawSlotsByCourt] = useState<Record<string, string[]>>(
    {},
  );
  const [slotUtcByTime, setSlotUtcByTime] = useState<
    Record<string, { start_at: string; end_at: string }>
  >({});
  const [clubTimezone, setClubTimezone] = useState<string | undefined>(undefined);
  const [timeSlotsLoading, setTimeSlotsLoading] = useState(false);
  const [slotNow, setSlotNow] = useState(() => new Date());
  const [courtPrices, setCourtPrices] = useState<
    Record<string, { minPriceCents: number; minPriceFormatted: string }>
  >({});
  const [expandedCourtId, setExpandedCourtId] = useState<string | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [reservingCourtId, setReservingCourtId] = useState<string | null>(null);
  const [awaitingStripe, setAwaitingStripe] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const activeTz = clubTimezone ?? clubIanaTimeZone();
  const dateOptions = useMemo(
    () =>
      getNextClubDays(
        7,
        localeBundle.search.clubDetailDays,
        localeBundle.common.monthsShort,
        activeTz,
      ),
    [localeBundle, activeTz],
  );

  const dateStrForSlots = useMemo(
    () => addDaysToClubKey(dayKeyInClubTz(new Date()), selectedDateIndex),
    [selectedDateIndex],
  );

  const startAtUtcByTime = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [time, utc] of Object.entries(slotUtcByTime)) {
      out[time] = utc.start_at;
    }
    return out;
  }, [slotUtcByTime]);

  const timeSlotsForDate = useMemo(
    () =>
      filterSlotsStartingAfterNow(dateStrForSlots, rawTimeSlotsUnion, slotNow, {
        clubTimezone,
        startAtUtcByTime,
      }),
    [dateStrForSlots, rawTimeSlotsUnion, slotNow, clubTimezone, startAtUtcByTime],
  );

  const slotsByCourt = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const [id, slots] of Object.entries(rawSlotsByCourt)) {
      o[id] = filterSlotsStartingAfterNow(dateStrForSlots, slots, slotNow, {
        clubTimezone,
        startAtUtcByTime,
      });
    }
    return o;
  }, [dateStrForSlots, rawSlotsByCourt, slotNow, clubTimezone, startAtUtcByTime]);

  useEffect(() => {
    if (activeTab !== "book") return;
    setSlotNow(new Date());
    const id = setInterval(() => setSlotNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [activeTab, selectedDateIndex]);

  useEffect(() => {
    if (
      selectedTimeSlot &&
      !timeSlotsForDate.includes(selectedTimeSlot)
    ) {
      setSelectedTimeSlot(null);
    }
  }, [timeSlotsForDate, selectedTimeSlot]);

  const bookingFlowLocked =
    reservingCourtId != null || awaitingStripe || confirmingPayment;

  const loadTimeSlotsForDate = useCallback(
    async (dateStr: string, opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) setTimeSlotsLoading(true);
      try {
        const slotsPerCourt: Record<string, string[]> = {};
        
        // Mantener fetchSearchCourts solo para precios
        const searchResults = await fetchSearchCourts({
          dateFrom: dateStr,
          dateTo: dateStr,
        });
        const clubResults = searchResults.filter((r) => r.clubId === court.clubId);
        const prices: Record<
          string,
          { minPriceCents: number; minPriceFormatted: string }
        > = {};
        for (const r of clubResults) {
          if (r.minPriceCents > 0) {
            prices[r.id] = {
              minPriceCents: r.minPriceCents,
              minPriceFormatted:
                r.minPriceFormatted ?? `${Math.round(r.minPriceCents / 100)}€`,
            };
          }
        }
        setCourtPrices(prices);

        // Nueva fuente para disponibilidad: fetchAvailableSlots
        const availability = await fetchAvailableSlots({
          clubId: court.clubId,
          date: dateStr,
          durationMinutes: duration,
          slotStepMinutes: courtReservationSlotStepMinutes(duration),
          exclusiveOccupancy: true,
          token: session?.access_token,
        });

        const allSlots: string[] = [];
        const utcByTime: Record<string, { start_at: string; end_at: string }> = {};
        let resolvedClubTz: string | undefined;
        if (availability.ok) {
          for (const res of availability.results) {
            if (res.club_timezone?.trim()) resolvedClubTz = res.club_timezone.trim();
            const courtSlots = res.free_slots.map((s) => s.start);
            allSlots.push(...courtSlots);
            slotsPerCourt[res.court_id] = courtSlots;
            for (const s of res.free_slots) {
              if (s.start_at) {
                const end_at =
                  s.end_at ??
                  new Date(
                    new Date(s.start_at).getTime() + duration * 60 * 1000,
                  ).toISOString();
                utcByTime[s.start] = { start_at: s.start_at, end_at };
              }
            }
          }
        }

        setRawTimeSlotsUnion([...new Set(allSlots)].sort());
        setRawSlotsByCourt(slotsPerCourt);
        setSlotUtcByTime(utcByTime);
        if (resolvedClubTz) {
          setClubTimezone(resolvedClubTz);
          setClubTimeZone(resolvedClubTz);
        }
        setSlotNow(new Date());
      } catch (err) {
        __DEV__ && console.warn("[ClubDetail] Error loading availability:", err);
        if (!silent) {
          setRawTimeSlotsUnion([]);
          setCourtPrices({});
          setRawSlotsByCourt({});
        }
      } finally {
        if (!silent) setTimeSlotsLoading(false);
      }
    },
    [court.clubId, session?.access_token, duration],
  );

  useEffect(() => {
    setSelectedTimeSlot(null);
    setExpandedCourtId(null);
  }, [selectedDateIndex, activeTab, duration]);

  useEffect(() => {
    if (activeTab === "book") {
      loadTimeSlotsForDate(dateStrForSlots);
    }
  }, [activeTab, dateStrForSlots, loadTimeSlotsForDate, duration]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && activeTab === "book") {
        setSlotNow(new Date());
        void loadTimeSlotsForDate(dateStrForSlots);
      }
    });
    return () => sub.remove();
  }, [activeTab, dateStrForSlots, loadTimeSlotsForDate]);

  useEffect(() => {
    if (profile?.id) {
      setOrganizerPlayerId(profile.id);
      return;
    }
    if (session?.access_token) {
      fetchMyPlayerId(session.access_token).then(setOrganizerPlayerId);
    } else {
      setOrganizerPlayerId(null);
    }
  }, [profile?.id, session?.access_token]);

  const handleReservar = useCallback(
    async (
      c: Court,
      finalPriceCents: number,
    ) => {
      if (!selectedTimeSlot) {
        Alert.alert(
          t("search.filterTime"),
          t("partidos.createDateTimeSub"),
        );
        return;
      }
      const slotDateStr = dateStrForSlots;
      const courtSlots = slotsByCourt[c.id] ?? [];
      if (!courtSlots.includes(selectedTimeSlot)) {
        Alert.alert(
          t("alerts.scheduleConflict.title"),
          t("search.clubSlotUnavailable"),
        );
        void loadTimeSlotsForDate(slotDateStr);
        return;
      }
      if (
        filterSlotsStartingAfterNow(
          slotDateStr,
          [selectedTimeSlot],
          new Date(),
          {
            clubTimezone: activeTz,
            startAtUtcByTime: slotUtcByTime[selectedTimeSlot]
              ? { [selectedTimeSlot]: slotUtcByTime[selectedTimeSlot].start_at }
              : undefined,
          },
        ).length === 0
      ) {
        Alert.alert(
          t("alerts.scheduleConflict.title"),
          t("search.clubSlotUnavailable"),
        );
        return;
      }
      if (!session?.access_token) {
        Alert.alert(t("common.loginRequired"), t("search.clubLoginToBook"));
        return;
      }
      let playerId = organizerPlayerId ?? profile?.id ?? null;
      if (!playerId) {
        playerId = await fetchMyPlayerId(session.access_token);
        if (playerId) setOrganizerPlayerId(playerId);
      }
      if (!playerId) {
        Alert.alert(
          t("common.playerFallback"),
          t("search.clubProfileNotFound"),
        );
        return;
      }
      if (finalPriceCents <= 0) {
        Alert.alert(t("common.error"), t("search.clubPriceError"));
        return;
      }

      const shouldOfferPayLater = c.allow_payment_after_play === true;
      const askPayLaterChoice = () =>
        new Promise<"pay_now" | "pay_later" | "cancel">((resolve) => {
          if (!shouldOfferPayLater) {
            resolve("pay_now");
            return;
          }
          Alert.alert(
            t("common.chooseOption"),
            t("search.clubPayChoiceTitle"),
            [
              { text: t("common.cancel"), style: "cancel", onPress: () => resolve("cancel") },
              { text: t("search.clubPayLater"), onPress: () => resolve("pay_later") },
              { text: t("search.clubPayNow"), onPress: () => resolve("pay_now") },
            ],
          );
        });

      const dateStr = dateStrForSlots;
      const utcSlot = slotUtcByTime[selectedTimeSlot];
      const { start_at, end_at } = resolveSlotStartEndUtc({
        dateStr,
        time: selectedTimeSlot,
        durationMinutes: duration,
        startAtUtc: utcSlot?.start_at,
        clubTimezone: activeTz,
      });
      const totalPriceCents = Math.max(finalPriceCents, 100);
      const payChoice = await askPayLaterChoice();
      if (payChoice === "cancel") return;

      const showReservationConfirmation = (reservedCourt: Court) => {
        setReservingCourtId(null);
        setAwaitingStripe(false);
        setConfirmingPayment(false);
        setExpandedCourtId(null);
        setConfirmationModalData({
          courtName: reservedCourt.name,
          clubName: court.clubName,
          dateTimeFormatted: formatDateTimeForConfirmation(
            dateStrForSlots,
            selectedTimeSlot,
            localeBundle.search.clubDetailDays,
            localeBundle.common.monthsShort,
            activeTz,
          ),
          duration: t("common.durationMin", { minutes: duration }),
          priceFormatted: `${(finalPriceCents / 100).toFixed(2)}€`,
          confirmationKind: "reservation",
          clubId: court.clubId,
          courtId: reservedCourt.id,
          date: dateStrForSlots,
          slot: selectedTimeSlot,
          durationMinutes: duration,
        });
        void refreshCourtReservations({ force: true });
        void loadTimeSlotsForDate(dateStrForSlots, { silent: true });
      };

      setReservingCourtId(c.id);

      if (payChoice === "pay_later") {
        const created = await createCourtReservationPayLater({
          courtId: c.id,
          organizerPlayerId: playerId,
          startAtIso: start_at,
          endAtIso: end_at,
          totalPriceCents,
          token: session.access_token,
        });
        if (!created.ok) {
          setReservingCourtId(null);
          Alert.alert(t("common.error"), created.error ?? t("search.clubBookNoPayError"));
          return;
        }
        showReservationConfirmation(c);
        return;
      }

      const intentRes = await createIntentForCourtReservation(
        {
          court_id: c.id,
          organizer_player_id: playerId,
          start_at,
          end_at,
          total_price_cents: totalPriceCents,
        },
        session.access_token,
      );

      if (!intentRes.ok || !intentRes.clientSecret) {
        setReservingCourtId(null);
        const errMsg =
          intentRes.error ?? t("common.paymentStartError");
        if (errMsg.includes("esa hora") || errMsg.includes("otro horario")) {
          Alert.alert(
            t("alerts.scheduleConflict.title"),
            t("alerts.scheduleConflict.body"),
          );
        } else {
          Alert.alert(t("common.error"), errMsg);
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
        setReservingCourtId(null);
        Alert.alert(t("common.error"), t("common.paymentConfiguredError"));
        return;
      }

      setReservingCourtId(null);
      setAwaitingStripe(true);
      let presentErr: { code?: string; message?: string } | null = null;
      try {
        await waitForStripePresent();
        const result = await presentPaymentSheet();
        presentErr = result.error ?? null;
      } finally {
        setAwaitingStripe(false);
      }

      if (presentErr) {
        if (presentErr.code === "Canceled") {
          // Usuario canceló, no mostrar error
        } else {
          Alert.alert(t("common.error"), t("common.paymentProcessError"));
        }
        return;
      }

      setConfirmingPayment(true);
      let paymentConfirmed = false;
      try {
        const confirmRes = await confirmPaymentFromClient(
          intentRes.paymentIntentId!,
          session.access_token,
        );
        paymentConfirmed = confirmRes.ok === true;
      } finally {
        setConfirmingPayment(false);
      }

      if (!paymentConfirmed) {
        Alert.alert(t("common.error"), t("search.clubBookingConfirmError"));
        return;
      }

      showReservationConfirmation(c);
    },
    [
      selectedTimeSlot,
      dateStrForSlots,
      slotsByCourt,
      activeTz,
      slotUtcByTime,
      clubTimezone,
      startAtUtcByTime,
      organizerPlayerId,
      profile?.id,
      session?.access_token,
      court.clubName,
      court.clubId,
      duration,
      initPaymentSheet,
      presentPaymentSheet,
      loadTimeSlotsForDate,
      refreshCourtReservations,
      t,
      localeBundle,
    ],
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </Pressable>
        {!isFeatureHidden("clubDetail.headerActions") && (
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
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        {visibleTabs.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={({ pressed }) => [
              styles.tab,
              tab === "openMatches" && styles.tabPartidosAbiertos,
              activeTab === tab ? styles.tabActive : styles.tabInactive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                tab === "openMatches" && styles.tabPartidosAbiertosText,
                activeTab === tab
                  ? styles.tabTextActive
                  : styles.tabTextInactive,
              ]}
              numberOfLines={tab === "openMatches" ? undefined : 2}
            >
              {getTabLabel(tab, t)}
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
          {court.imageUrl ? (
            <Image
              source={{ uri: court.imageUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : null}
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.8)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroOrb} />
            <View style={styles.heroContent}>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{t("common.today")}</Text>
              </View>
              <Text style={styles.heroTitle}>{court.clubName}</Text>
              <View style={styles.heroLocation}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color="rgba(255,255,255,0.5)"
                />
                <Text style={styles.heroAddress}>
                  {court.address || court.city}
                </Text>
              </View>
              <View style={styles.heroStats}>
                <View style={styles.heroStat} collapsable={false}>
                  <Ionicons name="star" size={12} color="#fbbf24" style={styles.heroStatStar} />
                  <Text style={[styles.heroStatText, styles.heroStatTextRating]}>
                    {reviewsAverage != null
                      ? reviewsAverage.toLocaleString(dateLocale, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })
                      : "—"}
                  </Text>
                </View>
                <View style={styles.heroStat} collapsable={false}>
                  <Text style={[styles.heroStatText, styles.heroStatTextCourts]}>
                    {clubCourtsLoading
                      ? t("common.loadingEllipsis")
                      : clubCourts.length === 0
                        ? t("partidos.createNoCourts")
                        : clubCourts.length === 1
                          ? `1 ${t("common.courtFallback")}`
                          : `${clubCourts.length} ${t("common.courtFallback")}`}
                  </Text>
                </View>
                {court.distanceKm != null && (
                  <View style={styles.heroStat} collapsable={false}>
                    <Text style={[styles.heroStatText, styles.heroStatTextDist]}>
                      {Math.round(court.distanceKm)}km
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </LinearGradient>
        </View>

        {activeTab === "book" ? (
          <>
            <View style={styles.section}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.datePickerRow}
              >
                {!isFeatureHidden("clubDetail.dateSearch") && (
                  <Pressable style={styles.dateSearchBtn}>
                    <Ionicons name="search-outline" size={16} color="#6b7280" />
                  </Pressable>
                )}
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
              <Text style={styles.reservaTitle}>{t("search.courtReservationDurationTitle")}</Text>
              <Text style={styles.reservaSub}>{t("search.courtReservationDurationSub")}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.timeSlotsCarousel}
              >
                {COURT_RESERVATION_DURATION_OPTIONS.map((mins) => {
                  const isSelected = duration === mins;
                  return (
                    <Pressable
                      key={mins}
                      onPress={() => {
                        if (bookingFlowLocked) return;
                        setDuration(mins);
                      }}
                      disabled={bookingFlowLocked}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={t("search.courtReservationDurationOptionA11y", {
                        minutes: mins,
                      })}
                      style={({ pressed }) => [
                        styles.timeSlotBtn,
                        isSelected && styles.timeSlotBtnSelected,
                        bookingFlowLocked && styles.timeSlotBtnDisabled,
                        pressed && !bookingFlowLocked && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.timeSlotText,
                          isSelected && styles.timeSlotTextSelected,
                        ]}
                      >
                        {t("common.durationMin", { minutes: mins })}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.section}>
              {timeSlotsLoading && rawTimeSlotsUnion.length === 0 ? (
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
                        onPress={() => {
                          if (bookingFlowLocked) return;
                          setSelectedTimeSlot(slot);
                        }}
                        disabled={bookingFlowLocked}
                        style={({ pressed }) => [
                          styles.timeSlotBtn,
                          isSelected && styles.timeSlotBtnSelected,
                          bookingFlowLocked && styles.timeSlotBtnDisabled,
                          pressed && !bookingFlowLocked && styles.pressed,
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
                  {t("partidos.createNoSlots")}
                </Text>
              )}
            </View>
            {!isFeatureHidden("clubDetail.favoritesAlerts") && (
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
                        {t("alerts.favorites.title")}
                      </Text>
                    </View>
                    <Text style={styles.alertSub}>
                      {t("common.comingSoonSection")}
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
            )}
            <View style={styles.section}>
              <Text style={styles.reservaTitle}>{t("partidos.yourReservation")}</Text>
              <Text style={styles.reservaSub}>
                {t("partidos.courtReservationSub")}
              </Text>
              <View style={styles.courtList}>
                {!selectedTimeSlot ? (
                  <Text style={styles.partidosEmptySubtitle}>
                    {t("alerts.createMatch.noSlots.body")}
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
                          {t("alerts.createMatch.noSlots.title")}
                        </Text>
                      );
                    }

                    return courtsToShow.map((c) => (
                      <CourtCardDynamic
                        key={c.id}
                        court={c}
                        isExpanded={expandedCourtId === c.id}
                        onToggleExpand={() =>
                          setExpandedCourtId(expandedCourtId === c.id ? null : c.id)
                        }
                        priceInfo={courtPrices[c.id]}
                        selectedTimeSlot={selectedTimeSlot}
                        selectedDateStr={dateStrForSlots}
                        clubId={court.clubId}
                        token={session?.access_token}
                        reservingCourtId={reservingCourtId}
                        bookingFlowLocked={bookingFlowLocked}
                        onReservar={handleReservar}
                        duration={duration}
                        t={t}
                      />
                    ));
                  })()
                ) : (
                  <Text style={styles.partidosEmptySubtitle}>
                    {t("partidos.createNoCourts")}
                  </Text>
                )}
              </View>
            </View>
          </>
        ) : activeTab === "openMatches" ? (
          <>
            <View style={styles.section}>
              <Text style={styles.partidosSectionTitle}>
                {t("partidos.noOpenMatches")} · {court.clubName}
              </Text>
              <Text style={styles.partidosSectionSub}>
                {t("partidos.noOpenMatchesHint")}
              </Text>
            </View>
            {partidosLoading ? (
              <View style={[styles.section, styles.partidosEmptySection]}>
                <ActivityIndicator size="large" color={theme.auth.accent} />
                <Text style={[styles.partidosEmptySubtitle, { marginTop: 12 }]}>
                  {t("common.loadingEllipsis")}
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
                    {t("partidos.noOpenMatches")}
                  </Text>
                  <Text style={styles.partidosEmptySubtitle}>
                    {t("partidos.noOpenMatchesHint")}
                  </Text>
                </View>
              </View>
            )}
            {!isFeatureHidden("clubDetail.openMatchAlerts") && (
              <View style={styles.section}>
                <View style={styles.partidosAlertHeader}>
                  <Ionicons
                    name="notifications-outline"
                    size={16}
                    color="#f97316"
                  />
                  <Text style={styles.partidosAlertTitle}>
                    {t("alerts.favorites.title")}
                  </Text>
                </View>
                <Text style={styles.partidosAlertDesc}>
                  {t("common.comingSoonSection")}
                </Text>
                <View style={styles.partidosAlertRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.manageAlertsBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.manageAlertsText}>
                      {t("common.comingSoon")}
                    </Text>
                  </Pressable>
                  <Switch
                    value={partidosAlertsEnabled}
                    onValueChange={setPartidosAlertsEnabled}
                    trackColor={{ false: "#e5e7eb", true: theme.auth.accent }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            )}
          </>
        ) : activeTab === "competitions" ? (
          <>
            <View style={styles.partidosFiltersWrap}>
              <Text style={styles.partidosCompeticionesHint}>
                {t("common.comingSoonSection")}
              </Text>
            </View>
            <View style={styles.partidosEmptySection}>
              <View style={styles.partidosEmptyState}>
                <View style={styles.partidosEmptyIcon}>
                  <Text style={styles.partidosEmptyEmoji}>🏆</Text>
                </View>
                <Text style={styles.partidosEmptyTitle}>
                  {t("common.comingSoon")}
                </Text>
                <Text style={styles.partidosEmptySubtitle}>
                  {t("common.comingSoonSection")}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t("partidos.detailTabInfo")} · {t("common.clubFallback")}
              </Text>
              <View style={styles.tagsRow}>
                <View style={[styles.tag, styles.tagSport]} collapsable={false}>
                  <Text style={styles.tagText}>🎾 {t("common.sportPadel")}</Text>
                </View>
                <View style={[styles.tag, styles.tagSport]} collapsable={false}>
                  <Text style={styles.tagText}>🎾 {t("common.sportTenis")}</Text>
                </View>
              </View>
              <Text style={styles.pistasLabel}>
                {clubCourts.length === 0
                  ? t("common.courtFallback")
                  : clubCourts.length === 1
                    ? `1 ${t("common.courtFallback")}`
                    : `${clubCourts.length} ${t("common.courtFallback")}`}
              </Text>
              <View style={styles.amenitiesRow}>
                <View
                  style={[styles.amenity, styles.amenityMinAccesible]}
                  collapsable={false}
                >
                  <View style={styles.amenityIconWrap}>
                    <Ionicons
                      name="accessibility-outline"
                      size={14}
                      color="#6b7280"
                    />
                  </View>
                  <Text style={styles.amenityText}>{t("common.comingSoon")}</Text>
                </View>
                <View
                  style={[styles.amenity, styles.amenityMinMaterial]}
                  collapsable={false}
                >
                  <View style={styles.amenityIconWrap}>
                    <Ionicons
                      name="construct-outline"
                      size={14}
                      color="#6b7280"
                    />
                  </View>
                  <Text style={styles.amenityText}>{t("common.proShop")}</Text>
                </View>
                <View
                  style={[styles.amenity, styles.amenityMinParking]}
                  collapsable={false}
                >
                  <View style={styles.amenityIconWrap}>
                    <Ionicons name="car-outline" size={14} color="#6b7280" />
                  </View>
                  <Text style={styles.amenityText}>{t("alerts.location.title")}</Text>
                </View>
              </View>
              <View style={styles.tagsRow}>
                <View style={[styles.tag, styles.tagMeta]} collapsable={false}>
                  <Text style={styles.tagText}>
                    {getCerramientoLabel(court.indoor, t)}
                  </Text>
                </View>
                <View style={[styles.tag, styles.tagMeta]} collapsable={false}>
                  <Text style={styles.tagText}>
                    {getParedesLabel(court.glassType, t)}
                  </Text>
                </View>
              </View>
              {!isFeatureHidden("clubDetail.contactActions") && (
                <>
                  <View style={styles.actionsRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="navigate" size={20} color="#fff" />
                      <Text style={styles.actionLabel}>{t("alerts.location.title")}</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionButtonOutline,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="globe-outline" size={20} color="#6b7280" />
                      <Text style={styles.actionLabelOutline}>{t("alerts.web.title")}</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionButtonOutline,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="call-outline" size={20} color="#6b7280" />
                      <Text style={styles.actionLabelOutline}>{t("alerts.phone.title")}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.mapPlaceholder}>
                    <Text style={styles.mapPlaceholderText}>{t("alerts.location.title")}</Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("search.filterTime")}</Text>
              <View style={[styles.scheduleRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.scheduleDay}>{t("search.filterTime")}</Text>
                <Text style={styles.scheduleHours} numberOfLines={3}>
                  {scheduleText ?? t("common.comingSoonSection")}
                </Text>
              </View>
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

      {confirmingPayment ? (
        <View style={styles.bookingConfirmingVeil} pointerEvents="auto">
          <View style={styles.bookingConfirmingCard}>
            <ActivityIndicator size="large" color={theme.auth.accent} />
            <Text style={styles.bookingConfirmingText}>
              {t("search.courtBookingConfirming")}
            </Text>
          </View>
        </View>
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
    ...Platform.select({
      android: {
        minWidth: 250,
        paddingHorizontal: 20,
      },
    }),
  },
  tabPartidosAbiertosText: {
    ...Platform.select({
      android: {
        flexShrink: 0,
        minWidth: 120,
      },
    }),
  },
  tabActive: {
    backgroundColor: theme.auth.accent,
  },
  tabInactive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  tabText: {
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
  tabTextActive: {
    color: "#fff",
  },
  tabTextInactive: {
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
    ...Platform.select({
      android: {
        right: -22,
      },
    }),
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
  statusText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1,
    lineHeight: 14,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  heroTitle: {
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
  heroAddress: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.5)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  heroStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  heroStat: {
    alignSelf: "flex-start",
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    overflow: "visible",
  },
  heroStatStar: {
    marginRight: 6,
  },
  heroStatText: {
    flexShrink: 0,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({
      android: {
        includeFontPadding: false,
        lineHeight: Math.ceil(theme.fontSize.xs * 1.35),
        textBreakStrategy: "simple",
      },
    }),
  },
  heroStatTextRating: {
    ...Platform.select({
      android: {
        minWidth: 18,
        paddingRight: 1,
      },
    }),
  },
  heroStatTextCourts: {
    ...Platform.select({
      android: {
        minWidth: 44,
        paddingRight: 1,
      },
    }),
  },
  heroStatTextDist: {
    ...Platform.select({
      android: {
        minWidth: 24,
        paddingRight: 1,
      },
    }),
  },
  section: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: theme.spacing.md,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginRight: -theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  tag: {
    flexShrink: 0,
    marginRight: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    overflow: "visible",
  },
  /** Android: emoji + texto en wrap; minWidth compacto con stretch en tagText. */
  tagSport: {
    minWidth: 70,
  },
  tagMeta: {
    minWidth: 56,
  },
  tagText: {
    alignSelf: "stretch",
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "500",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({
      android: {
        includeFontPadding: false,
        lineHeight: Math.ceil(theme.fontSize.xs * 1.35),
      },
    }),
  },
  pistasLabel: {
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    marginBottom: theme.spacing.lg,
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
    alignSelf: "stretch",
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
    alignSelf: "stretch",
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
  mapPlaceholderText: {
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
  scheduleDay: {
    flexShrink: 0,
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  scheduleHours: {
    flex: 1,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    textAlign: "right",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  amenitiesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginRight: -theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  amenity: {
    position: "relative",
    alignSelf: "flex-start",
    flexShrink: 0,
    marginRight: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    paddingLeft: 30,
    paddingRight: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    overflow: "visible",
  },
  amenityMinAccesible: {
    minWidth: 86,
  },
  amenityMinMaterial: {
    minWidth: 156,
  },
  amenityMinParking: {
    minWidth: 74,
  },
  amenityIconWrap: {
    position: "absolute",
    left: 10,
    top: 0,
    bottom: 0,
    width: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  amenityText: {
    alignSelf: "stretch",
    flexShrink: 0,
    fontSize: theme.fontSize.xs,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({
      android: {
        includeFontPadding: false,
        lineHeight: Math.ceil(theme.fontSize.xs * 1.35),
      },
    }),
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
  promoEmoji: {
    fontSize: 18,
  },
  promoTextWrap: {
    flex: 1,
  },
  promoTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  promoSub: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 2,
    lineHeight: 14,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  promoCta: {
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
  topPlayerInitial: {
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
  topPlayerRank: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
  },
  topPlayerName: {
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
  resultDate: {
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
  resultName: {
    flexShrink: 1,
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
  resultLevelText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  resultScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  resultScoreWin: {
    flexShrink: 1,
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
  },
  resultScoreLose: {
    flexShrink: 1,
    fontSize: 24,
    fontWeight: "800",
    color: "rgba(255,255,255,0.35)",
  },
  resultScoreDash: {
    flexShrink: 1,
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
  accountText: {
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
  dateDayName: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 14,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  dateDayNum: {
    fontSize: 18,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 22,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  dateMonth: {
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 14,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  dateTextActive: {
    color: "#fff",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: {
    flexShrink: 1,
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
  timeSlotBtnDisabled: {
    opacity: 0.45,
  },
  timeSlotTextSelected: {
    color: "#fff",
  },
  timeSlotText: {
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
  alertSectionTitle: {
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  alertSub: {
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  reservaTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  reservaSub: {
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    marginBottom: theme.spacing.md,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  reservaToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  reservaToggleTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  reservaToggleSub: {
    marginTop: 2,
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  reservaLevelWrap: {
    marginBottom: theme.spacing.md,
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
  courtCardName: {
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtCardSub: {
    flexShrink: 1,
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
    lineHeight: 16,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtCardActions: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  courtPriceBox: {
    flex: 1,
    backgroundColor: theme.auth.accent,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  courtPriceAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 18,
    alignSelf: "stretch",
    textAlign: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtPriceHint: {
    fontSize: 10,
    color: "rgba(255,255,255,0.9)",
    marginTop: 1,
    lineHeight: 14,
    alignSelf: "stretch",
    textAlign: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtDurationBtn: {
    minWidth: 56,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  courtDurationValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 18,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtDurationLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.75)",
    lineHeight: 12,
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
  courtReservarBtnInner: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  courtReservarSpinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  courtReservarTextHidden: {
    opacity: 0,
  },
  bookingConfirmingVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
  },
  bookingConfirmingCard: {
    minWidth: 220,
    maxWidth: 300,
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 16,
  },
  bookingConfirmingText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 22,
  },
  courtReservarText: {
    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    alignSelf: "stretch",
    textAlign: "center",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  courtReservarTextDisabled: {
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
  courtName: {
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: "#ffffff",
  },
  courtSub: {
    flexShrink: 1,
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  partidosSectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    lineHeight: theme.lineHeightFor(theme.fontSize.lg),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosSectionSub: {
    fontSize: theme.fontSize.xs,
    color: "#9ca3af",
    marginBottom: theme.spacing.md,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosListWrap: {
    gap: 12,
    marginBottom: theme.spacing.lg,
  },
  partidosFiltersWrap: {
    marginBottom: theme.spacing.md,
  },
  partidosCompeticionesHint: {
    fontSize: theme.fontSize.xs,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    color: "rgba(255,255,255,0.55)",
    paddingHorizontal: theme.spacing.sm,
    ...Platform.select({ android: { includeFontPadding: false } }),
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
  partidosFilterText: {
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
  partidosEmptyEmoji: {
    fontSize: 30,
  },
  partidosEmptyTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    textAlign: "center",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosEmptySubtitle: {
    fontSize: theme.fontSize.xs,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    paddingHorizontal: theme.spacing.xs,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  reviewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  reviewHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  reviewAuthor: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  reviewStars: {
    fontSize: 12,
    color: "#fbbf24",
    marginLeft: 8,
  },
  reviewComment: {
    fontSize: theme.fontSize.xs,
    color: "#4b5563",
    lineHeight: 18,
  },
  reviewClubReply: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  reviewClubReplyLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.auth.accent,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  reviewClubReplyText: {
    fontSize: theme.fontSize.xs,
    color: "#374151",
    lineHeight: 18,
  },
  partidosAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  partidosAlertTitle: {
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosAlertDesc: {
    fontSize: theme.fontSize.xs,
    color: "#9ca3af",
    marginBottom: theme.spacing.sm,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
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
  manageAlertsText: {
    fontSize: theme.fontSize.xs,
    fontWeight: "700",
    color: theme.auth.accent,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosReservaTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosReservaSub: {
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 8,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosReservaHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  partidosReservaHintText: {
    flexShrink: 1,
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  partidosClockEmoji: {
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
  emptyStateEmoji: {
    fontSize: 28,
  },
  emptyStateTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  emptyStateSub: {
    fontSize: theme.fontSize.xs,
    color: "rgba(255,255,255,0.6)",
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
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
  compCardDate: {
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
  compCardDateTime: {
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 4,
  },
  compCardTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
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
  compTagText: {
    flexShrink: 1,
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
  compCardMetaText: {
    flexShrink: 1,
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
  compCardTeamsText: {
    flexShrink: 1,
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
  compVenueName: {
    flexShrink: 1,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  compVenueSub: {
    flexShrink: 1,
    fontSize: 10,
    color: "#9ca3af",
  },
});
