import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    X,
    AlertTriangle,
    Wallet,
    AlertCircle,
} from 'lucide-react';
import { useVisualViewportFix } from '../hooks/useVisualViewportFix';
import { apiFetchWithAuth } from '../../../services/api';
import { reservationTypePricesService } from '../../../services/reservationTypePrices';
import type { Player } from '../../../types/api';
import { useGrillaTranslation } from '../i18n/useGrillaTranslation';
import { PlayerSearch } from './ReservationModal';

export type PaymentMethod = 'cash' | 'card' | 'wallet' | null;

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
    const effectiveAmountCents = paymentMethod === 'wallet' ? walletAmountCents : paidAmountCents;
    const thisSlotHasPaid = effectiveAmountCents > 0;
    const isLocked = isFullyPaid && !thisSlotHasPaid;

    React.useEffect(() => {
        setRawInput(effectiveAmountCents > 0 ? String(Math.round(effectiveAmountCents / 100)) : '');
    }, [effectiveAmountCents]);

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isLocked) return;
        const raw = e.target.value.replace(/[^0-9]/g, '');
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
                <p className="text-[10px] text-emerald-600 font-bold">✓ Pagado en su totalidad</p>
            )}
        </div>
    );
};

interface CreateMatchModalProps {
    clubId?: string | null;
    isOpen: boolean;
    onClose: () => void;
}

export const CreateMatchModal: React.FC<CreateMatchModalProps> = ({ clubId, isOpen, onClose }) => {
    const vvStyle = useVisualViewportFix(isOpen);
    const { t } = useGrillaTranslation();

    const [organizer, setOrganizer] = useState<Player | null>(null);
    const [additionalPlayers, setAdditionalPlayers] = useState<(Player | null)[]>([null, null, null]);
    const [duration, setDuration] = useState(90);
    const [matchGender, setMatchGender] = useState<'male' | 'female' | 'mixed' | 'any'>('any');
    const [matchVisibility, setMatchVisibility] = useState<'public' | 'private'>('public');
    const [isCompetitive, setIsCompetitive] = useState(true);
    const [startHour, setStartHour] = useState('18');
    const [startMinute, setStartMinute] = useState('00');
    const [bookingDate, setBookingDate] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    });
    const [selectedCourtId, setSelectedCourtId] = useState<string>('');
    const [courts, setCourts] = useState<any[]>([]);

    const [organizerError, setOrganizerError] = useState(false);
    const [overlapError, setOverlapError] = useState<string | null>(null);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [pricesByType, setPricesByType] = useState<Record<string, { price_per_hour_cents: number }>>({});
    const [isSaving, setIsSaving] = useState(false);
    
    const [slotPayments, setSlotPayments] = useState<SlotPayment[]>([defaultSlot(), defaultSlot(), defaultSlot(), defaultSlot()]);

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

    useEffect(() => {
        if (!isOpen) return;
        if (clubId) {
            apiFetchWithAuth<any>(`/courts?club_id=${clubId}`).then(res => {
                if (res.ok && res.courts?.length) {
                    setCourts(res.courts);
                    setSelectedCourtId(res.courts[0].id);
                }
            });
            reservationTypePricesService.getByClub(clubId).then(setPricesByType).catch(() => setPricesByType({}));
        }
    }, [isOpen, clubId]);

    const handlePlayerSelect = (p: Player | null, index: number) => {
        if (index === 0) setOrganizer(p);
        else {
            const newAdd = [...additionalPlayers];
            newAdd[index - 1] = p;
            setAdditionalPlayers(newAdd);
        }
        if (p) fetchWalletBalance(p.id, index);
        else updateSlotPayment(index, defaultSlot());
    };

    const effectiveBookingType = matchVisibility === 'public' ? 'open_match' : 'standard';

    const totalPriceCents = useMemo(() => {
        const pricePerHour = pricesByType[effectiveBookingType]?.price_per_hour_cents || pricesByType['standard']?.price_per_hour_cents || 0;
        return Math.round((duration / 60) * pricePerHour);
    }, [pricesByType, duration, effectiveBookingType]);

    const formattedPrice = totalPriceCents != null && totalPriceCents >= 0
        ? (totalPriceCents / 100).toFixed(2).replace('.', ',') + ' €'
        : null;

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

    const computedStatus = totalCollectedCents >= (totalPriceCents ?? 0) && (totalPriceCents ?? 0) > 0 ? 'confirmed' : 'pending_payment';

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
        if (!selectedCourtId) {
            alert('Por favor selecciona una pista');
            return;
        }

        setOrganizerError(false);
        setOverlapError(null);
        setPaymentError(null);

        const activePlayers = [
            organizer ? { name: `${organizer.first_name} ${organizer.last_name}`, slot: slotPayments[0] } : null,
            ...additionalPlayers.map((p, i) => p ? { name: `${p.first_name} ${p.last_name}`, slot: slotPayments[i + 1] } : null),
        ].filter(Boolean) as { name: string; slot: SlotPayment }[];
        
        const missingMethod = activePlayers.find(p => (p.slot.paidAmountCents > 0 || p.slot.walletAmountCents > 0) && !p.slot.paymentMethod);
        if (missingMethod) {
            setPaymentError(`Selecciona la forma de pago para ${missingMethod.name}`);
            return;
        }

        setIsSaving(true);
        try {
            // Create booking
            const bookingData = {
                court_id: selectedCourtId,
                organizer_player_id: organizer.id,
                start_at: `${bookingDate}T${startHour}:${startMinute}:00`,
                end_at: (() => {
                    const startTotalMin = parseInt(startHour) * 60 + parseInt(startMinute) + duration;
                    const endH = String(Math.floor(startTotalMin / 60) % 24).padStart(2, '0');
                    const endM = String(startTotalMin % 60).padStart(2, '0');
                    return `${bookingDate}T${endH}:${endM}:00`;
                })(),
                total_price_cents: totalPriceCents,
                status: computedStatus,
                notes: matchVisibility === 'public' ? 'Partido abierto' : 'Partido privado',
                booking_type: effectiveBookingType,
                source_channel: 'manual',
                participants: buildParticipants(),
                send_email: false,
            };

            const bkRes = await apiFetchWithAuth<any>('/bookings', {
                method: 'POST',
                body: JSON.stringify(bookingData)
            });

            if (!bkRes.ok) throw new Error(bkRes.error || 'Error al crear reserva');

            // Create match
            const matchData = {
                booking_id: bkRes.booking.id,
                visibility: matchVisibility,
                gender: matchGender,
                competitive: isCompetitive,
                type: 'open'
            };

            const mtRes = await apiFetchWithAuth<any>('/matches', {
                method: 'POST',
                body: JSON.stringify(matchData)
            });

            if (!mtRes.ok) throw new Error(mtRes.error || 'Error al crear el partido asociado');

            onClose();
        } catch (err: any) {
            console.error('Error creating match:', err);
            const detail = err?.message || err?.error || String(err);
            setOverlapError(`Error: ${detail}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutes = ['00', '15', '30', '45'];

    return (
        <div style={vvStyle} className="fixed inset-0 z-[250] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative flex flex-col w-full h-[90vh] bg-gray-50 rounded-t-3xl shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-[800px] sm:rounded-2xl animate-slide-up sm:animate-fade-scale-in overflow-hidden">
                <div className="flex justify-center w-full pt-3 pb-1 sm:hidden bg-white cursor-grab active:cursor-grabbing" onClick={onClose}>
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>
                <div className="flex items-start justify-between px-6 py-4 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className="text-xl font-bold text-gray-900 leading-tight">Crear Partido</h2>
                        </div>
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
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">{t('reservation.totalPrice')}</div>
                            <div className="font-mono text-xl font-bold text-gray-900">{formattedPrice || '---'}</div>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto w-full">
                    <div className="p-6 bg-white sm:p-6 pb-24 sm:pb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Detalles del Partido</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Fecha</label>
                                            <input type="date" className="w-full p-2.5 border border-gray-300 rounded-md text-sm focus:ring-[#006A6A] focus:border-[#006A6A]" 
                                                value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-1">Hora inicio</label>
                                                <div className="flex gap-2">
                                                    <select value={startHour} onChange={e => setStartHour(e.target.value)} className="w-full p-2.5 bg-white border border-gray-300 rounded-md text-sm">
                                                        {hours.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                    <select value={startMinute} onChange={e => setStartMinute(e.target.value)} className="w-full p-2.5 bg-white border border-gray-300 rounded-md text-sm">
                                                        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-1">Duración (min)</label>
                                                <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-300 rounded-md text-sm">
                                                    {[30, 60, 90, 120].map(d => <option key={d} value={d}>{d} min</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Pista</label>
                                            <select value={selectedCourtId} onChange={e => setSelectedCourtId(e.target.value)} className="w-full p-2.5 bg-white border border-gray-300 rounded-md text-sm">
                                                {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Género del Partido</label>
                                            <select value={matchGender} onChange={e => setMatchGender(e.target.value as any)} className="w-full p-2.5 bg-white border border-gray-300 rounded-md text-sm">
                                                <option value="any">Cualquiera</option>
                                                <option value="male">Masculino</option>
                                                <option value="female">Femenino</option>
                                                <option value="mixed">Mixto</option>
                                            </select>
                                        </div>

                                        {/* Tipo de partido: Abierto / Privado */}
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Tipo de Partido</label>
                                            <div className="flex rounded-lg overflow-hidden border border-gray-300">
                                                <button
                                                    type="button"
                                                    onClick={() => setMatchVisibility('public')}
                                                    className={`flex-1 py-2.5 text-sm font-bold text-center transition-colors ${
                                                        matchVisibility === 'public'
                                                            ? 'bg-[#006A6A] text-white'
                                                            : 'bg-white text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    🌐 Abierto
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMatchVisibility('private')}
                                                    className={`flex-1 py-2.5 text-sm font-bold text-center transition-colors border-l border-gray-300 ${
                                                        matchVisibility === 'private'
                                                            ? 'bg-[#006A6A] text-white'
                                                            : 'bg-white text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    🔒 Privado
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {matchVisibility === 'public'
                                                    ? 'Visible en la app. Cualquier jugador del rango puede unirse.'
                                                    : 'Solo los jugadores invitados pueden participar.'}
                                            </p>
                                        </div>

                                        {/* Competitivo / Amistoso */}
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Modalidad</label>
                                            <div className="flex rounded-lg overflow-hidden border border-gray-300">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCompetitive(true)}
                                                    className={`flex-1 py-2.5 text-sm font-bold text-center transition-colors ${
                                                        isCompetitive
                                                            ? 'bg-[#006A6A] text-white'
                                                            : 'bg-white text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    🏆 Competitivo
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCompetitive(false)}
                                                    className={`flex-1 py-2.5 text-sm font-bold text-center transition-colors border-l border-gray-300 ${
                                                        !isCompetitive
                                                            ? 'bg-[#006A6A] text-white'
                                                            : 'bg-white text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    🤝 Amistoso
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {isCompetitive
                                                    ? 'Afecta el ranking Elo. Se aplican rangos de nivel.'
                                                    : 'Sin efecto en ranking. No requiere nivelación.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Jugadores</h3>
                                    <div className="space-y-4">
                                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl relative">
                                            <PlayerSearch
                                                label="Organizador"
                                                placeholder={t('reservation.searchPlaceholder')}
                                                selectedPlayer={organizer}
                                                onSelect={(p) => handlePlayerSelect(p, 0)}
                                                required
                                            />
                                            {organizerError && <p className="text-xs text-red-500 mt-1 font-bold">Por favor seleccione un organizador (jugador 1).</p>}
                                            {organizer && (
                                                <PaymentSlot
                                                    slot={slotPayments[0]}
                                                    shareAmountCents={sharePerSlotCents}
                                                    maxPayableCents={totalPriceCents - totalCollectedCents + slotPayments[0].paidAmountCents + slotPayments[0].walletAmountCents}
                                                    onUpdate={(patch) => updateSlotPayment(0, patch)}
                                                    isFullyPaid={totalCollectedCents >= totalPriceCents}
                                                    t={t}
                                                />
                                            )}
                                        </div>
                                        
                                        {additionalPlayers.map((p, i) => (
                                            <div key={i} className="p-4 bg-gray-50 border border-gray-200 rounded-xl relative">
                                                <PlayerSearch
                                                    label={`Jugador ${i + 2} (Opcional)`}
                                                    placeholder={t('reservation.searchPlaceholder')}
                                                    selectedPlayer={p}
                                                    onSelect={(pNew) => handlePlayerSelect(pNew, i + 1)}
                                                />
                                                {p && (
                                                    <PaymentSlot
                                                        slot={slotPayments[i + 1]}
                                                        shareAmountCents={sharePerSlotCents}
                                                        maxPayableCents={totalPriceCents - totalCollectedCents + slotPayments[i+1].paidAmountCents + slotPayments[i+1].walletAmountCents}
                                                        onUpdate={(patch) => updateSlotPayment(i + 1, patch)}
                                                        isFullyPaid={totalCollectedCents >= totalPriceCents}
                                                        t={t}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 sm:p-6 bg-white border-t border-gray-100 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    <button type="button" onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                        Cancelar
                    </button>
                    <button type="button" onClick={handleSave} disabled={isSaving} className="px-8 py-2.5 text-sm font-bold text-white bg-[#006A6A] hover:bg-[#005151] rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
                        {isSaving ? 'Guardando...' : 'Crear Partido'}
                    </button>
                </div>
            </div>
        </div>
    );
};
