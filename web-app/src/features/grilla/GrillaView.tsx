import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Calendar, Printer, Menu, ArrowLeft, X, Globe } from 'lucide-react';
import { MainMenu } from '../../components/Layout/MainMenu';
import clsx from 'clsx';
import { useGrillaTranslation } from './i18n/useGrillaTranslation';
import { calendarLocale } from './i18n/calendarLocale';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  closestCenter,
} from '@dnd-kit/core';
import type {
  DragEndEvent,
  DragStartEvent,
  DragMoveEvent,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { TransformWrapper, TransformComponent, useTransformEffect } from 'react-zoom-pan-pinch';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

import type { Court, Reservation } from './types';
import { TimeAxis } from './components/TimeAxis';
import { GridBackground } from './components/GridBackground';
import { CourtColumn } from './components/CourtColumn';
import { ReservationCard } from './components/ReservationCard';
import { ReservationModal } from './components/ReservationModal';
import { SchoolCourseModal } from './components/SchoolCourseModal';

import { BadPracticeModal } from './components/BadPracticeModal';
import type { GapWarning } from './components/BadPracticeModal';
import { HoverTooltip } from './components/HoverTooltip';
import { pixelsToTime, timeToPixels, parseTimeStr, START_HOUR, END_HOUR, PIXELS_PER_MINUTE } from './utils/timeGrid';
import { ZoomContext, ZoomScales } from './context/ZoomContext';
import type { ZoomLevel } from './context/ZoomContext';
import dropSoundAsset from '../../assets/sounds/sfx2.mp3';

import { apiFetch, apiFetchWithAuth } from '../../services/api';
import { schoolCoursesService } from '../../services/schoolCourses';
import { authService } from '../../services/auth';

import './grilla.css';

// Data hooks for real integration
// In-memory cache for bookings by date (avoids re-fetching when switching dates)
const bookingsCache: Record<string, { data: any[]; ts: number }> = {};
const CACHE_TTL = 60_000; // 1 minute

const toDateStr = (d: Date | string) =>
    typeof d === 'string'
        ? d
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const useClubData = (dateOrStr: Date | string) => {
    const [courts, setCourts] = useState<Court[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [clubId, setClubId] = useState<string | null>(null);
    const courtsRef = useRef<Court[]>([]);
    const dateStr = toDateStr(dateOrStr);

    // Resolve club_id from the logged-in club owner's profile
    useEffect(() => {
        authService.getMe()
            .then((res) => {
                const id = res.clubs?.[0]?.id ?? null;
                // Reset courts cache so it re-fetches for the correct club
                courtsRef.current = [];
                setClubId(id);
            })
            .catch(() => setClubId(null));
    }, []);

    // Fetch courts once per club (they rarely change)
    const fetchCourts = useCallback(async (): Promise<Court[]> => {
        if (!clubId) return [];
        let courtsRes = await apiFetchWithAuth<any>(`/courts?club_id=${clubId}`);
        let courtsData: Court[] = (courtsRes.courts || []).map((c: any) => ({
            id: c.id, name: c.name, locationId: 'sede-central'
        }));

        if (courtsData.length === 0) {
            const allClubsRes = await apiFetch<any>('/clubs');
            if (allClubsRes.ok && allClubsRes.result?.length > 0) {
                const firstClub = allClubsRes.result[0];
                courtsRes = await apiFetch<any>(`/courts?club_id=${firstClub.id}`);
                courtsData = (courtsRes.courts || []).map((c: any) => ({
                    id: c.id, name: c.name, locationId: 'sede-central'
                }));
            }
        }

        if (courtsData.length === 0) {
            courtsData = [
                { id: 'c-pista-1', name: 'PISTA 1', locationId: 'sede-central' },
                { id: 'c-pista-2', name: 'PISTA 2', locationId: 'sede-central' },
                { id: 'c-pista-3', name: 'PISTA 3', locationId: 'sede-central' },
                { id: 'c-pista-4', name: 'PISTA 4', locationId: 'sede-central' },
            ];
        }
        courtsRef.current = courtsData;
        setCourts(courtsData);
        return courtsData;
    }, [clubId]);

    // Fetch bookings for a single date — filtered by club to avoid cross-club pollution
    const fetchBookingsForDate = useCallback(async (date: string, courtsData: Court[]): Promise<Reservation[]> => {
        const cached = bookingsCache[date];
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
            return mapBookings(cached.data, courtsData);
        }

        const query = clubId ? `/bookings?date=${date}&club_id=${clubId}` : `/bookings?date=${date}`;
        const [bRes, schoolSlots] = await Promise.all([
          apiFetchWithAuth<any>(query),
          clubId ? schoolCoursesService.slots(clubId, date) : Promise.resolve([]),
        ]);
        const raw = bRes.bookings || [];
        const schoolAsBookings = schoolSlots.map((slot) => ({
          id: `school-slot-${slot.id}`,
          court_id: slot.court_id,
          start_at: `${date}T${slot.start_time}:00Z`,
          end_at: `${date}T${slot.end_time}:00Z`,
          status: 'confirmed',
          reservation_type: 'school_course',
          source_channel: 'system',
          notes: `${slot.course_name}${slot.staff_name ? ` - ${slot.staff_name}` : ''}`,
          players: { first_name: 'Curso', last_name: slot.course_name },
        }));
        const merged = [...raw, ...schoolAsBookings];
        bookingsCache[date] = { data: merged, ts: Date.now() };
        return mapBookings(merged, courtsData);
    }, [clubId]);

    const fetchData = useCallback(async () => {
        if (!clubId) return; // wait until club is resolved from auth
        setLoading(true);
        try {
            const courtsData = await fetchCourts();
            const mapped = await fetchBookingsForDate(dateStr, courtsData);
            setReservations(mapped);
        } catch (err) {
            console.error('Error fetching club data:', err);
        } finally {
            setLoading(false);
        }
    }, [clubId, dateStr, fetchCourts, fetchBookingsForDate]);

    // Force-refresh: invalidate cache for current date and re-fetch
    const refresh = useCallback(async () => {
        delete bookingsCache[dateStr];
        await fetchData();
    }, [dateStr, fetchData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Prefetch adjacent dates in background (yesterday, tomorrow, day after tomorrow)
    useEffect(() => {
        const prefetch = async () => {
            const courtsData = courtsRef.current;
            if (courtsData.length === 0) return;
            const base = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr;
            const offsets = [-1, 1, 2];
            for (const offset of offsets) {
                const d = new Date(base);
                d.setDate(d.getDate() + offset);
                const ds = toDateStr(d);
                if (!bookingsCache[ds] || Date.now() - bookingsCache[ds].ts >= CACHE_TTL) {
                    try {
                        const query = clubId ? `/bookings?date=${ds}&club_id=${clubId}` : `/bookings?date=${ds}`;
                        const [bRes, schoolSlots] = await Promise.all([
                          apiFetchWithAuth<any>(query),
                          clubId ? schoolCoursesService.slots(clubId, ds) : Promise.resolve([]),
                        ]);
                        const schoolAsBookings = schoolSlots.map((slot) => ({
                          id: `school-slot-${slot.id}`,
                          court_id: slot.court_id,
                          start_at: `${ds}T${slot.start_time}:00Z`,
                          end_at: `${ds}T${slot.end_time}:00Z`,
                          status: 'confirmed',
                          reservation_type: 'school_course',
                          source_channel: 'system',
                          notes: `${slot.course_name}${slot.staff_name ? ` - ${slot.staff_name}` : ''}`,
                          players: { first_name: 'Curso', last_name: slot.course_name },
                        }));
                        bookingsCache[ds] = { data: [...(bRes.bookings || []), ...schoolAsBookings], ts: Date.now() };
                    } catch { /* silent prefetch */ }
                }
            }
        };
        // Prefetch after a short delay so it doesn't block the current date load
        const timer = setTimeout(prefetch, 300);
        return () => clearTimeout(timer);
    }, [dateStr, dateOrStr, clubId]);

    return { courts, reservations, loading, refresh, clubId };
};

// Pure mapping function — no network calls
function mapBookings(rawBookings: any[], courtsData: Court[]): Reservation[] {
    const courtMap = new Map(courtsData.map(c => [c.id, c.name]));
    return rawBookings.map((b: any) => {
        const start = new Date(b.start_at);
        const organizer = b.players;
        const playerName = organizer ? `${organizer.first_name} ${organizer.last_name}` : '';
        return {
            id: b.id,
            courtId: b.court_id,
            courtName: courtMap.get(b.court_id) || b.court_id,
            startTime: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            durationMinutes: (new Date(b.end_at).getTime() - start.getTime()) / 60000,
            playerName,
            status: b.status ?? 'pending_payment',
            booking_type: b.reservation_type ?? b.booking_type ?? 'standard',
            source_channel: b.source_channel ?? 'manual',
            notes: b.notes ?? undefined,
            locationId: 'sede-central',
            totalPrice: b.total_price_cents != null ? b.total_price_cents / 100 : undefined,
        };
    });
}


const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const formatDate = (date: Date) => {
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
};

const formatDateForInput = (date: Date) => {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
};

// Custom scrollbars for the zoom library
const ZoomScrollbars = () => {
  const [transform, setTransform] = useState({ scale: 1, positionX: 0, positionY: 0 });

  useTransformEffect(({ state }) => {
    setTransform({
      scale: state.scale,
      positionX: state.positionX,
      positionY: state.positionY
    });
  });

  const { scale, positionX, positionY } = transform;

  // Don't show scrollbars if not zoomed in (adding a tiny tolerance for floating point errors)
  if (scale <= 1.01) return null;

  // We estimate content size by multiplying wrapper size by scale
  // The amount we can pan is (scale - 1) * wrapperSize
  // The thumb size is proportional to how much is visible (1 / scale)
  const thumbSizePct = Math.max(10, (1 / scale) * 100);

  // Position is bounded from 0 to negative bounds. Mapped from 0 to 1
  const maxX = (scale - 1) * window.innerWidth;
  const maxY = (scale - 1) * window.innerHeight;

  // Calculate percentage scrolled
  const scrollXPct = maxX > 0 ? Math.min(1, Math.max(0, Math.abs(positionX) / maxX)) : 0;
  const scrollYPct = maxY > 0 ? Math.min(1, Math.max(0, Math.abs(positionY) / maxY)) : 0;

  // Move the thumb by the scroll percentage of the REMAINING space (100% - thumbSizePct)
  const thumbLeft = scrollXPct * (100 - thumbSizePct);
  const thumbTop = scrollYPct * (100 - thumbSizePct);

  return (
    <>
      {/* Horizontal Scrollbar */}
      <div className="absolute bottom-2 left-4 right-4 h-2.5 bg-black/10 rounded-full z-50 overflow-hidden pointer-events-none transition-opacity duration-300">
        <div
          className="absolute top-0 bottom-0 bg-black/40 rounded-full"
          style={{ width: `${thumbSizePct}%`, left: `${thumbLeft}%` }}
        />
      </div>

      {/* Vertical Scrollbar */}
      <div className="absolute top-4 bottom-4 right-2 w-2.5 bg-black/10 rounded-full z-50 overflow-hidden pointer-events-none transition-opacity duration-300">
        <div
          className="absolute left-0 right-0 bg-black/40 rounded-full"
          style={{ height: `${thumbSizePct}%`, top: `${thumbTop}%` }}
        />
      </div>
    </>
  );
};

function GrillaViewInner() {
  const navigate = useNavigate();
  const { t, i18n } = useGrillaTranslation();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const today = new Date(); // Always current date — recomputed each render so chips are never stale
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const dateInputRef = useRef<HTMLInputElement>(null);
  // Derive active chip from selectedDate vs today — no separate state to go stale
  const activeChip = useMemo(() => {
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const selectedMidnight = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    const diff = Math.round((selectedMidnight.getTime() - todayMidnight.getTime()) / 86400000);
    if (diff === -1) return 'yesterday';
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff === 2) return 'dayAfterTomorrow';
    return '';
  }, [today, selectedDate]);
  const { courts, reservations: serverReservations, refresh, clubId } = useClubData(selectedDate);

  // Filter courts and reservations by the active location tab
  const activeCourts = useMemo(() => {
    return courts.length > 0 ? courts : [];
  }, [courts]);

  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    setReservations(serverReservations);
    setRecentlyDroppedId(null);
  }, [serverReservations]);

  // Current time indicator — updates every minute
  const [nowMinutes, setNowMinutes] = useState<number>(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [recentlyDroppedId, setRecentlyDroppedId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('L');
  const [selectedModalReservationId, setSelectedModalReservationId] = useState<string | null>(null);
  const [selectedSchoolCourseId, setSelectedSchoolCourseId] = useState<string | null>(null);
  const [editingBookingData, setEditingBookingData] = useState<any | null>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<{ res: Reservation, el: HTMLElement } | null>(null);
  const [focusedCourtId, setFocusedCourtId] = useState<string | null>(null);

  // Ref to control the zoom-pan-pinch library programmatically
  const transformComponentRef = useRef<ReactZoomPanPinchRef | null>(null);
  const activeMobileScaleRef = useRef<number>(1);

  // Auto-detect mobile devices for the compact full view grid (<= 768px)
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(window.innerWidth <= 768);
  const mobileFullView = isMobileDevice && !focusedCourtId;

  // Dynamic pixels-per-minute for mobile full view — fits the grid into the viewport height
  const [compactPxPerMinute, setCompactPxPerMinute] = useState<number>(0.5);

  useEffect(() => {
    const computeCompactPpm = () => {
      setCompactPxPerMinute(0.30);
    };

    computeCompactPpm();
    window.addEventListener('resize', () => {
      computeCompactPpm();
      setIsMobileDevice(window.innerWidth <= 768);
    });
    // Safari iOS uses orientationchange
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        computeCompactPpm();
        setIsMobileDevice(window.innerWidth <= 768);
      }, 100);
    });

    return () => {
      window.removeEventListener('resize', computeCompactPpm);
      window.removeEventListener('orientationchange', computeCompactPpm);
    };
  }, []);

  // Day chip key-to-translation map
  const dayChipKeys = ['yesterday', 'today', 'tomorrow', 'dayAfterTomorrow'] as const;

  // Mobile uses compact labels to save space
  const dayChipLabels: Record<string, string> = {
    yesterday: isMobileDevice ? t('toolbar.yesterdayShort') || 'A' : t('toolbar.yesterday'),
    today: isMobileDevice ? t('toolbar.todayShort') || 'H' : t('toolbar.today'),
    tomorrow: isMobileDevice ? t('toolbar.tomorrowShort') || 'M' : t('toolbar.tomorrow'),
    dayAfterTomorrow: isMobileDevice ? t('toolbar.dayAfterTomorrowShort') || 'PM' : t('toolbar.dayAfterTomorrow'),
  };

  // Bad practice modal state
  const [gapWarnings, setGapWarnings] = useState<GapWarning[]>([]);
  const [pendingDrop, setPendingDrop] = useState<{ reservationId: string; courtId: string; startTime: string; status: string } | null>(null);

  // Swipe gesture state
  const [touchStart, setTouchStart] = useState<{ x: number, y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number, y: number } | null>(null);

  // Minimum swipe distance
  const minSwipeDistance = 50;

  useEffect(() => {
    // Selection logic removed as we use useClubData now
  }, [selectedDate]);

  const handleReservationClick = async (res: Reservation) => {
      if (res.booking_type === 'school_course' || res.id.startsWith('school-slot-')) {
          const raw = res.id.startsWith('school-slot-') ? res.id.replace('school-slot-', '') : '';
          const courseId = raw.split(':')[0];
          setSelectedModalReservationId(null);
          setEditingBookingData(null);
          setSelectedSchoolCourseId(courseId);
          return;
      }

      setSelectedSchoolCourseId(null);
      setSelectedModalReservationId(res.id);
      if (!res.id.startsWith('new-')) {
          try {
              const data = await apiFetch<any>(`/bookings/${res.id}`);
              if (data.ok) {
                  // Enrich with courtName from reservation state (court_id alone is not human-readable)
                  const court = courts.find(c => c.id === (data.booking.court_id ?? res.courtId));
                  setEditingBookingData({
                      ...data.booking,
                      courtName: court?.name ?? res.courtName ?? res.courtId,
                  });
              }
          } catch (err) {
              console.error('Error fetching booking details:', err);
          }
      } else {
          setEditingBookingData(null);
      }
  };

  const handleUpdateBooking = async (bookingId: string, bookingData: any) => {
      try {
          const res = await apiFetch<any>(`/bookings/${bookingId}`, {
              method: 'PUT',
              body: JSON.stringify(bookingData),
          });
          if (res.ok) {
              refresh();
          } else {
              throw new Error(res.error || 'Unknown error');
          }
      } catch (err) {
          console.error('Error updating booking:', err);
          throw err;
      }
  };

  const handleMarkPaid = async (bookingId: string) => {
    try {
      const res = await apiFetchWithAuth<any>(`/bookings/${bookingId}/mark-paid`, {
        method: 'POST',
      });
      if (res.ok) {
        refresh();
      } else {
        throw new Error(res.error || 'Error al marcar como pagado');
      }
    } catch (err) {
      console.error('Error marking paid:', err);
      throw err;
    }
  };

  const handleDeleteBooking = async (bookingId: string, _sendEmail: boolean) => {
      // Optimistic removal — remove from local state immediately
      setReservations(prev => prev.filter(r => r.id !== bookingId));
      setSelectedModalReservationId(null);
      setEditingBookingData(null);
      try {
          const res = await apiFetch<any>(`/bookings/${bookingId}`, { method: 'DELETE' });
          if (!res.ok) {
              // Revert on failure
              refresh();
              throw new Error(res.error || 'Unknown error');
          }
      } catch (err) {
          console.error('Error deleting booking:', err);
          throw err;
      }
  };

  const handleCreateBooking = async (bookingData: any) => {
      try {
          // Prepare dates (use local-time methods to avoid UTC offset shifting the day)
          const baseDate = formatDateForInput(selectedDate);
          const startAt = new Date(`${baseDate}T${bookingData.start_at}`).toISOString();
          const endAt = new Date(new Date(startAt).getTime() + bookingData.duration_minutes * 60000).toISOString();

          const payload = {
              ...bookingData,
              start_at: startAt,
              end_at: endAt,
              timezone: 'Europe/Madrid' // Or dynamic
          };

          const res = await apiFetch<any>('/bookings', {
              method: 'POST',
              body: JSON.stringify(payload)
          });

          if (res.ok) {
              await refresh(); // Refresh grid before modal closes
          } else {
              throw new Error(res.error || 'Unknown error');
          }
      } catch (err) {
          console.error('Error creating booking:', err);
          throw err;
      }
  };

  // Track active drag state for the shadow block
  const [dragState, setDragState] = useState<{ courtId: string; startTime: string; duration: number } | null>(null);
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null);

  const scale = ZoomScales[zoomLevel];

  // Custom Touch Sensor that ignores touches near the scrollable grid edges (right / bottom)
  class SmartTouchSensor extends TouchSensor {
    static activators = [
      {
        eventName: 'onTouchStart' as const,
        handler: ({ nativeEvent: event }: React.TouchEvent) => {
          if (event.touches.length > 0) {
            const touch = event.touches[0];
            const EDGE = 60; // safe zone width in px

            // Walk up the DOM tree to find the nearest scrollable ancestor
            let scrollEl: Element | null = event.target as Element;
            while (scrollEl && scrollEl !== document.body) {
              const style = window.getComputedStyle(scrollEl);
              const overflow = style.overflow + style.overflowX + style.overflowY;
              if (/auto|scroll/.test(overflow)) break;
              scrollEl = scrollEl.parentElement;
            }

            if (scrollEl && scrollEl !== document.body) {
              const rect = scrollEl.getBoundingClientRect();
              // Block drag if touch is near the right edge (vertical scrollbar track)
              // or the bottom edge (horizontal scrollbar track) of the scroll container
              if (
                touch.clientX > rect.right - EDGE ||
                touch.clientY > rect.bottom - EDGE
              ) {
                return false;
              }
            } else {
              // Fallback: use window dimensions
              if (
                touch.clientX > window.innerWidth - EDGE ||
                touch.clientY > window.innerHeight - EDGE
              ) {
                return false;
              }
            }
          }
          return true;
        },
      },
    ];
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(SmartTouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  const activeReservation = activeId
    ? reservations.find(r => r.id === activeId)
    : null;

  // Helper to validate drop (reused for ghost shadow and drop)
  const isValidDrop = (courtId: string, startTimeMin: number, duration: number, ignoreId: string) => {
    const endMin = startTimeMin + duration;
    if (startTimeMin < START_HOUR * 60 || endMin > END_HOUR * 60) return false;

    const targetReservations = reservations.filter(r => r.courtId === courtId && r.id !== ignoreId);
    let hasOverlap = false;

    for (const other of targetReservations) {
      const otherStart = parseTimeStr(other.startTime);
      const otherEnd = otherStart + other.durationMinutes;

      if (startTimeMin < otherEnd && endMin > otherStart) {
        hasOverlap = true;
        break;
      }
    }

    return !hasOverlap;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    const res = reservations.find(r => r.id === event.active.id);
    if (res) {
      setDragState({ courtId: res.courtId, startTime: res.startTime, duration: res.durationMinutes });

      // Calculate and lock the exact native width so the DragOverlay portal doesn't stretch it
      const node = document.getElementById(event.active.id as string);
      if (node) {
        setActiveCardWidth(node.offsetWidth);
      }
    }
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const { over, delta } = event;
    if (!over || !activeReservation) {
      setDragState(null);
      return;
    }

    // delta.y is in screen pixels, but the grid is scaled by CSS zoom,
    // so we need to convert screen delta to grid-space delta
    const currentScale = activeMobileScaleRef.current;
    const effectiveZoom = mobileFullView ? 0.28 * currentScale : scale;
    const currentPixels = timeToPixels(activeReservation.startTime);
    const newPixels = currentPixels + (delta.y / effectiveZoom);
    const newStartTime = pixelsToTime(newPixels);
    const startMins = parseTimeStr(newStartTime);

    if (isValidDrop(over.id as string, startMins, activeReservation.durationMinutes, activeReservation.id)) {
      setDragState({
        courtId: over.id as string,
        startTime: newStartTime,
        duration: activeReservation.durationMinutes,
      });
    } else {
      setDragState(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    setDragState(null);
    setActiveCardWidth(null);

    if (!over) return;

    const reservation = reservations.find(r => r.id === active.id);
    if (!reservation) return;
    if (reservation.id.startsWith('school-slot-')) return;

    const newCourtId = over.id as string;

    // Convert screen delta to grid-space delta (accounting for actual CSS zoom and Mobile Canvas Zoom)
    const currentScale = activeMobileScaleRef.current;
    const effectiveZoom = mobileFullView ? 0.28 * currentScale : scale;
    const currentPixels = timeToPixels(reservation.startTime);
    const newPixels = currentPixels + (delta.y / effectiveZoom);
    const newStartTime = pixelsToTime(newPixels);

    let newStatus = reservation.status;
    if (newCourtId === 'pista-virtual' && reservation.courtId !== 'pista-virtual') {
      newStatus = 'past';
    } else if (newCourtId !== 'pista-virtual' && reservation.courtId === 'pista-virtual') {
      newStatus = 'confirmed';
    }

    const newStartMin = parseTimeStr(newStartTime);

    if (!isValidDrop(newCourtId, newStartMin, reservation.durationMinutes, reservation.id)) {
      console.warn(t('grid.dropRejected'));
      return;
    }

    // Check for gap issues (anti-gap system) — only after 12:00 PM
    const gaps = detectGapIssues(newCourtId, newStartMin, reservation.durationMinutes, reservation.id);
    if (gaps.length > 0) {
      // Hold the drop pending and show the warning modal
      setPendingDrop({
        reservationId: reservation.id,
        courtId: newCourtId,
        startTime: newStartTime,
        status: newStatus
      });
      setGapWarnings(gaps);
      return;
    }

    applyDrop(reservation.id, newCourtId, newStartTime, newStatus);
  };

  // Apply a confirmed drop — updates local state immediately and persists to backend
  const applyDrop = (reservationId: string, courtId: string, startTime: string, status: string) => {
    // Capture duration before state mutation (closure captures current reservations)
    const existing = reservations.find(r => r.id === reservationId);

    setReservations(prev =>
      prev.map(r =>
        r.id === reservationId
          ? { ...r, courtId, startTime, status: status as Reservation['status'] }
          : r
      )
    );

    // Play drop sound
    try {
      const audio = new Audio(dropSoundAsset);
      audio.play().catch(err => console.log('Audio play failed:', err));
    } catch (e) {
      console.log('Audio creation failed:', e);
    }

    setRecentlyDroppedId(reservationId);
    setTimeout(() => { setRecentlyDroppedId(null); }, 1000);

    // Persist to backend only for real bookings (not temp "new-" ones)
    if (reservationId.startsWith('new-')) return;

    const durationMinutes = existing?.durationMinutes ?? 90;
    const baseDate = formatDateForInput(selectedDate); // local-time to avoid UTC offset bug
    const startAt = new Date(`${baseDate}T${startTime}`).toISOString();
    const endAt = new Date(new Date(startAt).getTime() + durationMinutes * 60000).toISOString();

    apiFetch<any>(`/bookings/${reservationId}`, {
      method: 'PUT',
      body: JSON.stringify({
        court_id: courtId,
        start_at: startAt,
        end_at: endAt,
      }),
    })
      .then(res => { if (!res.ok) { console.error('Error persisting drop:', res.error); refresh(); } })
      .catch(err => { console.error('Error persisting drop:', err); refresh(); });
  };

  // Detect if a placement creates unusable 30-min gaps after 12:00
  const detectGapIssues = (courtId: string, startMin: number, duration: number, ignoreId: string): GapWarning[] => {
    const AFTERNOON_START = 12 * 60; // 12:00 PM
    const endMin = startMin + duration;

    // Only check afternoon slots
    if (endMin <= AFTERNOON_START) return [];
    // Skip virtual court
    if (courtId === 'pista-virtual') return [];

    const warnings: GapWarning[] = [];
    const courtName = courts.find(c => c.id === courtId)?.name || courtId;

    // Get all other reservations on this court (excluding the one being moved)
    const courtReservations = reservations
      .filter(r => r.courtId === courtId && r.id !== ignoreId)
      .map(r => ({ start: parseTimeStr(r.startTime), end: parseTimeStr(r.startTime) + r.durationMinutes }))
      .sort((a, b) => a.start - b.start);

    // Add the proposed placement
    const allSlots = [...courtReservations, { start: startMin, end: endMin }].sort((a, b) => a.start - b.start);

    // Check gaps between consecutive reservations (only in afternoon)
    for (let i = 0; i < allSlots.length - 1; i++) {
      const gapStart = allSlots[i].end;
      const gapEnd = allSlots[i + 1].start;
      const gapSize = gapEnd - gapStart;

      // Only flag 30-minute gaps in the afternoon
      if (gapSize === 30 && gapStart >= AFTERNOON_START) {
        const formatMin = (m: number) => {
          const h = Math.floor(m / 60);
          const min = m % 60;
          const dh = h >= 24 ? h - 24 : h;
          return `${dh.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        };

        // Suggest aligning to remove the gap
        let suggestedTime = formatMin(startMin);
        let description = '';

        if (gapStart === startMin - 30 || gapEnd === startMin) {
          // Gap is right before our placement — move earlier to close it
          suggestedTime = formatMin(startMin - 30);
          description = t('badPractice.moveEarlierSuggestion', { time: suggestedTime });
        } else if (gapStart === endMin) {
          // Gap is right after our placement — move later to close it
          suggestedTime = formatMin(startMin + 30);
          description = t('badPractice.moveLaterSuggestion', { time: suggestedTime });
        } else {
          suggestedTime = formatMin(allSlots[i].end);
          description = t('badPractice.alignSuggestion', { time: suggestedTime });
        }

        // Verify the suggestion is valid
        const suggestedMin = parseTimeStr(suggestedTime);
        if (isValidDrop(courtId, suggestedMin, duration, ignoreId)) {
          warnings.push({
            courtName,
            gapStartTime: formatMin(gapStart),
            gapEndTime: formatMin(gapEnd),
            gapMinutes: gapSize,
            suggestedTime,
            description
          });
        }
      }
    }

    // Also check gap at start of afternoon block (from noon to first reservation)
    if (allSlots.length > 0) {
      const firstAfternoon = allSlots.find(s => s.start >= AFTERNOON_START);
      if (firstAfternoon) {
        // Check gap between noon boundary and first reservation
        const prevSlot = allSlots.filter(s => s.end <= firstAfternoon.start).pop();
        const _blockStart = prevSlot ? prevSlot.end : AFTERNOON_START;
        const _gapSize = firstAfternoon.start - _blockStart;
        if (_gapSize === 30 && _blockStart >= AFTERNOON_START) {
          // Already covered by the loop above
        }
      }
    }

    return warnings;
  };

  // Handle modal actions
  const handleAcceptBadPractice = () => {
    if (pendingDrop) {
      applyDrop(pendingDrop.reservationId, pendingDrop.courtId, pendingDrop.startTime, pendingDrop.status);
    }
    setPendingDrop(null);
    setGapWarnings([]);
  };

  const handleMoveToBetter = (suggestedTime: string) => {
    if (pendingDrop) {
      applyDrop(pendingDrop.reservationId, pendingDrop.courtId, suggestedTime, pendingDrop.status);
    }
    setPendingDrop(null);
    setGapWarnings([]);
  };

  const handleCloseBadPractice = () => {
    // Don't apply the drop — just dismiss
    setPendingDrop(null);
    setGapWarnings([]);
  };

  // Compute the native (unscaled) grid height so we can set the scroll container size
  const nativeGridHeight = useMemo(() => {
    const totalMinutes = (END_HOUR - START_HOUR) * 60;
    return totalMinutes * PIXELS_PER_MINUTE + 28; // +28 header (h-7), no extra margin
  }, []);



  // Navigation handlers for single court view
  const handleNextCourt = () => {
    if (!focusedCourtId) return;
    const currentIndex = activeCourts.findIndex(c => c.id === focusedCourtId);
    if (currentIndex < activeCourts.length - 1) {
      setFocusedCourtId(activeCourts[currentIndex + 1].id);
    }
  };

  const handlePrevCourt = () => {
    if (!focusedCourtId) return;
    const currentIndex = activeCourts.findIndex(c => c.id === focusedCourtId);
    if (currentIndex > 0) {
      setFocusedCourtId(activeCourts[currentIndex - 1].id);
    }
  };

  const visibleCourts = useMemo(() => {
    if (!focusedCourtId) return activeCourts;

    const currentIndex = activeCourts.findIndex(c => c.id === focusedCourtId);
    let startIndex = Math.max(0, currentIndex - 1);

    if (startIndex + 3 > activeCourts.length) {
      startIndex = Math.max(0, activeCourts.length - 3);
    }

    return activeCourts.slice(startIndex, startIndex + 3);
  }, [focusedCourtId, activeCourts]);

  const isFirstCourt = focusedCourtId === activeCourts[0]?.id;
  const isLastCourt = focusedCourtId === activeCourts[activeCourts.length - 1]?.id;

  // Swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;

    // Check if the swipe is mostly horizontal
    if (Math.abs(distanceX) > Math.abs(distanceY) * 1.5) {
      const isLeftSwipe = distanceX > minSwipeDistance;
      const isRightSwipe = distanceX < -minSwipeDistance;

      if (isLeftSwipe && focusedCourtId && !isLastCourt) {
        handleNextCourt();
      }
      if (isRightSwipe && focusedCourtId && !isFirstCourt) {
        handlePrevCourt();
      }
    }
  };

  const handleLogout = () => {
    authService.logout();
    navigate('/login', { replace: true });
  };

  return (
    <ZoomContext.Provider value={{ zoomLevel, scale, setZoomLevel }}>
      <div className="h-[100dvh] flex flex-col bg-gray-100 font-sans overflow-x-hidden overflow-y-auto landscape:overflow-y-auto">
        {/* ── Top Header ── */}
        {!isMobileDevice && (
          <header className="bg-[#00726b] px-4 md:px-6 py-1.5 md:py-2 z-50 flex-shrink-0 flex justify-between items-center border-b border-[#005a4f] gap-3">
            <div className="flex items-center gap-3 md:gap-4">
              <button onClick={() => setIsMenuOpen(true)} className="w-9 h-9 md:w-10 md:h-10 bg-white/20 border border-white/30 rounded-lg flex items-center justify-center text-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-white/30 flex-shrink-0 transition-colors">
                <Menu className="w-5 h-5 md:w-5 md:h-5 text-white" />
              </button>
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white border border-white/30 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.1)] relative p-[2px]">
                <div className="w-full h-full rounded-full border border-gray-900 bg-white flex items-center justify-center">
                  <span className="font-extrabold text-[10px] sm:text-xs text-black italic tracking-tighter">X7</span>
                </div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-[13px] md:text-sm font-bold text-white leading-tight">{t('header.clubName')}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Language Selector */}
              <div className="relative">
                <button
                  onClick={() => setLangMenuOpen(prev => !prev)}
                  className="w-9 h-9 md:w-10 md:h-10 bg-white/20 border border-white/30 rounded-lg flex items-center justify-center text-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-white/30 flex-shrink-0 transition-colors"
                  title={t('header.languageLabel')}
                >
                  <Globe className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </button>
                {langMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[60] overflow-hidden min-w-[160px] animate-in fade-in slide-in-from-top-2 duration-150">
                    {(
                      [
                        ['es', 'Español 🇪🇸'],
                        ['en', 'English 🇬🇧'],
                        ['zh', '中文 🇨🇳'],
                      ] as const
                    ).map(([code, label]) => {
                      const active = i18n.language === code || i18n.language.startsWith(`${code}-`);
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => {
                            void i18n.changeLanguage(code);
                            setLangMenuOpen(false);
                          }}
                          className={clsx(
                            'w-full text-left px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2',
                            active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                          )}
                        >
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="bg-[#1f1f1f] hover:bg-black text-white px-4 py-2 md:px-5 md:py-2.5 rounded-full font-medium text-xs md:text-sm flex items-center gap-2 transition-colors flex-shrink-0 shadow-sm"
              >
                <ArrowLeft className="w-4 h-4 md:w-4.5 md:h-4.5" />
                <span className="hidden sm:inline">{t('header.close')}</span>
              </button>
            </div>
          </header>
        )}

        {/* ── Single Court View Navigation (Conditionally Rendered) ── */}
        {focusedCourtId && (
          <div className="bg-blue-50/80 backdrop-blur-sm px-4 py-2 flex items-center justify-between border-b border-blue-100 shadow-sm z-30 shrink-0 sticky top-0 transition-all duration-300">
            <button
              onClick={handlePrevCourt}
              disabled={isFirstCourt}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-sm transition-colors",
                isFirstCourt ? "text-gray-400 cursor-not-allowed opacity-50" : "text-blue-700 hover:bg-blue-100 active:bg-blue-200"
              )}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{t('navigation.previous')}</span>
            </button>

            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-blue-800 uppercase tracking-widest leading-none mb-0.5">{t('navigation.singleView')}</span>
              <span className="text-sm md:text-base font-bold text-gray-900 leading-none">
                {courts.find(c => c.id === focusedCourtId)?.name}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleNextCourt}
                disabled={isLastCourt}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-sm transition-colors",
                  isLastCourt ? "text-gray-400 cursor-not-allowed opacity-50" : "text-blue-700 hover:bg-blue-100 active:bg-blue-200"
                )}
              >
                <span className="hidden sm:inline">{t('navigation.next')}</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>

              <div className="w-px h-6 bg-blue-200 mx-1 hidden sm:block"></div>

              <button
                onClick={() => setFocusedCourtId(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm ml-1"
              >
                <X className="w-4 h-4 sm:hidden" />
                <span className="hidden sm:inline">{t('navigation.backToGrid')}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Grid Area ── */}
        <main className="flex-1 overflow-hidden flex flex-col min-h-0 relative z-0 bg-white">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToWindowEdges]}
          >
            <div className="flex-1 bg-white overflow-hidden flex flex-col relative min-h-0">
              {/* Scrollable area */}
              <div className={clsx("flex-1 overflow-auto relative", activeId && "dragging-active")}>

                {/* ── Integrated Toolbar – scrolls with grid ── */}
                {(
                  <div className="bg-[#f8f8f8] border-b border-gray-200 px-4 md:px-8 py-2 mb-3">
                    {/* Heading row with mobile hamburger */}
                    <div className="flex items-center gap-2 mb-1.5">
                      {isMobileDevice && (
                        <button className="flex items-center justify-center w-8 h-8 bg-white border border-gray-200 rounded text-gray-700 hover:bg-gray-50 flex-shrink-0 transition-colors">
                          <Menu className="w-4 h-4 text-gray-600" />
                        </button>
                      )}
                      <h2 className="text-xs md:text-sm font-semibold text-[#003366] capitalize">
                      {`${t('toolbar.reservationsOf')} ${selectedDate.toLocaleDateString(calendarLocale(i18n.language), { weekday: 'long' })}, ${selectedDate.toLocaleDateString(calendarLocale(i18n.language), { day: 'numeric', month: 'long', year: 'numeric' })}`}
                    </h2>
                    </div>
                    {/* Controls row */}
                    <div className="flex flex-wrap items-center gap-1 md:gap-2">
                      <span className="text-[10px] font-medium text-gray-500 flex-shrink-0 mr-1">{t('toolbar.dateLabel')}</span>

                      {/* date picker group */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                          className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px] text-gray-700 hover:bg-gray-50 transition-colors"
                          title={t('toolbar.prevDayTitle')}
                        >{t('toolbar.prevDay')}</button>

                        <div className="relative">
                          <button
                            onClick={() => { try { dateInputRef.current?.showPicker(); } catch { dateInputRef.current?.focus(); } }}
                            className="flex items-center gap-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-medium text-[#003366] hover:bg-gray-50 transition-colors"
                          >
                            {formatDate(selectedDate)}
                            <Calendar className="w-2.5 h-2.5 text-gray-400" />
                          </button>
                          <input
                            ref={dateInputRef}
                            type="date"
                            className="absolute bottom-0 left-0 w-full h-[1px] opacity-0 cursor-pointer pointer-events-none"
                            value={formatDateForInput(selectedDate)}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const [y, mo, d] = e.target.value.split('-');
                              const parsed = new Date(Number(y), Number(mo) - 1, Number(d));
                              setSelectedDate(parsed);
                            }}
                          />
                        </div>

                        {/* Día + — next to date picker */}
                        <button
                          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                          className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px] text-gray-700 hover:bg-gray-50 transition-colors"
                          title={t('toolbar.nextDayTitle')}
                        >{t('toolbar.nextDay')}</button>
                      </div>

                      <span className="text-gray-300 select-none">|</span>

                      {/* Day chips */}
                      {dayChipKeys.map((dayKey, index) => (
                        <React.Fragment key={dayKey}>
                          <button
                            onClick={() => {
                              switch (dayKey) {
                                case 'yesterday': setSelectedDate(addDays(today, -1)); break;
                                case 'today': setSelectedDate(today); break;
                                case 'tomorrow': setSelectedDate(addDays(today, 1)); break;
                                case 'dayAfterTomorrow': setSelectedDate(addDays(today, 2)); break;
                              }
                            }}
                            className={clsx(
                              "px-1.5 py-0.5 rounded text-[10px] transition-all whitespace-nowrap flex-shrink-0 border",
                              dayKey === activeChip
                                ? "bg-[#e53e3e] text-white border-[#e53e3e] font-bold"
                                : "bg-[#097560] text-white border-[#097560] hover:bg-[#0b8b72] font-normal"
                            )}
                          >{dayChipLabels[dayKey]}</button>
                          {index < dayChipKeys.length - 1 && (
                            <span className="text-gray-300 select-none hidden sm:inline">|</span>
                          )}
                        </React.Fragment>
                      ))}


                      {/* Print */}
                      {!isMobileDevice && (
                        <button className="flex items-center gap-1 px-1.5 py-0.5 bg-[#097560] text-white border border-[#097560] rounded text-[10px] hover:bg-[#0b8b72] transition-colors">
                          <Printer className="w-3 h-3" />
                          <span>{t('toolbar.print')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {mobileFullView ? (
                  <>
                  <TransformWrapper
                    ref={transformComponentRef}
                    initialScale={1}
                    minScale={0.5}
                    maxScale={3}
                    centerOnInit={false}
                    wheel={{ wheelDisabled: true }}
                    doubleClick={{ disabled: true }}
                    panning={{ disabled: activeId !== null }}
                    pinch={{ disabled: activeId !== null }}
                    limitToBounds={false}
                    alignmentAnimation={{ disabled: true }}
                    onTransformed={(_ref, state) => {
                      activeMobileScaleRef.current = state.scale;
                    }}
                  >
                    <ZoomScrollbars />
                    <TransformComponent
                      wrapperStyle={{ width: '100%', height: '100%' }}
                      contentStyle={{ width: '100%', height: '100%' }}
                    >
                      {/* Render the same desktop grid, scaled to fit mobile */}
                      <div
                        style={{ height: `${nativeGridHeight}px`, zoom: 0.28 }}
                        className={clsx(
                          "flex relative pl-2",
                          focusedCourtId && !activeId && "touch-pan-y"
                        )}
                        onTouchStart={focusedCourtId && !activeId ? onTouchStart : undefined}
                        onTouchMove={focusedCourtId && !activeId ? onTouchMove : undefined}
                        onTouchEnd={focusedCourtId && !activeId ? onTouchEnd : undefined}
                      >
                        <TimeAxis position="left" isCompact={false} />

                        <div className="flex relative z-10 mb-0">
                          <GridBackground />
                          {/* Current time red line — only shown when viewing today */}
                          {activeChip === 'today' && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60 && (() => {
                            const topPx = 22 + (nowMinutes - START_HOUR * 60) * PIXELS_PER_MINUTE;
                            return (
                              <div
                                className="absolute left-0 right-0 z-30 pointer-events-none"
                                style={{ top: topPx }}
                              >
                                {/* Past overlay */}
                                <div
                                  className="absolute left-0 right-0 bg-red-500/5 pointer-events-none"
                                  style={{ bottom: 0, top: -(topPx - 22) }}
                                />
                                {/* Red line */}
                                <div className="w-full h-[2px] bg-red-500 relative">
                                  {/* Circle dot on left */}
                                  <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
                                </div>
                              </div>
                            );
                          })()}
                          {visibleCourts.map(court => (
                            <CourtColumn
                              key={`col-${court.id}-${focusedCourtId}`}
                              court={court}
                              reservations={reservations.filter(r => r.courtId === court.id)}
                              dragGhost={dragState?.courtId === court.id ? dragState : undefined}
                              recentlyDroppedId={recentlyDroppedId}
                              onReservationClick={handleReservationClick}
                              onFreeSlotClick={(courtId, courtName, timeStr, isDisabled) => {
                                if (isDisabled) return;
                                const newId = `new-${Date.now()}`;
                                setReservations(prev => [...prev, {
                                  id: newId, courtId, courtName,
                                  startTime: timeStr, durationMinutes: 90,
                                  playerName: '', status: 'available', booking_type: 'standard',
                                }]);
                                setSelectedModalReservationId(newId);
                              }}
                              onHeaderClick={(courtId) => {
                                setFocusedCourtId(courtId);
                              }}
                              isFocusedMode={focusedCourtId !== null}
                              isCurrentlyFocused={court.id === focusedCourtId}
                              isCompactView={false}
                              totalCourts={activeCourts.length}
                            />
                          ))}
                        </div>

                        <TimeAxis position="right" isCompact={false} />
                      </div>
                    </TransformComponent>
                  </TransformWrapper>
                  </>
                ) : (
                  <div
                    style={{
                      height: `${nativeGridHeight}px`,
                      zoom: scale,
                      // Fallback para navs muy antiguos (transform rompe position: sticky)
                      ...(typeof CSS !== 'undefined' && CSS.supports && !CSS.supports('zoom', '1') ? {
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                        width: `${100 / scale}%`
                      } : {})
                    }}
                    className={clsx(
                      "flex relative pl-4 md:pl-8",
                      focusedCourtId && !activeId && "touch-pan-y"
                    )}
                    onTouchStart={focusedCourtId && !activeId ? onTouchStart : undefined}
                    onTouchMove={focusedCourtId && !activeId ? onTouchMove : undefined}
                    onTouchEnd={focusedCourtId && !activeId ? onTouchEnd : undefined}
                  >
                    <TimeAxis position="left" isCompact={false} />

                    <div className="flex relative z-10 mb-0">
                      <GridBackground />
                      {visibleCourts.map(court => (
                        <CourtColumn
                          key={`col-${court.id}-${focusedCourtId}`}
                          court={court}
                          reservations={reservations.filter(r => r.courtId === court.id)}
                          dragGhost={dragState?.courtId === court.id ? dragState : undefined}
                          recentlyDroppedId={recentlyDroppedId}
                          onReservationClick={handleReservationClick}
                          onFreeSlotClick={(courtId, courtName, timeStr, isDisabled) => {
                            if (isDisabled) return;
                            const newId = `new-${Date.now()}`;
                            setReservations(prev => [...prev, {
                              id: newId, courtId, courtName,
                              startTime: timeStr, durationMinutes: 90,
                              playerName: '', status: 'available', booking_type: 'standard',
                            }]);
                            setSelectedModalReservationId(newId);
                          }}
                          onHeaderClick={(courtId) => {
                            setFocusedCourtId(courtId);
                          }}
                          isFocusedMode={focusedCourtId !== null}
                          isCurrentlyFocused={court.id === focusedCourtId}
                          isCompactView={false}
                          totalCourts={activeCourts.length}
                          onHoverStart={(res, el) => setHoveredTooltip({ res, el })}
                          onHoverEnd={() => setHoveredTooltip(null)}
                        />
                      ))}
                    </div>

                    <TimeAxis position="right" isCompact={false} />
                  </div>
                )}
              </div>
            </div>

            <DragOverlay dropAnimation={null}>
              {activeReservation ? (
                <div style={
                  mobileFullView 
                    ? { transform: `scale(${activeMobileScaleRef.current})`, transformOrigin: 'top left', width: activeCardWidth || undefined } 
                    : { zoom: scale, width: activeCardWidth || undefined }
                }>
                  <ReservationCard
                    reservation={activeReservation}
                    isOverlay
                    compactPxPerMinute={mobileFullView ? compactPxPerMinute : undefined}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>

        <ReservationModal
          clubId={clubId}
          isOpen={selectedModalReservationId !== null}
          onClose={() => {
            // If the reservation was never saved (temp id), remove it from state
            if (selectedModalReservationId?.startsWith('new-')) {
              setReservations(prev => prev.filter(r => r.id !== selectedModalReservationId));
            }
            setSelectedModalReservationId(null);
            setEditingBookingData(null);
          }}
          reservation={reservations.find(r => r.id === selectedModalReservationId) || null}
          onSave={handleCreateBooking}
          editingBookingData={editingBookingData}
          onUpdate={handleUpdateBooking}
          onDelete={handleDeleteBooking}
          onMarkPaid={handleMarkPaid}
        />

        <SchoolCourseModal
          isOpen={selectedSchoolCourseId !== null}
          courseId={selectedSchoolCourseId}
          onClose={() => setSelectedSchoolCourseId(null)}
        />

        <BadPracticeModal
          isOpen={gapWarnings.length > 0}
          onClose={handleCloseBadPractice}
          onAcceptAnyway={handleAcceptBadPractice}
          onMoveToBetter={handleMoveToBetter}
          warnings={gapWarnings}
        />
      {/* Custom Tooltip */}
      <HoverTooltip
        reservation={hoveredTooltip?.res || null}
        anchorElement={hoveredTooltip?.el || null}
      />
      </div>
      <MainMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} clubName="" />
    </ZoomContext.Provider>
  );
}

export default function GrillaView() {
  return <GrillaViewInner />;
}
