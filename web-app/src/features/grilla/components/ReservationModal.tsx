import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { CreateBookingBatchResult } from '../types';
import type { Reservation, PaymentMethod } from '../types';
import {
    X,
    Search,
    Trash2,
    AlertTriangle,
    UserPlus,
    Wallet,
    AlertCircle,
    EyeOff,
    Eye,
    MessageSquare,
    Send,
    Link2,
    Copy,
} from 'lucide-react';
import { useVisualViewportFix } from '../hooks/useVisualViewportFix';
import { playerService } from '../../../services/player';
import { apiFetchWithAuth } from '../../../services/api';
import { clubIanaTimeZone, zonedTimeToUtc, formatTimeHHmmInClubTz, dayKeyInClubTz, validateBookingSlotWithinClubHours } from '../../../lib/clubTimeZone';
import { clubChatsService } from '../../../services/clubChats';
import { authService } from '../../../services/auth';
import { useCashSessionActive } from '../../../hooks/useCashSessionActive';
import { copyTextToClipboard } from '../../../lib/copyTextToClipboard';

function clubSlotToUtcIso(dateBase: string, hour: string, minute: string): string {
    return zonedTimeToUtc(`${dateBase}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`).toISOString();
}
import { reservationTypePricesService, type ReservationTypeConfig } from '../../../services/reservationTypePrices';
import type { Player } from '../../../types/api';
import { useGrillaTranslation } from '../i18n/useGrillaTranslation';
import { calendarLocale } from '../i18n/calendarLocale';
import { TournamentGridBookingEditor } from './TournamentGridBookingEditor';
import { CashRefundModal, type CashRefundConfirmPayload } from './CashRefundModal';
import { WEEKDAY_CHIPS } from '../utils/recurrenceDates';
import { resolveJoinedPlayer } from '../utils/bookingDisplay';
import { formatPlayerLabel, formatPlayerSubline } from '../../../lib/playerLabel';
import { formatLevelSelectValue, LEVEL_OPTIONS } from '../utils/openMatchLevel';
import { willPublicOpenMatchStayOffGrid } from '../utils/reservationListFilters';
import { PaymentSlot, defaultSlotPayment, type SlotPayment } from './PaymentSlot';
import { countBookingPlayers, shareCentsPerPlayer } from '../utils/moneyInput';
import { MaintenanceCancelScopeModal, type MaintenanceCancelScope } from './MaintenanceCancelScopeModal';
import { findRelatedMaintenanceBookings, isMaintenanceReservation } from '../utils/gridSelectUtils';
import { isOpenMatchType, normalizeReservationTypeSlug } from '../utils/reservationTypeSlug';
import { buildMatchShareTextFromBooking } from '../utils/matchShareText';
import {
    durationOptionsForReservationType,
    resolveBookingDurationMinutes,
} from '../utils/bookingDuration';
import { existingBookingBlocksOverlapEdit, hasBookingScheduleChanged, timeRangesOverlap } from '../utils/bookingOverlap';

const PLAY_MODE_MARKER = '__PLAY_MODE__';

function portalModal(node: React.ReactNode): React.ReactNode {
    if (typeof document === 'undefined') return null;
    return createPortal(node, document.body);
}

function extractPlayMode(rawNotes: string | null | undefined): { mode: 'single' | 'double'; cleanNotes: string } {
    const src = String(rawNotes ?? '');
    const parts = src
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    let mode: 'single' | 'double' = 'double';
    const clean = parts.filter((line) => {
        if (!line.startsWith(`${PLAY_MODE_MARKER}:`)) return true;
        const value = line.slice(`${PLAY_MODE_MARKER}:`.length).trim().toLowerCase();
        mode = value === 'single' ? 'single' : 'double';
        return false;
    });
    return { mode, cleanNotes: clean.join('\n') };
}

function composeNotesWithPlayMode(rawNotes: string, mode: 'single' | 'double'): string {
    const clean = extractPlayMode(rawNotes).cleanNotes;
    return [clean, `${PLAY_MODE_MARKER}:${mode}`].filter(Boolean).join('\n');
}

function normalizePlayerElo(raw: unknown): number | null {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 7) return null;
    return Math.round(n * 10) / 10;
}

function collectAssignedElos(organizer: Player | null, additional: (Player | null)[]): number[] {
    return [organizer, ...additional]
        .filter((p): p is Player => !!p)
        .map((p) => normalizePlayerElo(p.elo_rating))
        .filter((n): n is number => n != null);
}

interface ReservationModalProps {
    clubId?: string | null;
    isOpen: boolean;
    onClose: () => void;
    reservation: Reservation | null;
    onSave?: (bookingData: any) => Promise<CreateBookingBatchResult | void>;
    editingBookingData?: any | null;
    onUpdate?: (bookingId: string, data: any) => Promise<void>;
    onDelete?: (
        bookingId: string,
        sendEmail: boolean,
        cashRefunds?: Record<string, 'cash_hand' | 'wallet'>,
        applyRefund?: boolean,
        refundPercent?: number,
    ) => Promise<void>;
    onMarkPaid?: (bookingId: string) => Promise<void>;
    onMoveToHidden?: (bookingId: string) => Promise<void>;
    onMoveToVisible?: (bookingId: string) => Promise<void>;
    isOnHiddenCourt?: boolean;
    onGridRefresh?: () => void;
    isLoadingBookingData?: boolean;
    /** Fecha visible en la grilla (YYYY-MM-DD), para reservas múltiples y etiqueta en alta. */
    gridDate?: string;
    weeklySchedule?: unknown;
    /** Reservas visibles en la grilla (para cancelar mantenimientos en bloque). */
    gridReservations?: Reservation[];
    onCancelMaintenance?: (bookingIds: string[]) => Promise<void>;
    /** Pestaña inicial al abrir (p. ej. chat desde lista de partidos). */
    initialTab?: 'details' | 'chat';
}

// Helper: Player Search Component
export const PlayerSearch: React.FC<{
    label: string;
    placeholder: string;
    onSelect: (player: Player | null) => void;
    selectedPlayer: Player | null;
    required?: boolean;
}> = ({ label, placeholder, onSelect, selectedPlayer, required }) => {
    const { t } = useGrillaTranslation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Player[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Alta de jugador state
    const [altaOpen, setAltaOpen] = useState(false);
    const [altaSubmitting, setAltaSubmitting] = useState(false);
    const [altaError, setAltaError] = useState('');
    const [altaForm, setAltaForm] = useState({ first_name: '', last_name: '', phone: '', email: '', username: '' });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setIsSearching(true);
            try {
                const players = await playerService.getAll(query);
                setResults(players);
                setShowResults(true);
            } catch (err) {
                console.error('Error searching players:', err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [query]);

    const handleAltaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { first_name, last_name, phone, email } = altaForm;
        if (!first_name.trim() || !last_name.trim() || !phone.trim()) {
            setAltaError(t('playerSearch.coreFieldsRequired'));
            return;
        }
        setAltaSubmitting(true);
        setAltaError('');
        try {
            const emailTrim = email.trim();
            const usernameTrim = altaForm.username.trim().toLowerCase();
            const newPlayer = await playerService.createManual({
                first_name: first_name.trim(),
                last_name: last_name.trim(),
                phone: phone.trim(),
                email: emailTrim || undefined,
                username: usernameTrim || undefined,
            });
            onSelect(newPlayer);
            setAltaOpen(false);
            setAltaForm({ first_name: '', last_name: '', phone: '', email: '', username: '' });
        } catch (err: unknown) {
            const msg =
                err && typeof err === 'object' && 'message' in err
                    ? String((err as { message: string }).message)
                    : t('playerSearch.manualAddError');
            setAltaError(msg);
        } finally {
            setAltaSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-1.5" ref={containerRef}>
            <label className="text-sm font-bold text-gray-700 flex items-center gap-1">
                {label}{required && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
                {selectedPlayer ? (
                    <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                                {selectedPlayer.first_name[0]}{selectedPlayer.last_name[0]}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">
                                    {`${selectedPlayer.first_name ?? ''} ${selectedPlayer.last_name ?? ''}`.trim() || formatPlayerLabel(selectedPlayer)}
                                </p>
                                <div className="flex flex-col text-[10px] text-gray-500 mt-0.5">
                                    {selectedPlayer.username?.trim() && (
                                        <span className="truncate">@{selectedPlayer.username.trim()}</span>
                                    )}
                                    {selectedPlayer.email?.trim() && (
                                        <span className="truncate">{selectedPlayer.email.trim()}</span>
                                    )}
                                    {selectedPlayer.phone?.trim() && (
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void navigator.clipboard.writeText(selectedPlayer.phone!.trim());
                                                toast.success('Teléfono copiado');
                                            }}
                                            className="inline-flex items-center gap-1 cursor-pointer hover:text-blue-600 transition-colors group/phone font-medium w-fit"
                                            title="Copiar teléfono"
                                        >
                                            <span>{selectedPlayer.phone.trim()}</span>
                                            <Copy className="w-3 h-3 text-gray-400 opacity-0 group-hover/phone:opacity-100 transition-opacity" />
                                        </span>
                                    )}
                                    {!selectedPlayer.username?.trim() && !selectedPlayer.email?.trim() && !selectedPlayer.phone?.trim() && (
                                        <span className="truncate">
                                            {t('playerSearch.noContactLine')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => { onSelect(null); setQuery(''); }}
                            className="p-1 hover:bg-blue-100 rounded-full text-blue-600"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex gap-1.5">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full p-2.5 pr-10 bg-white border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-[#006A6A] focus:border-transparent outline-none transition-all"
                                    onFocus={() => query.trim() && setShowResults(true)}
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                                    onClick={async () => {
                                        setIsSearching(true);
                                        try {
                                            const players = await playerService.getAll(query.trim() || undefined);
                                            setResults(players);
                                            setShowResults(true);
                                        } catch (err) {
                                            console.error('Error fetching players:', err);
                                        } finally {
                                            setIsSearching(false);
                                        }
                                    }}
                                >
                                    <Search size={18} className="text-[#006A6A] hover:text-[#005151]" />
                                </button>
                            </div>
                            <button
                                type="button"
                                title={t('playerSearch.addPlayerTooltip')}
                                onClick={() => { setAltaOpen(true); setAltaError(''); }}
                                className="flex items-center justify-center w-10 h-10 rounded-md bg-portal-header hover:bg-portal-header-edge text-white transition-colors shrink-0"
                            >
                                <UserPlus size={16} />
                            </button>
                        </div>
                        {showResults && results.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto overflow-x-hidden">
                                {results.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => {
                                            onSelect(p);
                                            setShowResults(false);
                                        }}
                                        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                                            {p.first_name[0]}{p.last_name[0]}
                                        </div>
                                        <div className="min-w-0 flex-1 truncate">
                                            <p className="text-sm font-bold text-gray-900 truncate">
                                                {`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || formatPlayerLabel(p)}
                                            </p>
                                            <p className="text-[11px] text-gray-500 truncate">
                                                {p.username?.trim()
                                                    ? `@${p.username.trim()}`
                                                    : (formatPlayerSubline(p) || t('playerSearch.noContactLine'))}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                        {showResults && results.length === 0 && query.trim() && !isSearching && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-center">
                                <p className="text-sm text-gray-500">{t('playerSearch.noPlayersFound')}</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal Alta de Jugador */}
            {altaOpen && (
                <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAltaOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-gray-900">{t('playerSearch.manualAddTitle')}</h3>
                            <button onClick={() => setAltaOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleAltaSubmit} className="flex flex-col gap-3">
                            <p className="text-[11px] text-gray-500">{t('playerSearch.manualAddHint')}</p>
                            {(['first_name', 'last_name', 'phone', 'username', 'email'] as const).map((field) => (
                                <div key={field}>
                                    {(field === 'email' || field === 'username') && (
                                        <span className="text-[10px] text-gray-400 block mb-0.5">
                                            {field === 'email' ? t('playerSearch.emailOptional') : 'Usuario (opcional)'}
                                        </span>
                                    )}
                                    <input
                                        type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                                        placeholder={
                                            {
                                                first_name: t('playerSearch.namePh'),
                                                last_name: t('playerSearch.lastNamePh'),
                                                phone: t('playerSearch.phonePh'),
                                                username: 'tu_usuario',
                                                email: t('playerSearch.emailPh'),
                                            }[field]
                                        }
                                        value={altaForm[field]}
                                        onChange={(e) =>
                                            setAltaForm((prev) => ({
                                                ...prev,
                                                [field]:
                                                    field === 'username'
                                                        ? e.target.value.replace(/\s/g, '').toLowerCase()
                                                        : e.target.value,
                                            }))
                                        }
                                        className="w-full p-2.5 bg-white border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-portal-header focus:border-transparent outline-none"
                                    />
                                </div>
                            ))}
                            {altaError && <p className="text-xs text-red-500">{altaError}</p>}
                            <button
                                type="submit"
                                disabled={altaSubmitting}
                                className="mt-1 w-full py-2.5 rounded-lg bg-portal-header hover:bg-portal-header-edge text-white text-sm font-bold transition-colors disabled:opacity-60"
                            >
                                {altaSubmitting ? t('playerSearch.submitting') : t('playerSearch.submit')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Tipos de pago por slot ───────────────────────────────────────────────────
export const ReservationModal: React.FC<ReservationModalProps> = ({
    clubId, isOpen, onClose, reservation, onSave, editingBookingData, onUpdate, onDelete, onMarkPaid, onMoveToHidden, onMoveToVisible, isOnHiddenCourt, onGridRefresh, isLoadingBookingData, gridDate, weeklySchedule, gridReservations = [], onCancelMaintenance, initialTab = 'details',
}) => {
    const vvStyle = useVisualViewportFix(isOpen);
    const { t, i18n } = useGrillaTranslation();
    const isEditMode = !!editingBookingData;
    const tournamentIdFromBooking = useMemo(() => {
        const raw = editingBookingData?.tournament_booking_links;
        const links = Array.isArray(raw) ? raw : raw ? [raw] : [];
        const tid = links[0]?.tournament_id;
        return tid ? String(tid) : null;
    }, [editingBookingData]);

    // Form States
    const [organizer, setOrganizer] = useState<Player | null>(null);
    const [additionalPlayers, setAdditionalPlayers] = useState<(Player | null)[]>([null, null, null]);
    const [duration, setDuration] = useState(90);
    const [resType, setResType] = useState<string>('standard');
    const [eloMinFilter, setEloMinFilter] = useState('');
    const [eloMaxFilter, setEloMaxFilter] = useState('');
    const [notes, setNotes] = useState('');
    const [confirmEmail, setConfirmEmail] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [startHour, setStartHour] = useState('08');
    const [startMinute, setStartMinute] = useState('00');
    const [bookingDate, setBookingDate] = useState('');
    const [organizerError, setOrganizerError] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [sendDeleteEmail, setSendDeleteEmail] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [cashRefundOpen, setCashRefundOpen] = useState(false);
    const [maintenanceCancelScopeOpen, setMaintenanceCancelScopeOpen] = useState(false);
    const [overlapError, setOverlapError] = useState<string | null>(null);
    const [hoursError, setHoursError] = useState<string | null>(null);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [pricesByType, setPricesByType] = useState<Record<string, ReservationTypeConfig>>({});
    const [isMarkingPaid, setIsMarkingPaid] = useState(false);
    const [playMode, setPlayMode] = useState<'single' | 'double'>('double');
    const [isMovingToHidden, setIsMovingToHidden] = useState(false);
    const [moveToHiddenError, setMoveToHiddenError] = useState<string | null>(null);
    const [slotPayments, setSlotPayments] = useState<SlotPayment[]>([defaultSlotPayment(), defaultSlotPayment(), defaultSlotPayment(), defaultSlotPayment()]);
    const [isMultipleReservation, setIsMultipleReservation] = useState(false);
    const [multipleStartDate, setMultipleStartDate] = useState('');
    const [multipleEndDate, setMultipleEndDate] = useState('');
    const [multipleWeekdays, setMultipleWeekdays] = useState<number[]>([]);
    const [includeHolidaysInRecurrence, setIncludeHolidaysInRecurrence] = useState(true);
    const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
    const [courtPickCount, setCourtPickCount] = useState('2');
    const [multiCourtPickMode, setMultiCourtPickMode] = useState<'manual' | 'auto'>('manual');
    const [batchResult, setBatchResult] = useState<CreateBookingBatchResult | null>(null);
    const [availableCourtsForSlot, setAvailableCourtsForSlot] = useState<Array<{ id: string; name: string }>>([]);
    const [multiCourtTotalCents, setMultiCourtTotalCents] = useState<number | null>(null);
    const navigate = useNavigate();
    const [courtToAdd, setCourtToAdd] = useState('');
    const { active: cashSessionActive, loading: cashSessionLoading } = useCashSessionActive(clubId);

    const [activeTab, setActiveTab] = useState<'details' | 'chat'>(initialTab);
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [loadingChat, setLoadingChat] = useState(false);
    const [chatDraft, setChatDraft] = useState('');
    const [sendingChat, setSendingChat] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [me, setMe] = useState<{ authUserId: string | null; playerId: string | null }>({ authUserId: null, playerId: null });

    const requireOpenCash = useCallback(() => {
        toast.error('Debes abrir la caja antes de cobrar turnos o usar el carrito', {
            action: {
                label: 'Abrir caja',
                onClick: () => navigate('/cierreCaja'),
            },
        });
    }, [navigate]);

    useEffect(() => {
        if (!isOpen) {
            setActiveTab('details');
            setChatMessages([]);
            setChatDraft('');
        } else {
            setActiveTab(initialTab);
            authService.getMe().then((res) => {
                setMe({
                    authUserId: res.user?.id ?? null,
                    playerId: res.roles?.player_id ?? null,
                });
            }).catch(() => {});
        }
    }, [isOpen, initialTab]);

    const loadBookingChat = useCallback(async () => {
        if (!editingBookingData?.id) return;
        setLoadingChat(true);
        try {
            const messages = await clubChatsService.listBookingChat(editingBookingData.id);
            setChatMessages(messages);
        } catch (err) {
            console.error('Error loading chat:', err);
        } finally {
            setLoadingChat(false);
        }
    }, [editingBookingData?.id]);

    useEffect(() => {
        if (activeTab === 'chat' && editingBookingData?.id) {
            void loadBookingChat();
        }
    }, [activeTab, editingBookingData?.id, loadBookingChat]);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages]);

    const handleSendChatMessage = async () => {
        if (!editingBookingData?.id || !chatDraft.trim()) return;
        setSendingChat(true);
        try {
            const newMessage = await clubChatsService.sendBookingChat(editingBookingData.id, chatDraft.trim());
            setChatMessages(prev => [...prev, newMessage]);
            setChatDraft('');
        } catch (err) {
            console.error('Error sending message:', err);
            toast.error('No se pudo enviar el mensaje.');
        } finally {
            setSendingChat(false);
        }
    };

    // ─── Helpers de pago ─────────────────────────────────────────────────────
    const fetchWalletBalance = useCallback(async (playerId: string, slotIndex: number) => {
        if (!clubId) return;
        setSlotPayments(prev => { const n = [...prev]; n[slotIndex] = { ...n[slotIndex], walletLoading: true, walletBalanceCents: null }; return n; });
        try {
            const res = await apiFetchWithAuth<any>(`/wallet/balance?player_id=${playerId}&club_id=${clubId}`);
            setSlotPayments(prev => { const n = [...prev]; n[slotIndex] = { ...n[slotIndex], walletLoading: false, walletBalanceCents: res.balance_cents ?? 0 }; return n; });
        } catch {
            setSlotPayments(prev => { const n = [...prev]; n[slotIndex] = { ...n[slotIndex], walletLoading: false }; return n; });
        }
    }, [clubId]);

    const updateSlotPayment = useCallback((slotIndex: number, patch: Partial<SlotPayment>) => {
        setSlotPayments(prev => { const n = [...prev]; n[slotIndex] = { ...n[slotIndex], ...patch }; return n; });
    }, []);
    // ─────────────────────────────────────────────────────────────────────────

    // Populate form on open
    useEffect(() => {
        if (!isOpen) {
            document.body.style.overflow = 'unset';
            return;
        }
        document.body.style.overflow = 'hidden';
        setOrganizerError(false);
        setOverlapError(null);
        setHoursError(null);
        setShowDeleteConfirm(false);
        setSendDeleteEmail(false);

        if (isEditMode && editingBookingData) {
            // Edit mode: pre-populate from existing booking
            const bd = editingBookingData;
            const start = new Date(bd.start_at);
            const [sh, sm] = formatTimeHHmmInClubTz(start).split(':');
            const dateVal = dayKeyInClubTz(start);
            const resTypeVal = normalizeReservationTypeSlug(bd.reservation_type || bd.booking_type || 'standard');
            const dur = resolveBookingDurationMinutes(start, bd.end_at, resTypeVal);
            const parsedNotes = extractPlayMode(bd.notes || '');
            setStartHour(sh);
            setStartMinute(sm);
            setBookingDate(dateVal);
            setDuration(dur);
            setNotes(parsedNotes.cleanNotes);
            setResType(resTypeVal);
            setConfirmEmail(false);

            const matchRow = Array.isArray(bd.matches) ? bd.matches[0] : bd.matches;
            setEloMinFilter(formatLevelSelectValue(matchRow?.elo_min));
            setEloMaxFilter(formatLevelSelectValue(matchRow?.elo_max));

            // Set organizer from joined players data
            const orgPlayer = resolveJoinedPlayer(bd.players);
            if (orgPlayer && bd.organizer_player_id) {
                setOrganizer({
                    id: bd.organizer_player_id,
                    first_name: orgPlayer.first_name ?? '',
                    last_name: orgPlayer.last_name ?? '',
                    email: (orgPlayer as { email?: string }).email || '',
                    phone: orgPlayer.phone || null,
                    elo_rating: normalizePlayerElo(orgPlayer.elo_rating) ?? 0,
                    status: 'active',
                    created_at: '',
                });
            } else {
                setOrganizer(null);
            }

            // Set additional players from participants (guests only)
            const guests = (bd.booking_participants || [])
                .filter((p: any) => p.role === 'guest' && p.players)
                .slice(0, 3)
                .map((p: any) => ({
                    id: p.player_id,
                    first_name: p.players.first_name,
                    last_name: p.players.last_name,
                    email: p.players.email || '',
                    phone: p.players.phone || null,
                    elo_rating: normalizePlayerElo(p.players.elo_rating) ?? 0,
                    status: 'active' as const,
                    created_at: '',
                }));
            const slots: (Player | null)[] = [null, null, null];
            guests.forEach((g: Player, i: number) => { slots[i] = g; });
            setAdditionalPlayers(slots);
            setPlayMode(isOpenMatchType(resTypeVal) ? 'double' : parsedNotes.mode);
            const initPayments: SlotPayment[] = [defaultSlotPayment(), defaultSlotPayment(), defaultSlotPayment(), defaultSlotPayment()];
            const txByPlayer = new Map<string, { paidAmountCents: number; walletAmountCents: number; paymentMethod: PaymentMethod }>();
            (bd.payment_transactions || [])
                .filter((t: any) => t.status === 'succeeded')
                .forEach((t: any) => {
                    const stripeId = typeof t.stripe_payment_intent_id === 'string' ? t.stripe_payment_intent_id : '';
                    const method = stripeId.startsWith('manual_') ? (stripeId.split('_')[1] ?? null) : 'card';
                    const pm: PaymentMethod = (method === 'cash' || method === 'card' || method === 'wallet') ? method as PaymentMethod : 'card';
                    const prev = txByPlayer.get(t.payer_player_id) ?? { paidAmountCents: 0, walletAmountCents: 0, paymentMethod: pm };
                    txByPlayer.set(t.payer_player_id, {
                        paidAmountCents: prev.paidAmountCents + (pm === 'wallet' ? 0 : (t.amount_cents ?? 0)),
                        walletAmountCents: prev.walletAmountCents + (pm === 'wallet' ? (t.amount_cents ?? 0) : 0),
                        paymentMethod: pm,
                    });
                });
            const orgTx = txByPlayer.get(bd.organizer_player_id);
            const orgBp = (bd.booking_participants || []).find((p: any) => p.player_id === bd.organizer_player_id);
            if (orgTx) {
                initPayments[0] = { ...defaultSlotPayment(), ...orgTx };
            } else if (orgBp && (orgBp.paid_amount_cents > 0 || orgBp.wallet_amount_cents > 0)) {
                initPayments[0] = { ...defaultSlotPayment(), paidAmountCents: orgBp.paid_amount_cents ?? 0, walletAmountCents: orgBp.wallet_amount_cents ?? 0, paymentMethod: orgBp.payment_method ?? 'cash' };
            } else if (orgBp?.payment_status === 'paid' && (orgBp.share_amount_cents ?? 0) > 0) {
                initPayments[0] = { ...defaultSlotPayment(), paidAmountCents: orgBp.share_amount_cents ?? 0, paymentMethod: orgBp.payment_method ?? 'card' };
            }
            (bd.booking_participants || []).filter((p: any) => p.role === 'guest').slice(0, 3).forEach((p: any, i: number) => {
                const tx = txByPlayer.get(p.player_id);
                if (tx) {
                    initPayments[i + 1] = { ...defaultSlotPayment(), ...tx };
                } else if (p.paid_amount_cents > 0 || p.wallet_amount_cents > 0) {
                    initPayments[i + 1] = { ...defaultSlotPayment(), paidAmountCents: p.paid_amount_cents ?? 0, walletAmountCents: p.wallet_amount_cents ?? 0, paymentMethod: p.payment_method ?? 'cash' };
                } else if (p.payment_status === 'paid' && (p.share_amount_cents ?? 0) > 0) {
                    initPayments[i + 1] = { ...defaultSlotPayment(), paidAmountCents: p.share_amount_cents ?? 0, paymentMethod: p.payment_method ?? 'card' };
                }
            });
            setSlotPayments(initPayments);
            setIsMultipleReservation(false);
            setMultipleStartDate('');
            setMultipleEndDate('');
            setMultipleWeekdays([]);
            setIncludeHolidaysInRecurrence(true);
            setSelectedCourtIds([editingBookingData.court_id]);

            // Fetch wallet balances for all players in edit mode
            if (bd.organizer_player_id) fetchWalletBalance(bd.organizer_player_id, 0);
            guests.forEach((g: Player, i: number) => { fetchWalletBalance(g.id, i + 1); });
        } else {
            setSlotPayments([defaultSlotPayment(), defaultSlotPayment(), defaultSlotPayment(), defaultSlotPayment()]);
            // Create mode: reset everything
            setOrganizer(null);
            setAdditionalPlayers([null, null, null]);
            setPlayMode('double');
            setDuration(reservation?.durationMinutes || 90);
            setResType('standard');
            setEloMinFilter('');
            setEloMaxFilter('');
            setNotes('');
            setConfirmEmail(false);
            setIsMultipleReservation(false);
            const baseYmd = gridDate || new Date().toISOString().split('T')[0];
            setMultipleStartDate(baseYmd);
            setMultipleEndDate(baseYmd);
            const wd = new Date(`${baseYmd}T12:00:00`).getDay();
            setMultipleWeekdays([wd]);
            setIncludeHolidaysInRecurrence(true);
            setSelectedCourtIds(reservation?.courtId ? [reservation.courtId] : []);
            if (reservation?.startTime) {
                const [h, m] = reservation.startTime.split(':');
                setStartHour(h?.padStart(2, '0') || '08');
                setStartMinute(m?.padStart(2, '0') || '00');
            }
        }

        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen, reservation?.id, editingBookingData?.id, gridDate]);

    useEffect(() => {
        if (!isOpen || !clubId || !reservation || isEditMode) return;
        const dateBase = gridDate || bookingDate || new Date().toISOString().split('T')[0];
        const start = clubSlotToUtcIso(dateBase, startHour, startMinute);
        const end = new Date(new Date(start).getTime() + duration * 60000).toISOString();
        let cancelled = false;
        (async () => {
            try {
                const res = await apiFetchWithAuth<any>(`/courts/available?club_id=${clubId}&start_at=${encodeURIComponent(start)}&end_at=${encodeURIComponent(end)}`);
                if (!cancelled) {
                    const rows = Array.isArray(res?.courts) ? res.courts : [];
                    const mapped: Array<{ id: string; name: string }> = rows.map((c: { id: string; name: string }) => ({
                        id: c.id,
                        name: c.name,
                    }));
                    if (reservation?.courtId && !mapped.some((c) => c.id === reservation.courtId)) {
                        mapped.unshift({
                            id: reservation.courtId,
                            name: reservation.courtName || reservation.courtId,
                        });
                    }
                    setAvailableCourtsForSlot(mapped);
                }
            } catch {
                if (!cancelled) setAvailableCourtsForSlot([]);
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, isEditMode, clubId, reservation?.id, gridDate, bookingDate, startHour, startMinute, duration]);

    // Fetch prices on open (both create and edit mode)
    useEffect(() => {
        if (!isOpen || !clubId) return;
        reservationTypePricesService.getByClub(clubId).then(setPricesByType).catch(() => setPricesByType({}));
    }, [isOpen, clubId]);

    const singleCourtPriceCents = useMemo(() => {
        const storedCents = editingBookingData?.total_price_cents ?? 0;
        if (isEditMode && storedCents > 0) {
            return storedCents;
        }
        const pricePerHour = pricesByType[resType]?.price_per_hour_cents;
        if (pricePerHour != null && pricePerHour > 0) {
            return Math.round((duration / 60) * pricePerHour);
        }
        return storedCents;
    }, [isEditMode, pricesByType, resType, duration, editingBookingData?.total_price_cents]);

    useEffect(() => {
        if (!isOpen || isEditMode || !clubId || !isMultipleReservation || selectedCourtIds.length <= 1) {
            setMultiCourtTotalCents(null);
            return;
        }

        let cancelled = false;
        const dateBase = multipleStartDate || gridDate || bookingDate || new Date().toISOString().split('T')[0];

        (async () => {
            const uniqueCourtIds = Array.from(new Set(selectedCourtIds));
            const baseCourtId = reservation?.courtId;
            const totals = await Promise.all(uniqueCourtIds.map(async (courtId) => {
                try {
                    const slotPrice = await apiFetchWithAuth<any>(
                        `/tariffs/slot-price?club_id=${clubId}&court_id=${courtId}&date=${dateBase}&slot=${startHour}:${startMinute}&duration_minutes=${duration}&reservation_type=${resType || 'standard'}`,
                    );
                    return typeof slotPrice.total_price_cents === 'number'
                        ? slotPrice.total_price_cents
                        : singleCourtPriceCents;
                } catch {
                    // Avoid inflating total when one court price cannot be resolved.
                    return courtId === baseCourtId ? singleCourtPriceCents : 0;
                }
            }));
            if (!cancelled) {
                setMultiCourtTotalCents(totals.reduce((sum, cents) => sum + cents, 0));
            }
        })();

        return () => { cancelled = true; };
    }, [
        isOpen,
        isEditMode,
        clubId,
        isMultipleReservation,
        selectedCourtIds,
        multipleStartDate,
        gridDate,
        bookingDate,
        startHour,
        startMinute,
        duration,
        resType,
        singleCourtPriceCents,
    ]);

    const totalPriceCents = useMemo(() => {
        if (!isEditMode && isMultipleReservation && selectedCourtIds.length > 1 && multiCourtTotalCents != null) {
            return multiCourtTotalCents;
        }
        return singleCourtPriceCents;
    }, [isEditMode, isMultipleReservation, selectedCourtIds.length, multiCourtTotalCents, singleCourtPriceCents]);

    const formattedPrice = totalPriceCents != null && totalPriceCents >= 0
        ? (totalPriceCents / 100).toFixed(2).replace('.', ',') + ' €'
        : null;

    // ─── Cálculos de pago ────────────────────────────────────────────────────
    const uiPlayerCount = useMemo(() =>
        (organizer ? 1 : 0) + additionalPlayers.filter(Boolean).length,
    [organizer, additionalPlayers]);

    const nActivePlayers = useMemo(() => {
        const uiCount = uiPlayerCount;
        if (isEditMode && editingBookingData) {
            const dbCount = countBookingPlayers(
                editingBookingData.booking_participants,
                editingBookingData.organizer_player_id,
                0,
            );
            return uiCount > 0 ? uiCount : dbCount;
        }
        return uiCount;
    }, [isEditMode, editingBookingData, uiPlayerCount]);

    const assignedElos = useMemo(
        () => collectAssignedElos(organizer, additionalPlayers),
        [organizer, additionalPlayers],
    );

    const assignedLevelLabel = assignedElos.length
        ? assignedElos.map((e) => e.toFixed(1)).join(', ')
        : null;

    const suggestLevelRangeFromPlayers = () => {
        if (!assignedElos.length) return;
        const avg = assignedElos.reduce((sum, n) => sum + n, 0) / assignedElos.length;
        const min = Math.max(0, Math.round((avg - 1) * 2) / 2);
        const max = Math.min(7, Math.round((avg + 1) * 2) / 2);
        setEloMinFilter(min.toFixed(1));
        setEloMaxFilter(max.toFixed(1));
    };

    const openMatchEloPayload = isOpenMatchType(resType)
        ? {
            elo_min: eloMinFilter === '' ? null : Number(eloMinFilter),
            elo_max: eloMaxFilter === '' ? null : Number(eloMaxFilter),
        }
        : {};

    const sharePerSlotCents = useMemo(() =>
        shareCentsPerPlayer(totalPriceCents ?? 0, nActivePlayers),
    [totalPriceCents, nActivePlayers]);

    const totalCollectedCents = useMemo(() => {
        const activeSlots = [
            organizer ? slotPayments[0] : null,
            ...additionalPlayers.map((p, i) => p ? slotPayments[i + 1] : null),
        ];
        return activeSlots.reduce((sum, s) => s ? sum + s.paidAmountCents + s.walletAmountCents : sum, 0);
    }, [slotPayments, organizer, additionalPlayers]);

    const pendingCents = Math.max(0, (totalPriceCents ?? 0) - totalCollectedCents);

    const computedStatus: 'pending_payment' | 'confirmed' =
        totalCollectedCents >= (totalPriceCents ?? 0) && (totalPriceCents ?? 0) > 0
            ? 'confirmed'
            : 'pending_payment';

    const executeDelete = useCallback(async ({ cashRefunds, applyRefund, refundPercent }: CashRefundConfirmPayload) => {
        if (!onDelete || !editingBookingData) return;
        setIsDeleting(true);
        try {
            await onDelete(
                editingBookingData.id,
                sendDeleteEmail,
                cashRefunds,
                applyRefund,
                refundPercent,
            );
            setCashRefundOpen(false);
            onClose();
        } catch (err) {
            console.error('Error deleting booking:', err);
            toast.error(t('reservation.deleteError'));
            throw err;
        } finally {
            setIsDeleting(false);
        }
    }, [onDelete, editingBookingData, sendDeleteEmail, onClose, t]);

    const relatedMaintenanceBookings = useMemo(() => {
        if (!reservation || !isMaintenanceReservation(reservation)) return [];
        return findRelatedMaintenanceBookings(reservation, gridReservations);
    }, [reservation, gridReservations]);

    const handleMaintenanceCancelConfirm = useCallback(async (scope: MaintenanceCancelScope) => {
        if (!onCancelMaintenance || !editingBookingData || !reservation) return;
        setIsDeleting(true);
        try {
            const ids = scope === 'all'
                ? [reservation.id, ...relatedMaintenanceBookings.map((r) => r.id)]
                : [String(editingBookingData.id)];
            await onCancelMaintenance(ids);
            setMaintenanceCancelScopeOpen(false);
            setShowDeleteConfirm(false);
            onClose();
        } finally {
            setIsDeleting(false);
        }
    }, [onCancelMaintenance, editingBookingData, reservation, relatedMaintenanceBookings, onClose]);
    // ─────────────────────────────────────────────────────────────────────────

    if (!isOpen) return null;

    if (isLoadingBookingData && reservation && !reservation.id.startsWith('new-')) {
        const loadingBody = (
            <div className="relative flex flex-col w-full bg-gray-50 overflow-hidden h-[90vh] sm:h-auto sm:max-h-[90vh] sm:w-[520px] sm:rounded-2xl">
                <div className="flex items-start justify-between px-6 py-4 bg-white border-b border-gray-100 shrink-0">
                    <h2 className="text-xl font-bold text-gray-900">
                        {activeTab === 'chat' ? 'Chat del partido' : t('reservation.modalTitleEdit')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 transition-colors bg-gray-100 rounded-full hover:bg-gray-200 hover:text-gray-600 shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                        <div className="w-4 h-4 border-2 border-[#006A6A] border-t-transparent rounded-full animate-spin" />
                        {activeTab === 'chat' ? 'Cargando el chat...' : 'Cargando datos de la reserva...'}
                    </div>
                </div>
            </div>
        );
        return portalModal(
            <div style={vvStyle} className="fixed inset-0 z-100 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 transition-opacity duration-300">
                <div className="absolute inset-0" onClick={onClose} />
                {loadingBody}
            </div>,
        );
    }

    const isTournamentGridEdit =
        isEditMode &&
        editingBookingData?.reservation_type === 'tournament' &&
        tournamentIdFromBooking;

    if (isTournamentGridEdit && editingBookingData && tournamentIdFromBooking) {
        return portalModal(
            <TournamentGridBookingEditor
                isOpen={isOpen}
                onClose={onClose}
                tournamentId={tournamentIdFromBooking}
                bookingId={editingBookingData.id}
                courtDisplayName={
                    editingBookingData.courtName || reservation?.courtName || reservation?.courtId || ''
                }
                editingBookingData={editingBookingData}
                onGridRefresh={onGridRefresh}
                onMoveToHidden={onMoveToHidden}
                onMoveToVisible={onMoveToVisible}
                isOnHiddenCourt={isOnHiddenCourt}
                vvStyle={vvStyle}
            />,
        );
    }

    if (!reservation) return null;

    // Construye el array de participantes con datos de pago
    const buildParticipants = () => {
        const all: any[] = [];
        if (organizer) {
            all.push({
                player_id: organizer.id,
                role: 'organizer',
                share_amount_cents: sharePerSlotCents,
                paid_amount_cents: slotPayments[0].paidAmountCents,
                payment_method: slotPayments[0].paymentMethod,
                wallet_amount_cents: slotPayments[0].walletAmountCents,
            });
        }
        additionalPlayers.forEach((p, i) => {
            if (!p) return;
            all.push({
                player_id: p.id,
                role: 'guest',
                share_amount_cents: sharePerSlotCents,
                paid_amount_cents: slotPayments[i + 1].paidAmountCents,
                payment_method: slotPayments[i + 1].paymentMethod,
                wallet_amount_cents: slotPayments[i + 1].walletAmountCents,
            });
        });
        return all;
    };

    const handleSave = async () => {
        if (!organizer) {
            setOrganizerError(true);
            return;
        }
        setOrganizerError(false);
        setOverlapError(null);
        setHoursError(null);
        setPaymentError(null);

        const skipHoursCheck = resType === 'blocked';
        const validateHoursForDate = (dateStr: string): boolean => {
            const check = validateBookingSlotWithinClubHours({
                dateStr,
                startHour,
                startMinute,
                durationMinutes: duration,
                weeklySchedule: weeklySchedule ?? {},
                skipForBlocked: skipHoursCheck,
            });
            if (!check.ok) {
                setHoursError(check.error);
                return false;
            }
            return true;
        };

        if (isEditMode && editingBookingData) {
            const dateBase = bookingDate || gridDate || new Date().toISOString().split('T')[0];
            if (!validateHoursForDate(dateBase)) return;
        } else if (isMultipleReservation) {
            if (!multipleStartDate || !multipleEndDate) {
                toast.error('Indica fecha de inicio y fecha de fin para la reserva múltiple.');
                return;
            }
            if (!validateHoursForDate(multipleStartDate)) return;
        } else {
            const dateBase = gridDate || bookingDate || new Date().toISOString().split('T')[0];
            if (!validateHoursForDate(dateBase)) return;
        }

        // Validate payment method is selected when amount > 0
        const activePlayers = [
            organizer ? { name: `${organizer.first_name} ${organizer.last_name}`, slot: slotPayments[0] } : null,
            ...additionalPlayers.map((p, i) => p ? { name: `${p.first_name} ${p.last_name}`, slot: slotPayments[i + 1] } : null),
        ].filter(Boolean) as { name: string; slot: SlotPayment }[];
        const missingMethod = activePlayers.find(p => (p.slot.paidAmountCents > 0 || p.slot.walletAmountCents > 0) && !p.slot.paymentMethod);
        if (missingMethod) {
            setPaymentError(`Selecciona la forma de pago para ${missingMethod.name}`);
            return;
        }

        // Validate overlap only when schedule changes (adding players on competing open matches is allowed)
        if (isEditMode && editingBookingData) {
            const dateBase = bookingDate || new Date().toISOString().split('T')[0];
            const startAtCheck = clubSlotToUtcIso(dateBase, startHour, startMinute);
            const newStart = new Date(startAtCheck);
            const newEnd = new Date(newStart.getTime() + duration * 60000);
            const endAtCheck = newEnd.toISOString();
            const scheduleChanged = hasBookingScheduleChanged(editingBookingData, {
                startAtIso: startAtCheck,
                endAtIso: endAtCheck,
                courtId: editingBookingData.court_id,
            });
            if (scheduleChanged) {
                try {
                    const courtId = editingBookingData.court_id;
                    const tz = encodeURIComponent(clubIanaTimeZone());
                    const bRes = await apiFetchWithAuth<any>(
                        `/bookings?court_id=${encodeURIComponent(courtId)}&date=${encodeURIComponent(dateBase)}&time_zone=${tz}`,
                    );
                    const conflicts = (bRes.bookings || []).filter((b: any) => {
                        if (b.id === editingBookingData.id) return false;
                        if (!timeRangesOverlap(newStart, newEnd, b.start_at, b.end_at)) return false;
                        return existingBookingBlocksOverlapEdit(b);
                    });
                    if (conflicts.length > 0) {
                        const c = conflicts[0];
                        const cTime = formatTimeHHmmInClubTz(c.start_at);
                        const cName = c.players ? `${c.players.first_name} ${c.players.last_name}` : t('reservation.otherBookingName');
                        setOverlapError(t('reservation.overlapConflict', { name: cName, time: cTime }));
                        return;
                    }
                } catch {
                    // If validation fetch fails, allow save to proceed
                }
            }
        }

        if (!isEditMode && isMultipleReservation) {
            const isMultiCourt = selectedCourtIds.length >= 2;
            const isRecurrence = multipleStartDate !== multipleEndDate;

            if (!isMultiCourt && !isRecurrence) {
                toast.error('Añade al menos otra pista o amplía el rango de fechas para la reserva múltiple.');
                return;
            }
            if (isMultiCourt && selectedCourtIds.length < 2) {
                toast.error('Selecciona al menos 2 pistas para reservar en varias pistas a la vez.');
                return;
            }
            if (!multipleStartDate || !multipleEndDate) {
                toast.error('Indica fecha de inicio y fecha de fin.');
                return;
            }
            if (multipleEndDate < multipleStartDate) {
                toast.error('La fecha de fin no puede ser anterior a la de inicio.');
                return;
            }
            if (isRecurrence && !multipleWeekdays.length) {
                toast.error('Selecciona al menos un día de la semana para la repetición.');
                return;
            }
        }

        setIsSaving(true);
        setBatchResult(null);
        try {
            if (isEditMode && onUpdate && editingBookingData) {
                const dateBase = bookingDate || new Date().toISOString().split('T')[0];
                const startAt = clubSlotToUtcIso(dateBase, startHour, startMinute);
                const endAt = new Date(new Date(startAt).getTime() + duration * 60000).toISOString();
                await onUpdate(editingBookingData.id, {
                    notes: composeNotesWithPlayMode(notes, playMode),
                    booking_type: resType,
                    status: computedStatus,
                    start_at: startAt,
                    end_at: endAt,
                    total_price_cents: totalPriceCents,
                    participants: buildParticipants(),
                    ...openMatchEloPayload,
                });
            } else if (onSave) {
                const courtIdsForSave = isMultipleReservation && selectedCourtIds.length > 0
                    ? selectedCourtIds
                    : [reservation.courtId];
                const data = {
                    court_id: reservation.courtId,
                    court_ids: courtIdsForSave,
                    organizer_player_id: organizer.id,
                    start_at: `${startHour}:${startMinute}`,
                    duration_minutes: duration,
                    total_price_cents: totalPriceCents,
                    status: computedStatus,
                    notes: composeNotesWithPlayMode(notes, playMode),
                    booking_type: resType || 'standard',
                    source_channel: 'manual',
                    participants: buildParticipants(),
                    send_email: confirmEmail,
                    is_multiple: isMultipleReservation,
                    recurrence_start_date: isMultipleReservation ? multipleStartDate : undefined,
                    recurrence_end_date: isMultipleReservation ? multipleEndDate : undefined,
                    recurrence_weekdays: isMultipleReservation ? multipleWeekdays : undefined,
                    include_holidays: includeHolidaysInRecurrence,
                    ...openMatchEloPayload,
                };
                const result = await onSave(data);
                if (result && (result.failed.length > 0 || result.skippedHolidays.length > 0)) {
                    setBatchResult(result);
                    if (result.created > 0) {
                        return;
                    }
                }
            }
            onClose();
        } catch (err: any) {
            console.error('Error saving reservation:', err);
            const detail = err?.message || err?.error || String(err);
            toast.error(t('reservation.saveError'), { description: detail, duration: 6000 });
        } finally {
            setIsSaving(false);
        }
    };

    const assignAvailableCourts = () => {
        if (!isMultipleReservation) return;
        const count = Math.max(2, Math.trunc(Number(courtPickCount) || 2));
        const baseId = reservation?.courtId;
        const pool = availableCourtsForSlot.map((c) => c.id);
        const ordered = baseId ? [baseId, ...pool.filter((id) => id !== baseId)] : pool;
        setSelectedCourtIds(ordered.slice(0, count));
        if (ordered.length < count) {
            toast.message(`Solo ${ordered.length} pista(s) libre(s) en este horario`, { description: 'Se asignaron todas las disponibles.' });
        }
    };

    const addCourtManually = () => {
        if (!isMultipleReservation || !courtToAdd) return;
        if (selectedCourtIds.includes(courtToAdd)) return;
        setSelectedCourtIds((prev) => [...prev, courtToAdd]);
        setCourtToAdd('');
    };

    const handleMultipleReservationToggle = (checked: boolean) => {
        setIsMultipleReservation(checked);
        if (checked) {
            const baseYmd = gridDate || new Date().toISOString().split('T')[0];
            setMultipleStartDate((prev) => prev || baseYmd);
            setMultipleEndDate((prev) => prev || baseYmd);
            setMultipleWeekdays((prev) => {
                if (prev.length > 0) return prev;
                return [new Date(`${baseYmd}T12:00:00`).getDay()];
            });
            if (reservation?.courtId) {
                setSelectedCourtIds((prev) =>
                    prev.includes(reservation.courtId) ? prev : [reservation.courtId, ...prev],
                );
            }
        } else if (reservation?.courtId) {
            setSelectedCourtIds([reservation.courtId]);
            setMultiCourtPickMode('manual');
        }
    };

    const goToCart = () => {
        if (!editingBookingData) return;
        if (!cashSessionLoading && !cashSessionActive) {
            requireOpenCash();
            return;
        }
        const q = new URLSearchParams();
        if (editingBookingData.organizer_player_id) q.set('player', String(editingBookingData.organizer_player_id));
        q.set('booking', String(editingBookingData.id));
        navigate(`/carrito?${q}`);
        onClose();
    };

    const handleMarkPaid = async () => {
        if (!onMarkPaid || !editingBookingData) return;
        if (!cashSessionLoading && !cashSessionActive) {
            requireOpenCash();
            return;
        }
        setIsMarkingPaid(true);
        try {
            await onMarkPaid(editingBookingData.id);
            onClose();
        } catch (err) {
            console.error('Error marking paid:', err);
            toast.error(t('reservation.markPaidError'));
        } finally {
            setIsMarkingPaid(false);
        }
    };

    const handleDelete = () => {
        if (!editingBookingData) return;
        if (reservation && isMaintenanceReservation(reservation) && onCancelMaintenance) {
            setMaintenanceCancelScopeOpen(true);
            return;
        }
        if (!onDelete) return;
        setCashRefundOpen(true);
    };

    const dateForLabel = bookingDate
        ? new Date(`${bookingDate}T12:00:00`)
        : gridDate
          ? new Date(`${gridDate}T12:00:00`)
          : new Date();
    const formattedDate = dateForLabel.toLocaleDateString(calendarLocale(i18n.language), {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const courtDisplayName = editingBookingData?.courtName || reservation.courtName || reservation.courtId;

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutes = ['00', '15', '30', '45'];

    const panelContent = (
            <div className={clsx(
                'relative flex flex-col w-full bg-gray-50 overflow-hidden',
                activeTab === 'chat'
                    ? 'h-[92vh] max-h-[920px] w-full max-w-[480px] rounded-t-3xl shadow-2xl sm:h-[min(88vh,820px)] sm:rounded-2xl animate-slide-up sm:animate-fade-scale-in'
                    : 'h-[90vh] rounded-t-3xl shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-[900px] sm:rounded-2xl animate-slide-up sm:animate-fade-scale-in',
            )}>

                {/* Mobile Drag Indicator */}
                <div className="flex justify-center w-full pt-3 pb-1 sm:hidden bg-white cursor-grab active:cursor-grabbing" onClick={onClose}>
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>

                {/* Header */}
                <div className={clsx(
                    'flex items-start justify-between bg-white border-b border-gray-100 shrink-0',
                    activeTab === 'chat' ? 'px-4 py-3' : 'px-6 py-4',
                )}>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className={clsx(
                                'font-bold text-gray-900 leading-tight',
                                activeTab === 'chat' ? 'text-base' : 'text-xl',
                            )}>
                                {activeTab === 'chat'
                                    ? 'Chat del partido'
                                    : isEditMode
                                      ? t('reservation.modalTitleEdit')
                                      : t('reservation.modalTitleNew')}
                            </h2>
                            {activeTab !== 'chat' && courtDisplayName && (
                                <span className="px-3 py-0.5 bg-[#006A6A] text-white text-sm font-bold rounded-md uppercase tracking-wide">
                                    {courtDisplayName}
                                </span>
                            )}
                        </div>
                        {activeTab !== 'chat' && isEditMode && editingBookingData?.created_at && (
                            <span className="text-[11px] text-gray-400">
                                Creada el {new Date(editingBookingData.created_at).toLocaleDateString(calendarLocale(i18n.language), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                        {activeTab !== 'chat' && overlapError && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium mt-1">
                                <AlertTriangle size={13} className="shrink-0" />
                                {overlapError}
                            </div>
                        )}
                        {activeTab !== 'chat' && hoursError && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium mt-1">
                                <AlertTriangle size={13} className="shrink-0" />
                                {hoursError}
                            </div>
                        )}
                        {activeTab !== 'chat' && paymentError && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium mt-1">
                                <AlertCircle size={13} className="shrink-0" />
                                {paymentError}
                            </div>
                        )}
                        {activeTab !== 'chat' && moveToHiddenError && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700 font-medium mt-1">
                                <AlertTriangle size={13} className="shrink-0" />
                                {moveToHiddenError}
                            </div>
                        )}
                        {activeTab !== 'chat' && batchResult && batchResult.failed.length > 0 && (
                            <div className="mt-2 max-h-32 overflow-y-auto rounded-md border border-red-200 bg-red-50 px-3 py-2">
                                <p className="text-xs font-bold text-red-800">
                                    {batchResult.created} creada(s) · {batchResult.failed.length} fallida(s)
                                </p>
                                <ul className="mt-1 space-y-0.5 text-[11px] text-red-700">
                                    {batchResult.failed.map((f, i) => {
                                        const courtLabel =
                                            availableCourtsForSlot.find((c) => c.id === f.court_id)?.name
                                            ?? (f.court_id === reservation?.courtId ? courtDisplayName : f.court_id.slice(0, 8));
                                        return (
                                            <li key={`${f.date}-${f.court_id}-${i}`}>
                                                ✕ {f.date} · {courtLabel} — {f.reason}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                            {activeTab !== 'chat' && (
                                <button
                                    onClick={() => handleSave()}
                                    disabled={!organizer || isSaving}
                                    className="px-4 py-1.5 bg-[#006A6A] text-white text-xs font-bold rounded-md hover:bg-[#005151] disabled:opacity-50 transition-colors"
                                >
                                    {isSaving ? t('reservation.processing') : t('reservation.save')}
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="px-4 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-md hover:bg-gray-300 transition-colors"
                            >
                                {activeTab === 'chat' ? 'Cerrar' : t('reservation.cancel')}
                            </button>
                            {activeTab !== 'chat' && isEditMode && editingBookingData && isOpenMatchType(resType) && (() => {
                                const shareText = buildMatchShareTextFromBooking(editingBookingData);
                                if (!shareText) return null;
                                return (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void copyTextToClipboard(shareText).then((ok) => {
                                                if (ok) toast.success('Invitación copiada al portapapeles');
                                                else toast.error('No se pudo copiar la invitación');
                                            });
                                        }}
                                        className="flex items-center gap-1.5 px-4 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-md hover:bg-gray-50 transition-colors"
                                    >
                                        <Link2 size={14} />
                                        Copiar invitación
                                    </button>
                                );
                            })()}
                            {activeTab !== 'chat' && isEditMode && editingBookingData && (
                                <button
                                    type="button"
                                    onClick={goToCart}
                                    className="px-4 py-1.5 bg-[#E31E24] text-white text-xs font-bold rounded-md hover:opacity-90 transition-colors"
                                >
                                    Carrito
                                </button>
                            )}
                            {activeTab !== 'chat' && isEditMode && editingBookingData && isOnHiddenCourt && onMoveToVisible && (
                                <button
                                    onClick={async () => {
                                        setMoveToHiddenError(null);
                                        setIsMovingToHidden(true);
                                        try {
                                            await onMoveToVisible(editingBookingData.id);
                                            onClose();
                                        } catch (err: any) {
                                            setMoveToHiddenError(err.message || 'Error al desocultar la reserva');
                                        } finally {
                                            setIsMovingToHidden(false);
                                        }
                                    }}
                                    disabled={isMovingToHidden}
                                    title="Mover a pista oficial"
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-[#005bc5] text-white text-xs font-bold rounded-md hover:bg-[#004fa8] disabled:opacity-50 transition-colors"
                                >
                                    <Eye size={14} />
                                    {isMovingToHidden ? 'Moviendo...' : 'Desocultar'}
                                </button>
                            )}
                            {activeTab !== 'chat' && isEditMode && editingBookingData && !isOnHiddenCourt && onMoveToHidden && (
                                <button
                                    onClick={async () => {
                                        setMoveToHiddenError(null);
                                        setIsMovingToHidden(true);
                                        try {
                                            await onMoveToHidden(editingBookingData.id);
                                            onClose();
                                        } catch (err: any) {
                                            setMoveToHiddenError(err.message || 'Error al mover a pista oculta');
                                        } finally {
                                            setIsMovingToHidden(false);
                                        }
                                    }}
                                    disabled={isMovingToHidden}
                                    title="Enviar a pista oculta"
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-600 text-white text-xs font-bold rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
                                >
                                    <EyeOff size={14} />
                                    {isMovingToHidden ? 'Moviendo...' : 'Ocultar'}
                                </button>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 transition-colors bg-gray-100 rounded-full hover:bg-gray-200 hover:text-gray-600 shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tab selector for Edit mode */}
                {isEditMode && editingBookingData && (
                    <div className="flex border-b border-gray-100 bg-white px-6 shrink-0">
                        <button
                            type="button"
                            onClick={() => setActiveTab('details')}
                            className={`py-3 px-4 text-sm font-bold border-b-2 -mb-[2px] transition-colors flex items-center gap-1.5 ${
                                activeTab === 'details'
                                    ? "border-[#006A6A] text-[#006A6A]"
                                    : "border-transparent text-gray-500 hover:text-gray-900"
                            }`}
                        >
                            Detalles
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('chat')}
                            className={`py-3 px-4 text-sm font-bold border-b-2 -mb-[2px] transition-colors flex items-center gap-1.5 ${
                                activeTab === 'chat'
                                    ? "border-[#006A6A] text-[#006A6A]"
                                    : "border-transparent text-gray-500 hover:text-gray-900"
                            }`}
                        >
                            <MessageSquare className="w-4 h-4" />
                            Chat del Partido
                        </button>
                    </div>
                )}

                {/* Scrollable Content */}
                <div className={clsx(
                    'flex-1 overflow-y-auto hidden-scrollbar flex flex-col',
                    activeTab === 'chat' ? 'p-0 bg-[#F3F4F6]' : 'p-6',
                )}>

                    {isEditMode && editingBookingData && activeTab === 'chat' ? (
                        <div className="flex-1 flex flex-col min-h-0">
                            {/* Match context — estilo Playtomic */}
                            <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-[#1A1A1A]">
                                            {courtDisplayName || 'Partido'}
                                        </p>
                                        <p className="mt-0.5 text-[11px] font-medium text-gray-500">
                                            {formattedDate}
                                            {reservation?.startTime ? ` · ${reservation.startTime}` : ''}
                                            {reservation?.durationMinutes ? ` · ${reservation.durationMinutes} min` : ''}
                                        </p>
                                    </div>
                                    <div className="flex -space-x-2 shrink-0">
                                        {(reservation?.detailedPlayers || []).slice(0, 4).map((p, idx) => (
                                            <div
                                                key={`${p.name}-${idx}`}
                                                title={p.name}
                                                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#006A6A] text-[10px] font-bold text-white"
                                            >
                                                {(p.name || '?').trim().charAt(0).toUpperCase()}
                                            </div>
                                        ))}
                                        {(reservation?.detailedPlayers || []).length === 0 && (
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-[10px] font-bold text-gray-500">
                                                ?
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Messages area */}
                            <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-1 min-h-[280px]">
                                {loadingChat ? (
                                    <div className="flex items-center justify-center h-full text-xs text-gray-500 gap-2 py-16">
                                        <div className="w-4 h-4 border-2 border-[#006A6A] border-t-transparent rounded-full animate-spin" />
                                        Cargando mensajes...
                                    </div>
                                ) : chatMessages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16 px-6">
                                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
                                            <MessageSquare className="w-7 h-7 opacity-40 text-[#006A6A]" />
                                        </div>
                                        <p className="text-sm font-semibold text-gray-600">Chat del partido</p>
                                        <p className="mt-1 text-xs text-gray-400 max-w-[240px]">
                                            Escribe al grupo para avisar cambios de horario, pista o jugadores.
                                        </p>
                                    </div>
                                ) : (
                                    (() => {
                                        let lastDayKey = '';
                                        return chatMessages.map((m) => {
                                            const isClubMessage = Boolean(me.authUserId && m.author_user_id === me.authUserId);
                                            const created = new Date(m.created_at);
                                            const dayKey = created.toLocaleDateString('es-ES', {
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit',
                                            });
                                            const showDay = dayKey !== lastDayKey;
                                            lastDayKey = dayKey;
                                            const initials = String(m.author_name || '?').trim().charAt(0).toUpperCase();
                                            return (
                                                <React.Fragment key={m.id}>
                                                    {showDay && (
                                                        <div className="flex justify-center py-3">
                                                            <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold text-gray-500 shadow-sm">
                                                                {created.toLocaleDateString('es-ES', {
                                                                    weekday: 'short',
                                                                    day: 'numeric',
                                                                    month: 'short',
                                                                })}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className={clsx(
                                                        'flex gap-2 mb-2',
                                                        isClubMessage ? 'flex-row-reverse' : 'flex-row',
                                                    )}>
                                                        {!isClubMessage && (
                                                            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-gray-600 shadow-sm">
                                                                {initials}
                                                            </div>
                                                        )}
                                                        <div
                                                            className={clsx(
                                                                'max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug shadow-sm',
                                                                isClubMessage
                                                                    ? 'rounded-br-md bg-[#006A6A] text-white'
                                                                    : 'rounded-bl-md bg-white text-[#1A1A1A]',
                                                            )}
                                                        >
                                                            <div className="mb-0.5 flex items-center gap-1.5">
                                                                <p className={clsx(
                                                                    'text-[10px] font-bold',
                                                                    isClubMessage ? 'opacity-80' : 'text-gray-500',
                                                                )}>
                                                                    {m.author_name}
                                                                </p>
                                                                {isClubMessage && (
                                                                    <span className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide bg-white/20">
                                                                        Club
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="wrap-break-word whitespace-pre-wrap">{m.message}</p>
                                                            <span className={clsx(
                                                                'mt-1 block text-[9px] text-right',
                                                                isClubMessage ? 'opacity-70' : 'text-gray-400',
                                                            )}>
                                                                {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </React.Fragment>
                                            );
                                        });
                                    })()
                                )}
                            </div>
                            
                            {/* Composer fijo */}
                            <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-3">
                                <div className="flex items-end gap-2">
                                    <input
                                        type="text"
                                        value={chatDraft}
                                        onChange={(e) => setChatDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                void handleSendChatMessage();
                                            }
                                        }}
                                        placeholder="Escribe un mensaje… Usa @club para avisar"
                                        className="w-full rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#006A6A]/20"
                                    />
                                    <button
                                        type="button"
                                        disabled={sendingChat || !chatDraft.trim()}
                                        onClick={() => {
                                            void handleSendChatMessage();
                                        }}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#006A6A] text-white hover:bg-[#005555] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                                    >
                                        <Send className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <React.Fragment>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Left Column */}
                        <div className="space-y-5">
                            {/* Fecha */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-700 w-32 shrink-0">{t('reservation.fieldDate')}</span>
                                {isEditMode ? (
                                    <input
                                        type="date"
                                        value={bookingDate}
                                        onChange={(e) => setBookingDate(e.target.value)}
                                        className="p-1.5 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                    />
                                ) : (
                                    <span className="text-sm text-gray-900 capitalize font-medium">{formattedDate}</span>
                                )}
                            </div>

                            {/* Inicio */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-700 w-32 shrink-0">
                                    {t('reservation.fieldStart')}<span className="text-red-500">*</span>
                                </span>
                                <div className="flex items-center gap-1">
                                    <select
                                        className="p-1.5 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A] min-w-[60px]"
                                        value={startHour}
                                        onChange={(e) => setStartHour(e.target.value)}
                                    >
                                        {hours.map(h => (
                                            <option key={h} value={h}>{h}</option>
                                        ))}
                                    </select>
                                    <span className="font-bold text-gray-600">:</span>
                                    <select
                                        className="p-1.5 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A] min-w-[60px]"
                                        value={startMinute}
                                        onChange={(e) => setStartMinute(e.target.value)}
                                    >
                                        {minutes.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Reserva múltiple */}
                            {!isEditMode && (
                            <div className="space-y-2">
                                <div className="space-y-2">
                                    <label className="inline-flex items-start gap-2 text-xs text-gray-700 font-medium">
                                        <input
                                            type="checkbox"
                                            checked={isMultipleReservation}
                                            onChange={(e) => handleMultipleReservationToggle(e.target.checked)}
                                            className="w-4 h-4 accent-[#006A6A] mt-0.5"
                                        />
                                        <span>
                                            Reserva múltiple
                                            <span className="block text-[10px] font-normal text-gray-500 mt-0.5">
                                                Varias pistas a la vez y/o repetición en varias fechas
                                            </span>
                                        </span>
                                    </label>
                                    {isMultipleReservation && (
                                        <>
                                            <div className="grid grid-cols-2 gap-2">
                                                <label className="block">
                                                    <span className="text-[10px] font-semibold text-gray-500">Fecha inicio</span>
                                                    <input
                                                        type="date"
                                                        value={multipleStartDate}
                                                        onChange={(e) => setMultipleStartDate(e.target.value)}
                                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="text-[10px] font-semibold text-gray-500">Fecha fin</span>
                                                    <input
                                                        type="date"
                                                        value={multipleEndDate}
                                                        onChange={(e) => setMultipleEndDate(e.target.value)}
                                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                                    />
                                                </label>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-semibold text-gray-500 mb-1">Días de la semana</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {WEEKDAY_CHIPS.map((d) => {
                                                        const active = multipleWeekdays.includes(d.id);
                                                        return (
                                                            <button
                                                                key={d.id}
                                                                type="button"
                                                                onClick={() =>
                                                                    setMultipleWeekdays((prev) =>
                                                                        active ? prev.filter((x) => x !== d.id) : [...prev, d.id],
                                                                    )
                                                                }
                                                                className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${active ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200'}`}
                                                            >
                                                                {d.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <label className="inline-flex items-center gap-2 text-xs text-gray-700 font-medium">
                                                <input
                                                    type="checkbox"
                                                    checked={includeHolidaysInRecurrence}
                                                    onChange={(e) => setIncludeHolidaysInRecurrence(e.target.checked)}
                                                    className="w-4 h-4 accent-[#006A6A]"
                                                />
                                                Reservar también en fechas festivas
                                            </label>
                                        </>
                                    )}
                                </div>
                            </div>
                            )}

                            {/* Cliente */}
                            <div>
                                <PlayerSearch
                                    label={t('reservation.clientLabel')}
                                    placeholder={t('reservation.clientSearchPlaceholder')}
                                    selectedPlayer={organizer}
                                    onSelect={(p) => {
                                        if (p && additionalPlayers.some(ap => ap?.id === p.id)) {
                                            toast.error(t('reservation.duplicatePlayerError'));
                                            return;
                                        }
                                        setOrganizer(p);
                                        if (p) {
                                            setOrganizerError(false);
                                            fetchWalletBalance(p.id, 0);
                                            updateSlotPayment(0, { paidAmountCents: 0 });
                                        } else {
                                            updateSlotPayment(0, defaultSlotPayment());
                                        }
                                    }}
                                    required
                                />
                                {organizerError && (
                                    <p className="mt-1 text-xs text-red-500 font-medium">
                                        {t('reservation.organizerRequired')}
                                    </p>
                                )}
                                {/* Wallet badge + payment row for organizer */}
                                {organizer && (
                                    <PaymentSlot
                                        slot={slotPayments[0]}
                                        shareAmountCents={sharePerSlotCents}
                                        maxPayableCents={pendingCents + slotPayments[0].paidAmountCents + slotPayments[0].walletAmountCents}
                                        onUpdate={(patch) => updateSlotPayment(0, patch)}
                                        isFullyPaid={computedStatus === 'confirmed'}
                                        t={t}
                                    />
                                )}
                            </div>

                            {/* Observaciones */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-bold text-gray-700">{t('reservation.notes')}</label>
                                <textarea
                                    className="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white h-24 focus:ring-2 focus:ring-[#006A6A] outline-none resize-none"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>

                            {/* Enviar email */}
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="send-email"
                                    className="w-4 h-4 accent-[#006A6A] border-gray-300 rounded"
                                    checked={confirmEmail}
                                    onChange={(e) => setConfirmEmail(e.target.checked)}
                                />
                                <label htmlFor="send-email" className="text-sm font-medium text-gray-700">
                                    {t('reservation.sendEmailConfirm')}
                                </label>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-5">
                            {/* Instalación */}
                            <div className="flex items-start gap-2">
                                <span className="text-sm font-bold text-gray-700 w-32 shrink-0 pt-1">{t('reservation.facility')}</span>
                                <div className="flex-1 space-y-2">
                                    <span className="text-sm text-gray-900 font-bold uppercase block">{courtDisplayName}</span>
                                    {!isEditMode && !isMultipleReservation && (
                                        <p className="text-[10px] text-gray-500">
                                            Activa «Reserva múltiple» para reservar varias pistas en el mismo horario.
                                        </p>
                                    )}
                                    {!isEditMode && isMultipleReservation && (
                                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                                            <p className="text-[10px] font-semibold text-gray-600">Pistas en este horario</p>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setMultiCourtPickMode('manual')}
                                                    className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold ${multiCourtPickMode === 'manual' ? 'bg-[#006A6A] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                                                >
                                                    Una a una
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMultiCourtPickMode('auto')}
                                                    className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold ${multiCourtPickMode === 'auto' ? 'bg-[#006A6A] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                                                >
                                                    Asignar cantidad
                                                </button>
                                            </div>
                                            {multiCourtPickMode === 'manual' ? (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                                        value={courtToAdd}
                                                        onChange={(e) => setCourtToAdd(e.target.value)}
                                                    >
                                                        <option value="">Elegir pista disponible…</option>
                                                        {availableCourtsForSlot
                                                            .filter((c) => !selectedCourtIds.includes(c.id))
                                                            .map((c) => (
                                                                <option key={c.id} value={c.id}>{c.name}</option>
                                                            ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        onClick={addCourtManually}
                                                        disabled={!courtToAdd}
                                                        className="shrink-0 px-3 py-2 rounded-md bg-[#006A6A] text-white text-[11px] font-bold disabled:opacity-40"
                                                    >
                                                        Añadir
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <label className="text-[10px] text-gray-600 shrink-0">N.º pistas</label>
                                                    <input
                                                        type="number"
                                                        min={2}
                                                        max={20}
                                                        value={courtPickCount}
                                                        onChange={(e) => setCourtPickCount(e.target.value)}
                                                        className="w-16 p-2 border border-gray-300 rounded-md text-sm bg-white"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={assignAvailableCourts}
                                                        className="px-3 py-2 rounded-md bg-[#1A1A1A] text-white text-[11px] font-bold"
                                                    >
                                                        Asignar libres
                                                    </button>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {selectedCourtIds.map((cid) => {
                                                    const label =
                                                        availableCourtsForSlot.find((c) => c.id === cid)?.name ||
                                                        (cid === reservation.courtId ? courtDisplayName : cid);
                                                    const isBase = cid === reservation.courtId;
                                                    return (
                                                        <span key={cid} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-gray-200 text-[11px] font-bold text-gray-700">
                                                            {label}
                                                            {!isBase && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSelectedCourtIds((prev) => prev.filter((x) => x !== cid))}
                                                                    className="text-gray-500 hover:text-red-600"
                                                                    aria-label="Quitar pista"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            )}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Duración */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-bold text-gray-700 w-32 shrink-0">{t('reservation.duration')}</label>
                                <select
                                    className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                    value={duration}
                                    disabled={isOpenMatchType(resType)}
                                    onChange={(e) => { setDuration(Number(e.target.value)); setOverlapError(null); }}
                                >
                                    {durationOptionsForReservationType(resType).map((mins) => (
                                        <option key={mins} value={mins}>{mins}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Tipo de reserva */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-bold text-gray-700 w-32 shrink-0">{t('reservation.bookingType')}</label>
                                <select
                                    className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                    value={resType}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setResType(next);
                                        if (isOpenMatchType(next)) setDuration(90);
                                    }}
                                >
                                    {(Object.keys(pricesByType).length > 0
                                        ? Object.entries(pricesByType)
                                            .map(([reservation_type, cfg]) => ({ ...cfg, reservation_type }))
                                            .sort((a, b) => {
                                            if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
                                            return (a.sort_order ?? 100) - (b.sort_order ?? 100);
                                          })
                                        : [
                                            { reservation_type: 'standard', display_name: 'Pista privada', is_system: true, sort_order: 10 },
                                            { reservation_type: 'open_match', display_name: 'Partido abierto', is_system: true, sort_order: 20 },
                                            { reservation_type: 'pozo', display_name: 'Americanas', is_system: true, sort_order: 30 },
                                            { reservation_type: 'fixed_recurring', display_name: 'Turno fijo', is_system: true, sort_order: 40 },
                                            { reservation_type: 'school_group', display_name: 'Escuela grupo', is_system: true, sort_order: 50 },
                                            { reservation_type: 'school_individual', display_name: 'Clase particular', is_system: true, sort_order: 60 },
                                            { reservation_type: 'flat_rate', display_name: 'Tarifa plana', is_system: true, sort_order: 70 },
                                            { reservation_type: 'tournament', display_name: 'Torneo', is_system: true, sort_order: 80 },
                                            { reservation_type: 'blocked', display_name: 'Bloqueado', is_system: true, sort_order: 90 },
                                          ]
                                    ).map((opt) => {
                                        const i18nKey = `reservation.type_${opt.reservation_type}`;
                                        const translated = t(i18nKey);
                                        const label = translated !== i18nKey && translated !== `grilla.${i18nKey}`
                                            ? translated
                                            : opt.display_name || opt.reservation_type;
                                        return (
                                            <option key={opt.reservation_type} value={opt.reservation_type}>
                                                {label}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-bold text-gray-700 w-32 shrink-0">Modalidad</label>
                                <select
                                    className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                    value={playMode}
                                    onChange={(e) => {
                                        const next = e.target.value === 'single' ? 'single' : 'double';
                                        setPlayMode(next);
                                        if (next === 'single') {
                                            setAdditionalPlayers((prev) => [prev[0] ?? null, null, null]);
                                        }
                                    }}
                                >
                                    <option value="double">Doubles</option>
                                    <option value="single">Singles</option>
                                </select>
                            </div>
                            {isOpenMatchType(resType) && (
                                <div className="space-y-2">
                                    <p className="text-[11px] text-gray-500 leading-snug">{t('reservation.openMatchPlayersHint')}</p>
                                    {willPublicOpenMatchStayOffGrid(nActivePlayers, computedStatus === 'confirmed') && (
                                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 leading-snug">
                                            Con menos de 3 jugadores no aparecerá en la grilla. Podés verlo en Lista de reservas.
                                        </p>
                                    )}
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <label className="text-sm font-bold text-gray-700">Rango de nivel</label>
                                            {assignedElos.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={suggestLevelRangeFromPlayers}
                                                    className="text-[11px] font-semibold text-[#006A6A] hover:underline shrink-0"
                                                >
                                                    Sugerir ±1
                                                </button>
                                            )}
                                        </div>
                                        {assignedLevelLabel && (
                                            <p className="text-[11px] text-gray-500">
                                                Niveles asignados: {assignedLevelLabel}
                                            </p>
                                        )}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <span className="block text-xs text-gray-500 mb-1">Mínimo</span>
                                                <select
                                                    className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                                    value={eloMinFilter}
                                                    onChange={(e) => {
                                                        const next = e.target.value;
                                                        setEloMinFilter(next);
                                                        if (eloMaxFilter !== '' && next !== '' && Number(next) > Number(eloMaxFilter)) {
                                                            setEloMaxFilter(next);
                                                        }
                                                    }}
                                                >
                                                    <option value="">Sin mínimo</option>
                                                    {LEVEL_OPTIONS.map((lvl) => (
                                                        <option key={`elo-min-${lvl}`} value={lvl}>{lvl}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <span className="block text-xs text-gray-500 mb-1">Máximo</span>
                                                <select
                                                    className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                                    value={eloMaxFilter}
                                                    onChange={(e) => {
                                                        const next = e.target.value;
                                                        setEloMaxFilter(next);
                                                        if (eloMinFilter !== '' && next !== '' && Number(next) < Number(eloMinFilter)) {
                                                            setEloMinFilter(next);
                                                        }
                                                    }}
                                                >
                                                    <option value="">Sin máximo</option>
                                                    {LEVEL_OPTIONS.map((lvl) => (
                                                        <option key={`elo-max-${lvl}`} value={lvl}>{lvl}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-gray-500 leading-snug">
                                            Solo podrán unirse desde la app jugadores dentro de este rango.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Precio calculado */}
                            {formattedPrice != null && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-700 w-32 shrink-0">{t('reservation.price')}</span>
                                    <span className="text-sm font-bold text-[#006A6A]">{formattedPrice}</span>
                                    <span className="text-xs text-gray-500">({t('reservation.minutesShort', { n: duration })})</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Resto de jugadores */}
                    <div className="mt-8 pt-6 border-t border-gray-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-3">{t('reservation.otherPlayers')}</h3>
                        <div className="space-y-4">
                            {(playMode === 'single' ? [0] : [0, 1, 2]).map((index) => (
                                <div key={index}>
                                    <PlayerSearch
                                        label={t('reservation.playerLabel', { n: index + 2 })}
                                        onSelect={(player) => {
                                            if (player) {
                                                if (organizer?.id === player.id) {
                                                    toast.error(t('reservation.duplicatePlayerError'));
                                                    return;
                                                }
                                                if (additionalPlayers.some((ap, i) => i !== index && ap?.id === player.id)) {
                                                    toast.error(t('reservation.duplicatePlayerError'));
                                                    return;
                                                }
                                            }
                                            const newPlayers = [...additionalPlayers];
                                            newPlayers[index] = player;
                                            setAdditionalPlayers(newPlayers);
                                            if (player) {
                                                fetchWalletBalance(player.id, index + 1);
                                                updateSlotPayment(index + 1, { paidAmountCents: 0 });
                                            } else {
                                                updateSlotPayment(index + 1, defaultSlotPayment());
                                            }
                                        }}
                                        placeholder={t('reservation.playerSearchPlaceholder', { n: index + 2 })}
                                        selectedPlayer={additionalPlayers[index]}
                                    />
                                    {additionalPlayers[index] && (
                                        <PaymentSlot
                                            slot={slotPayments[index + 1]}
                                            shareAmountCents={sharePerSlotCents}
                                            maxPayableCents={pendingCents + slotPayments[index + 1].paidAmountCents + slotPayments[index + 1].walletAmountCents}
                                            onUpdate={(patch) => updateSlotPayment(index + 1, patch)}
                                            isFullyPaid={computedStatus === 'confirmed'}
                                            t={t}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Totals bar */}
                        {nActivePlayers > 0 && totalPriceCents > 0 && (
                            <div className="mt-5 flex items-center justify-between px-4 py-3 bg-gray-100 rounded-lg text-sm font-bold text-gray-700 gap-4">
                                <span>{t('reservation.paymentTotal')}: <span className="text-gray-900">{(totalPriceCents / 100).toFixed(2)} €</span></span>
                                <span>{t('reservation.paymentCollected')}: <span className="text-[#006A6A]">{(totalCollectedCents / 100).toFixed(2)} €</span></span>
                                <span>{t('reservation.paymentPending')}: <span className={pendingCents > 0 ? 'text-orange-600' : 'text-[#006A6A]'}>{(pendingCents / 100).toFixed(2)} €</span></span>
                            </div>
                        )}
                    </div>
                </React.Fragment>
                )}
                </div>

                {/* Delete section — only in edit mode */}
                {isEditMode && activeTab !== 'chat' && (
                    <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-white space-y-3">
                        {onMarkPaid && editingBookingData?.status === 'pending_payment' && (
                            <button
                                type="button"
                                onClick={handleMarkPaid}
                                disabled={isMarkingPaid}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-[#006A6A] border border-[#006A6A]/40 rounded-md hover:bg-[#006A6A]/5 transition-colors disabled:opacity-50"
                            >
                                <Wallet size={15} />
                                {isMarkingPaid ? t('reservation.markPaidProcessing') : t('reservation.markPaid')}
                            </button>
                        )}
                        {!showDeleteConfirm ? (
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                            >
                                <Trash2 size={15} />
                                {t('reservation.deleteBooking')}
                            </button>
                        ) : (
                            <div className="flex flex-col gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-center gap-2 text-red-700">
                                    <AlertTriangle size={16} className="shrink-0" />
                                    <span className="text-sm font-bold">{t('reservation.deleteConfirm')}</span>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer w-fit">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 accent-red-600"
                                        checked={sendDeleteEmail}
                                        onChange={(e) => setSendDeleteEmail(e.target.checked)}
                                    />
                                    <span className="text-sm text-red-700">{t('reservation.deleteSendEmail')}</span>
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleDelete}
                                        disabled={isDeleting}
                                        className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                                    >
                                        {isDeleting ? t('reservation.deleting') : t('reservation.deleteYes')}
                                    </button>
                                    <button
                                        onClick={() => { setShowDeleteConfirm(false); setSendDeleteEmail(false); }}
                                        disabled={isDeleting}
                                        className="px-4 py-1.5 bg-white text-gray-700 text-xs font-bold border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                                    >
                                        {t('reservation.cancel')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Saving overlay */}
                {isSaving && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-110">
                        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg border border-gray-100">
                            <div className="w-5 h-5 border-2 border-[#006A6A] border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm font-bold text-gray-900">{t('reservation.processing')}</span>
                        </div>
                    </div>
                )}

            </div>
    );

    return portalModal(
        <>
        <div style={vvStyle} className="fixed inset-0 z-100 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 transition-opacity duration-300">
            <div className="absolute inset-0" onClick={onClose} />
            {panelContent}
        </div>
            {maintenanceCancelScopeOpen && reservation && (
                <MaintenanceCancelScopeModal
                    target={reservation}
                    related={relatedMaintenanceBookings}
                    onClose={() => !isDeleting && setMaintenanceCancelScopeOpen(false)}
                    onConfirm={handleMaintenanceCancelConfirm}
                />
            )}
            {cashRefundOpen && editingBookingData?.id && (
                <CashRefundModal
                    isOpen={cashRefundOpen}
                    bookingId={String(editingBookingData.id)}
                    requireConfirmation
                    title="Cancelar reserva"
                    subtitle="Confirma la cancelación y, si hay efectivo, cómo devolverlo."
                    confirmLabel="Cancelar reserva"
                    onClose={() => !isDeleting && setCashRefundOpen(false)}
                    onConfirm={executeDelete}
                    externalSubmitting={isDeleting}
                />
            )}
        </>,
    );
};
