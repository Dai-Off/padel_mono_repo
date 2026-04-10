import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import { useVisualViewportFix } from '../hooks/useVisualViewportFix';
import { playerService } from '../../../services/player';
import { apiFetchWithAuth } from '../../../services/api';
import { reservationTypePricesService } from '../../../services/reservationTypePrices';
import type { Player } from '../../../types/api';
import { useGrillaTranslation } from '../i18n/useGrillaTranslation';
import { calendarLocale } from '../i18n/calendarLocale';

interface ReservationModalProps {
    clubId?: string | null;
    isOpen: boolean;
    onClose: () => void;
    reservation: Reservation | null;
    onSave?: (bookingData: any) => Promise<void>;
    editingBookingData?: any | null;
    onUpdate?: (bookingId: string, data: any) => Promise<void>;
    onDelete?: (bookingId: string, sendEmail: boolean) => Promise<void>;
    onMarkPaid?: (bookingId: string) => Promise<void>;
    onMoveToHidden?: (bookingId: string) => Promise<void>;
    onMoveToVisible?: (bookingId: string) => Promise<void>;
    isOnHiddenCourt?: boolean;
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
    const [altaForm, setAltaForm] = useState({ first_name: '', last_name: '', phone: '', email: '' });

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
            const newPlayer = await playerService.createManual({
                first_name: first_name.trim(),
                last_name: last_name.trim(),
                phone: phone.trim(),
                email: emailTrim || undefined,
            });
            onSelect(newPlayer);
            setAltaOpen(false);
            setAltaForm({ first_name: '', last_name: '', phone: '', email: '' });
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
                            <div>
                                <p className="text-sm font-bold text-gray-900">{selectedPlayer.first_name} {selectedPlayer.last_name}</p>
                                <p className="text-[10px] text-gray-500">
                                    {selectedPlayer.phone?.trim()
                                        ? `${selectedPlayer.phone} · Elo ${Math.round(Number(selectedPlayer.elo_rating) || 0)}`
                                        : selectedPlayer.email || t('playerSearch.noContactLine')}
                                </p>
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
                                className="flex items-center justify-center w-10 h-10 rounded-md bg-[#00726b] hover:bg-[#005a4f] text-white transition-colors shrink-0"
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
                                        <div className="truncate">
                                            <p className="text-sm font-bold text-gray-900 truncate">{p.first_name} {p.last_name}</p>
                                            <p className="text-[11px] text-gray-500 truncate">
                                                {p.phone?.trim()
                                                    ? `${p.phone} · Elo ${Math.round(Number(p.elo_rating) || 0)}`
                                                    : p.email || t('playerSearch.noContactLine')}
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
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAltaOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-gray-900">{t('playerSearch.manualAddTitle')}</h3>
                            <button onClick={() => setAltaOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleAltaSubmit} className="flex flex-col gap-3">
                            <p className="text-[11px] text-gray-500">{t('playerSearch.manualAddHint')}</p>
                            {(['first_name', 'last_name', 'phone', 'email'] as const).map((field) => (
                                <div key={field}>
                                    {field === 'email' && (
                                        <span className="text-[10px] text-gray-400 block mb-0.5">{t('playerSearch.emailOptional')}</span>
                                    )}
                                    <input
                                        type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                                        placeholder={
                                            {
                                                first_name: t('playerSearch.namePh'),
                                                last_name: t('playerSearch.lastNamePh'),
                                                phone: t('playerSearch.phonePh'),
                                                email: t('playerSearch.emailPh'),
                                            }[field]
                                        }
                                        value={altaForm[field]}
                                        onChange={(e) => setAltaForm(prev => ({ ...prev, [field]: e.target.value }))}
                                        className="w-full p-2.5 bg-white border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-[#00726b] focus:border-transparent outline-none"
                                    />
                                </div>
                            ))}
                            {altaError && <p className="text-xs text-red-500">{altaError}</p>}
                            <button
                                type="submit"
                                disabled={altaSubmitting}
                                className="mt-1 w-full py-2.5 rounded-lg bg-[#00726b] hover:bg-[#005a4f] text-white text-sm font-bold transition-colors disabled:opacity-60"
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
interface SlotPayment {
    paidAmountCents: number;
    paymentMethod: PaymentMethod;
    walletAmountCents: number;
    walletBalanceCents: number | null;
    walletLoading: boolean;
}
const defaultSlot = (): SlotPayment => ({
    paidAmountCents: 0, paymentMethod: null,
    walletAmountCents: 0, walletBalanceCents: null, walletLoading: false,
});

// ─── PaymentSlot: fila de cobro con selector de método ──────────────────────
const PaymentSlot: React.FC<{
    slot: SlotPayment;
    shareAmountCents: number;
    maxPayableCents: number;
    onUpdate: (patch: Partial<SlotPayment>) => void;
    isFullyPaid: boolean;
    t: (key: string, opts?: Record<string, string | number>) => string;
}> = ({ slot, shareAmountCents, maxPayableCents, onUpdate, isFullyPaid, t }) => {
    const { walletBalanceCents, walletLoading, walletAmountCents, paidAmountCents, paymentMethod } = slot;

    const [rawInput, setRawInput] = React.useState('');

    // The "effective" amount is whichever bucket is active
    const effectiveAmountCents = paymentMethod === 'wallet' ? walletAmountCents : paidAmountCents;
    const thisSlotHasPaid = effectiveAmountCents > 0;

    // When reservation is fully paid and THIS slot didn't contribute, lock it
    const isLocked = isFullyPaid && !thisSlotHasPaid;

    // Sync local text when external value changes (e.g. method switch, slot reset)
    React.useEffect(() => {
        setRawInput(effectiveAmountCents > 0 ? String(Math.round(effectiveAmountCents / 100)) : '');
    }, [effectiveAmountCents]);

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isLocked) return;
        const raw = e.target.value.replace(/[^0-9]/g, ''); // only digits
        setRawInput(raw);
        const euros = parseInt(raw || '0', 10);
        const clamped = Math.min(euros * 100, maxPayableCents);
        if (paymentMethod === 'wallet') {
            onUpdate({ walletAmountCents: clamped, paidAmountCents: 0 });
        } else {
            onUpdate({ paidAmountCents: clamped });
        }
    };

    return (
        <div className="mt-2 space-y-2">
            {/* Payment amount + method */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-medium shrink-0">
                    {t('reservation.shareAmount', { amount: Math.round(shareAmountCents / 100) })}
                </span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={rawInput}
                    onChange={handleAmountChange}
                    disabled={isLocked}
                    placeholder="0 €"
                    className={`w-20 p-1.5 border border-gray-300 rounded-md text-xs bg-white outline-none focus:ring-2 focus:ring-[#006A6A] ${isLocked ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}`}
                />
                <div className="flex gap-1">
                    <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => {
                            if (paymentMethod === 'wallet') {
                                onUpdate({ paymentMethod: 'cash', paidAmountCents: walletAmountCents || paidAmountCents, walletAmountCents: 0 });
                            } else {
                                onUpdate({ paymentMethod: paymentMethod === 'cash' ? null : 'cash' });
                            }
                        }}
                        className={`px-2 py-1 text-xs font-bold rounded-md border transition-colors ${
                            paymentMethod === 'cash'
                                ? 'bg-[#006A6A] text-white border-[#006A6A]'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        {t('reservation.paymentCash')}
                    </button>
                    <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => {
                            if (paymentMethod === 'wallet') {
                                onUpdate({ paymentMethod: 'card', paidAmountCents: walletAmountCents || paidAmountCents, walletAmountCents: 0 });
                            } else {
                                onUpdate({ paymentMethod: paymentMethod === 'card' ? null : 'card' });
                            }
                        }}
                        className={`px-2 py-1 text-xs font-bold rounded-md border transition-colors ${
                            paymentMethod === 'card'
                                ? 'bg-[#006A6A] text-white border-[#006A6A]'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        {t('reservation.paymentCard')}
                    </button>
                    {(() => {
                        const bal = walletBalanceCents ?? 0;
                        const hasBalance = bal > 0;
                        const isActive = paymentMethod === 'wallet';
                        const isDisabled = !hasBalance && !isActive;
                        return (
                            <button
                                type="button"
                                disabled={isDisabled || isLocked}
                                onClick={() => {
                                    if (isActive) {
                                        onUpdate({ paymentMethod: null, paidAmountCents: walletAmountCents, walletAmountCents: 0 });
                                    } else {
                                        onUpdate({ paymentMethod: 'wallet', walletAmountCents: paidAmountCents, paidAmountCents: 0 });
                                    }
                                }}
                                className={`px-2 py-1 text-xs font-bold rounded-md border transition-colors flex items-center gap-1 ${
                                    isActive
                                        ? 'bg-[#006A6A] text-white border-[#006A6A]'
                                        : isDisabled
                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                }`}
                                title={isDisabled ? 'Sin saldo disponible' : `Saldo: ${(bal / 100).toFixed(2)} €`}
                            >
                                <Wallet size={11} />
                                {walletLoading
                                    ? 'Wallet ...'
                                    : `Wallet (${(bal / 100).toFixed(2)} €)`
                                }
                            </button>
                        );
                    })()}
                </div>
            </div>
            {isLocked && (
                <p className="text-[10px] text-emerald-600 font-bold">✓ Reserva pagada en su totalidad</p>
            )}
        </div>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

export const ReservationModal: React.FC<ReservationModalProps> = ({
    clubId, isOpen, onClose, reservation, onSave, editingBookingData, onUpdate, onDelete, onMarkPaid, onMoveToHidden, onMoveToVisible, isOnHiddenCourt
}) => {
    const vvStyle = useVisualViewportFix(isOpen);
    const { t, i18n } = useGrillaTranslation();
    const isEditMode = !!editingBookingData;

    // Form States
    const [organizer, setOrganizer] = useState<Player | null>(null);
    const [additionalPlayers, setAdditionalPlayers] = useState<(Player | null)[]>([null, null, null]);
    const [duration, setDuration] = useState(90);
    const [resType, setResType] = useState<string>('standard');
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
    const [overlapError, setOverlapError] = useState<string | null>(null);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [pricesByType, setPricesByType] = useState<Record<string, { price_per_hour_cents: number }>>({});
    const [isMarkingPaid, setIsMarkingPaid] = useState(false);
    const [guestInviteMode, setGuestInviteMode] = useState<'single' | 'double'>('double');
    const [isMovingToHidden, setIsMovingToHidden] = useState(false);
    const [moveToHiddenError, setMoveToHiddenError] = useState<string | null>(null);
    const [slotPayments, setSlotPayments] = useState<SlotPayment[]>([defaultSlot(), defaultSlot(), defaultSlot(), defaultSlot()]);

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
        setShowDeleteConfirm(false);
        setSendDeleteEmail(false);

        if (isEditMode && editingBookingData) {
            // Edit mode: pre-populate from existing booking
            const bd = editingBookingData;
            const start = new Date(bd.start_at);
            const sh = start.getHours().toString().padStart(2, '0');
            const sm = start.getMinutes().toString().padStart(2, '0');
            const dateVal = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
            const durMin = (new Date(bd.end_at).getTime() - start.getTime()) / 60000;
            const dur = Math.min(90, Math.max(30, Math.round(durMin / 30) * 30)) || 90;
            const notesVal = bd.notes || '';
            const resTypeVal = bd.reservation_type || '';
            setStartHour(sh);
            setStartMinute(sm);
            setBookingDate(dateVal);
            setDuration(dur);
            setNotes(notesVal);
            setResType(resTypeVal);
            setConfirmEmail(false);

            // Set organizer from joined players data
            if (bd.players) {
                setOrganizer({
                    id: bd.organizer_player_id,
                    first_name: bd.players.first_name,
                    last_name: bd.players.last_name,
                    email: bd.players.email || '',
                    phone: null,
                    elo_rating: 1200,
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
                    phone: null,
                    elo_rating: 1200,
                    status: 'active' as const,
                    created_at: '',
                }));
            const slots: (Player | null)[] = [null, null, null];
            guests.forEach((g: Player, i: number) => { slots[i] = g; });
            setAdditionalPlayers(slots);
            setGuestInviteMode(guests.length <= 1 ? 'single' : 'double');

            // Inicializar pagos desde payment_transactions (manual_cash / manual_card)
            const initPayments: SlotPayment[] = [defaultSlot(), defaultSlot(), defaultSlot(), defaultSlot()];
            const txByPlayer = new Map<string, { paidAmountCents: number; walletAmountCents: number; paymentMethod: PaymentMethod }>();
            (bd.payment_transactions || [])
                .filter((t: any) => t.status === 'succeeded' && typeof t.stripe_payment_intent_id === 'string' && t.stripe_payment_intent_id.startsWith('manual_'))
                .forEach((t: any) => {
                    // Format: manual_cash_<bookingId>_<playerId> — method is the second segment
                    const method = t.stripe_payment_intent_id.split('_')[1];
                    const pm: PaymentMethod = (method === 'cash' || method === 'card' || method === 'wallet') ? method as PaymentMethod : null;
                    txByPlayer.set(t.payer_player_id, {
                        paidAmountCents: pm === 'wallet' ? 0 : t.amount_cents,
                        walletAmountCents: pm === 'wallet' ? t.amount_cents : 0,
                        paymentMethod: pm,
                    });
                });
            const orgTx = txByPlayer.get(bd.organizer_player_id);
            if (orgTx) initPayments[0] = { ...defaultSlot(), ...orgTx };
            (bd.booking_participants || []).filter((p: any) => p.role === 'guest').slice(0, 3).forEach((p: any, i: number) => {
                const tx = txByPlayer.get(p.player_id);
                if (tx) initPayments[i + 1] = { ...defaultSlot(), ...tx };
            });
            setSlotPayments(initPayments);

            // Fetch wallet balances for all players in edit mode
            if (bd.organizer_player_id) fetchWalletBalance(bd.organizer_player_id, 0);
            guests.forEach((g: Player, i: number) => { fetchWalletBalance(g.id, i + 1); });
        } else {
            setSlotPayments([defaultSlot(), defaultSlot(), defaultSlot(), defaultSlot()]);
            // Create mode: reset everything
            setOrganizer(null);
            setAdditionalPlayers([null, null, null]);
            setGuestInviteMode('double');
            setDuration(reservation?.durationMinutes || 90);
            setResType('standard');
            setNotes('');
            setConfirmEmail(false);
            if (reservation?.startTime) {
                const [h, m] = reservation.startTime.split(':');
                setStartHour(h?.padStart(2, '0') || '08');
                setStartMinute(m?.padStart(2, '0') || '00');
            }
        }

        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen, reservation?.id, editingBookingData?.id]);

    // Fetch prices on open (both create and edit mode)
    useEffect(() => {
        if (!isOpen || !clubId) return;
        reservationTypePricesService.getByClub(clubId).then(setPricesByType).catch(() => setPricesByType({}));
    }, [isOpen, clubId]);

    const totalPriceCents = useMemo(() => {
        const pricePerHour = pricesByType[resType]?.price_per_hour_cents;
        // If club has a configured rate for this type, recalculate from current duration
        if (pricePerHour != null && pricePerHour > 0) {
            return Math.round((duration / 60) * pricePerHour);
        }
        // Fallback: use the stored price (no price rule configured)
        return editingBookingData?.total_price_cents ?? 0;
    }, [pricesByType, resType, duration, editingBookingData?.total_price_cents]);

    const formattedPrice = totalPriceCents != null && totalPriceCents >= 0
        ? (totalPriceCents / 100).toFixed(2).replace('.', ',') + ' €'
        : null;

    // ─── Cálculos de pago ────────────────────────────────────────────────────
    const nActivePlayers = useMemo(() =>
        (organizer ? 1 : 0) + additionalPlayers.filter(Boolean).length,
    [organizer, additionalPlayers]);

    const sharePerSlotCents = useMemo(() =>
        nActivePlayers > 0 && totalPriceCents ? Math.ceil(totalPriceCents / nActivePlayers) : 0,
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
    // ─────────────────────────────────────────────────────────────────────────

    if (!isOpen || !reservation) return null;

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
        setPaymentError(null);

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

        // Validate no overlap with other bookings on the same court
        if (isEditMode && editingBookingData) {
            const dateBase = bookingDate || new Date().toISOString().split('T')[0];
            const newStart = new Date(`${dateBase}T${startHour}:${startMinute}`);
            const newEnd = new Date(newStart.getTime() + duration * 60000);
            try {
                const courtId = editingBookingData.court_id;
                const bRes = await apiFetchWithAuth<any>(`/bookings?court_id=${courtId}&date=${dateBase}`);
                const conflicts = (bRes.bookings || []).filter((b: any) => {
                    if (b.id === editingBookingData.id) return false;
                    const bStart = new Date(b.start_at);
                    const bEnd = new Date(b.end_at);
                    return newStart < bEnd && newEnd > bStart;
                });
                if (conflicts.length > 0) {
                    const c = conflicts[0];
                    const cTime = new Date(c.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    const cName = c.players ? `${c.players.first_name} ${c.players.last_name}` : t('reservation.otherBookingName');
                    setOverlapError(t('reservation.overlapConflict', { name: cName, time: cTime }));
                    return;
                }
            } catch {
                // If validation fetch fails, allow save to proceed
            }
        }

        setIsSaving(true);
        try {
            if (isEditMode && onUpdate && editingBookingData) {
                const dateBase = bookingDate || new Date().toISOString().split('T')[0];
                const startAt = new Date(`${dateBase}T${startHour}:${startMinute}`).toISOString();
                const endAt = new Date(new Date(startAt).getTime() + duration * 60000).toISOString();
                await onUpdate(editingBookingData.id, {
                    notes,
                    booking_type: resType,
                    status: computedStatus,
                    start_at: startAt,
                    end_at: endAt,
                    total_price_cents: totalPriceCents,
                    participants: buildParticipants(),
                });
            } else if (onSave) {
                const data = {
                    court_id: reservation.courtId,
                    organizer_player_id: organizer.id,
                    start_at: `${startHour}:${startMinute}`,
                    duration_minutes: duration,
                    total_price_cents: totalPriceCents,
                    status: computedStatus,
                    notes,
                    booking_type: resType || 'standard',
                    source_channel: 'manual',
                    participants: buildParticipants(),
                    send_email: confirmEmail,
                };
                await onSave(data);
            }
            onClose();
        } catch (err: any) {
            console.error('Error saving reservation:', err);
            const detail = err?.message || err?.error || String(err);
            alert(`${t('reservation.saveError')}\n\n${detail}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleMarkPaid = async () => {
        if (!onMarkPaid || !editingBookingData) return;
        setIsMarkingPaid(true);
        try {
            await onMarkPaid(editingBookingData.id);
            onClose();
        } catch (err) {
            console.error('Error marking paid:', err);
            alert(t('reservation.markPaidError'));
        } finally {
            setIsMarkingPaid(false);
        }
    };

    const handleDelete = async () => {
        if (!onDelete || !editingBookingData) return;
        setIsDeleting(true);
        try {
            await onDelete(editingBookingData.id, sendDeleteEmail);
            onClose();
        } catch (err) {
            console.error('Error deleting booking:', err);
            alert(t('reservation.deleteError'));
        } finally {
            setIsDeleting(false);
        }
    };

    const dateForLabel = bookingDate ? new Date(`${bookingDate}T12:00:00`) : new Date();
    const formattedDate = dateForLabel.toLocaleDateString(calendarLocale(i18n.language), {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const courtDisplayName = editingBookingData?.courtName || reservation.courtName || reservation.courtId;

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutes = ['00', '15', '30', '45'];

    return (
        <div style={vvStyle} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 transition-opacity duration-300">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={onClose} />

            {/* Modal Container */}
            <div className="relative flex flex-col w-full h-[90vh] bg-gray-50 rounded-t-3xl shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-[900px] sm:rounded-2xl animate-slide-up sm:animate-fade-scale-in overflow-hidden">

                {/* Mobile Drag Indicator */}
                <div className="flex justify-center w-full pt-3 pb-1 sm:hidden bg-white cursor-grab active:cursor-grabbing" onClick={onClose}>
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-start justify-between px-6 py-4 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className="text-xl font-bold text-gray-900 leading-tight">
                                {isEditMode ? t('reservation.modalTitleEdit') : t('reservation.modalTitleNew')}
                            </h2>
                            {courtDisplayName && (
                                <span className="px-3 py-0.5 bg-[#006A6A] text-white text-sm font-bold rounded-md uppercase tracking-wide">
                                    {courtDisplayName}
                                </span>
                            )}
                        </div>
                        {isEditMode && editingBookingData?.created_at && (
                            <span className="text-[11px] text-gray-400">
                                Creada el {new Date(editingBookingData.created_at).toLocaleDateString(calendarLocale(i18n.language), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                        {overlapError && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium mt-1">
                                <AlertTriangle size={13} className="shrink-0" />
                                {overlapError}
                            </div>
                        )}
                        {paymentError && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium mt-1">
                                <AlertCircle size={13} className="shrink-0" />
                                {paymentError}
                            </div>
                        )}
                        {moveToHiddenError && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700 font-medium mt-1">
                                <AlertTriangle size={13} className="shrink-0" />
                                {moveToHiddenError}
                            </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() => handleSave()}
                                disabled={!organizer || isSaving}
                                className="px-4 py-1.5 bg-[#006A6A] text-white text-xs font-bold rounded-md hover:bg-[#005151] disabled:opacity-50 transition-colors"
                            >
                                {isSaving ? t('reservation.processing') : t('reservation.save')}
                            </button>
                            <button
                                onClick={onClose}
                                className="px-4 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-md hover:bg-gray-300 transition-colors"
                            >
                                {t('reservation.cancel')}
                            </button>
                            {isEditMode && editingBookingData && onMarkPaid && (
                                <button
                                    type="button"
                                    onClick={handleMarkPaid}
                                    disabled={isMarkingPaid}
                                    className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                >
                                    {isMarkingPaid ? t('reservation.markPaidProcessing') : t('reservation.markPaid')}
                                </button>
                            )}
                            {isEditMode && editingBookingData && isOnHiddenCourt && onMoveToVisible && (
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
                            {isEditMode && editingBookingData && !isOnHiddenCourt && onMoveToHidden && (
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
                        className="p-2 text-gray-400 transition-colors bg-gray-100 rounded-full hover:bg-gray-200 hover:text-gray-600 flex-shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 p-6 overflow-y-auto hidden-scrollbar">

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

                            {/* Nº de reservas */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-700 w-32 shrink-0">{t('reservation.fieldNumBookings')}</span>
                                <select className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]">
                                    <option>1</option>
                                    <option>2</option>
                                    <option>3</option>
                                    <option>4</option>
                                </select>
                            </div>

                            {/* Cliente */}
                            <div>
                                <PlayerSearch
                                    label={t('reservation.clientLabel')}
                                    placeholder={t('reservation.clientSearchPlaceholder')}
                                    selectedPlayer={organizer}
                                    onSelect={(p) => {
                                        if (p && additionalPlayers.some(ap => ap?.id === p.id)) {
                                            alert(t('reservation.duplicatePlayerError'));
                                            return;
                                        }
                                        setOrganizer(p);
                                        if (p) {
                                            setOrganizerError(false);
                                            fetchWalletBalance(p.id, 0);
                                            updateSlotPayment(0, { paidAmountCents: 0 });
                                        } else {
                                            updateSlotPayment(0, defaultSlot());
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
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-700 w-32 shrink-0">{t('reservation.facility')}</span>
                                <span className="text-sm text-gray-900 font-bold uppercase">{courtDisplayName}</span>
                            </div>

                            {/* Duración */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-bold text-gray-700 w-32 shrink-0">{t('reservation.duration')}</label>
                                <select
                                    className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                    value={duration}
                                    onChange={(e) => { setDuration(Number(e.target.value)); setOverlapError(null); }}
                                >
                                    <option value={30}>30</option>
                                    <option value={60}>60</option>
                                    <option value={90}>90</option>
                                </select>
                            </div>

                            {/* Tipo de reserva */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-bold text-gray-700 w-32 shrink-0">{t('reservation.bookingType')}</label>
                                <select
                                    className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                    value={resType}
                                    onChange={(e) => setResType(e.target.value)}
                                >
                                    <option value="standard">{t('reservation.type_standard')}</option>
                                    <option value="open_match">{t('reservation.type_open_match')}</option>
                                    <option value="pozo">{t('reservation.type_pozo')}</option>
                                    <option value="fixed_recurring">{t('reservation.type_fixed_recurring')}</option>
                                    <option value="school_group">{t('reservation.type_school_group')}</option>
                                    <option value="school_individual">{t('reservation.type_school_individual')}</option>
                                    <option value="flat_rate">{t('reservation.type_flat_rate')}</option>
                                    <option value="tournament">{t('reservation.type_tournament')}</option>
                                    <option value="blocked">{t('reservation.type_blocked')}</option>
                                </select>
                            </div>
                            {resType === 'open_match' && (
                                <p className="text-[11px] text-gray-500 leading-snug">{t('reservation.openMatchPlayersHint')}</p>
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
                        {!isEditMode && (
                            <div className="mb-4 flex flex-col gap-1.5">
                                <label className="text-sm font-bold text-gray-700">{t('reservation.inviteModeLabel')}</label>
                                <select
                                    className="max-w-md p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                    value={guestInviteMode}
                                    onChange={(e) => {
                                        const v = e.target.value === 'single' ? 'single' : 'double';
                                        setGuestInviteMode(v);
                                        if (v === 'single') {
                                            setAdditionalPlayers((prev) => [prev[0] ?? null, null, null]);
                                        }
                                    }}
                                >
                                    <option value="single">{t('reservation.inviteMode_single')}</option>
                                    <option value="double">{t('reservation.inviteMode_double')}</option>
                                </select>
                            </div>
                        )}
                        {isEditMode && (
                            <p className="text-[11px] text-gray-500 mb-4">
                                {guestInviteMode === 'single' ? t('reservation.inviteMode_single') : t('reservation.inviteMode_double')}
                            </p>
                        )}
                        <div className="space-y-4">
                            {(guestInviteMode === 'single' ? [0] : [0, 1, 2]).map((index) => (
                                <div key={index}>
                                    <PlayerSearch
                                        label={t('reservation.playerLabel', { n: index + 2 })}
                                        onSelect={(player) => {
                                            if (player) {
                                                if (organizer?.id === player.id) {
                                                    alert(t('reservation.duplicatePlayerError'));
                                                    return;
                                                }
                                                if (additionalPlayers.some((ap, i) => i !== index && ap?.id === player.id)) {
                                                    alert(t('reservation.duplicatePlayerError'));
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
                                                updateSlotPayment(index + 1, defaultSlot());
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
                </div>

                {/* Delete section — only in edit mode */}
                {isEditMode && (
                    <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-white">
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
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-[110]">
                        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg border border-gray-100">
                            <div className="w-5 h-5 border-2 border-[#006A6A] border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm font-bold text-gray-900">{t('reservation.processing')}</span>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
