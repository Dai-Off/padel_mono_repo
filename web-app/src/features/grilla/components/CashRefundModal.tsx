import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Banknote, Wallet, X } from 'lucide-react';
import { apiFetchWithAuth } from '../../../services/api';
import { REFUND_PERCENT_OPTIONS } from '../../../services/clubBookingPolicies';

export type CashRefundDisposition = 'cash_hand' | 'wallet';

export type CashRefundPlayer = {
    player_id: string;
    first_name: string;
    last_name: string;
    cash_amount_cents: number;
};

export type CashRefundMap = Record<string, CashRefundDisposition>;

export type CashRefundConfirmPayload = {
    cashRefunds: CashRefundMap;
    applyRefund: boolean;
    refundPercent: number;
};

type RefundPreviewResponse = {
    ok?: boolean;
    cash_players?: CashRefundPlayer[];
    has_refundable_payments?: boolean;
    policy_eligible?: boolean;
    admin_can_choose_percent?: boolean;
    refund_eligible?: boolean;
    policy_message?: string;
    suggested_refund_percent?: number;
    incomplete_public_exempt?: boolean;
    error?: string;
};

interface CashRefundModalProps {
    isOpen: boolean;
    bookingId: string;
    playerId?: string;
    title: string;
    subtitle: string;
    confirmLabel: string;
    onClose: () => void;
    onConfirm: (payload: CashRefundConfirmPayload) => Promise<void>;
    onNoCashPlayers?: (payload: CashRefundConfirmPayload) => void;
    /** Si true, nunca auto-ejecuta: siempre muestra confirmación (cancelación de reserva completa). */
    requireConfirmation?: boolean;
    externalSubmitting?: boolean;
}

function formatEuros(cents: number): string {
    return `€${(cents / 100).toFixed(2)}`;
}

export const CashRefundModal: React.FC<CashRefundModalProps> = ({
    isOpen,
    bookingId,
    playerId,
    title,
    subtitle,
    confirmLabel,
    onClose,
    onConfirm,
    onNoCashPlayers,
    requireConfirmation = false,
    externalSubmitting = false,
}) => {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const busy = submitting || externalSubmitting;
    const [players, setPlayers] = useState<CashRefundPlayer[]>([]);
    const [choices, setChoices] = useState<CashRefundMap>({});
    const [hasRefundablePayments, setHasRefundablePayments] = useState(true);
    const [policyEligible, setPolicyEligible] = useState(false);
    const [adminCanChoosePercent, setAdminCanChoosePercent] = useState(false);
    const [refundPercent, setRefundPercent] = useState<number>(100);
    const [policyMessage, setPolicyMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const autoConfirmedRef = useRef(false);
    const onNoCashPlayersRef = useRef(onNoCashPlayers);
    onNoCashPlayersRef.current = onNoCashPlayers;

    useEffect(() => {
        if (!isOpen) {
            autoConfirmedRef.current = false;
            return;
        }
        if (!bookingId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        const qs = playerId ? `?player_id=${encodeURIComponent(playerId)}` : '';
        apiFetchWithAuth<RefundPreviewResponse>(`/bookings/${bookingId}/refund-preview${qs}`)
            .then((res) => {
                if (cancelled) return;
                const hasPayments = res.has_refundable_payments !== false;
                const withinPolicy = res.policy_eligible === true;
                const canChoosePercent = res.admin_can_choose_percent === true;
                const autoFullRefund = res.refund_eligible === true;
                const suggested = res.suggested_refund_percent ?? (autoFullRefund ? 100 : 0);

                setHasRefundablePayments(hasPayments);
                setPolicyEligible(withinPolicy);
                setAdminCanChoosePercent(canChoosePercent);
                setRefundPercent(suggested);
                setPolicyMessage(res.policy_message?.trim() || null);
                const list = res.cash_players ?? [];
                setPlayers(list);
                const initial: CashRefundMap = {};
                for (const p of list) {
                    initial[p.player_id] = 'cash_hand';
                }
                setChoices(initial);

                const payload: CashRefundConfirmPayload = {
                    cashRefunds: {},
                    applyRefund: suggested > 0,
                    refundPercent: suggested,
                };
                const needsModal = hasPayments && (canChoosePercent || list.length > 0);
                if (!requireConfirmation && !needsModal && !autoConfirmedRef.current) {
                    autoConfirmedRef.current = true;
                    void Promise.resolve(onNoCashPlayersRef.current?.(payload));
                }
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'No se pudo cargar la información de pagos');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, bookingId, playerId, requireConfirmation]);

    if (!isOpen) return null;

    const needsModal =
        hasRefundablePayments && (adminCanChoosePercent || players.length > 0);
    const showSimpleConfirm = requireConfirmation && !loading && !needsModal;

    if (busy) {
        return (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-[#006A6A] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium text-gray-700">Procesando cancelación...</span>
                </div>
            </div>
        );
    }

    if (!loading && !needsModal && !showSimpleConfirm) {
        return null;
    }

    const applyRefund = refundPercent > 0;
    const showCashChoices = applyRefund && players.length > 0;
    const allChosen =
        !showCashChoices ||
        players.every((p) => choices[p.player_id] === 'cash_hand' || choices[p.player_id] === 'wallet');

    const handleConfirm = async () => {
        if (!allChosen) {
            setError('Selecciona qué hacer con el efectivo de cada jugador.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await onConfirm({
                cashRefunds: showCashChoices ? choices : {},
                applyRefund,
                refundPercent: policyEligible ? 100 : refundPercent,
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al procesar');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => !submitting && onClose()}
        >
            <div
                className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                {loading && (
                    <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center z-10">
                        <div className="w-8 h-8 border-4 border-[#006A6A] border-t-transparent rounded-full animate-spin" />
                        <span className="mt-3 text-sm font-medium text-gray-600">Revisando pagos y política de cancelación...</span>
                    </div>
                )}

                <div className="flex items-start justify-between p-5 border-b border-gray-100">
                    <div className="flex gap-3">
                        <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                adminCanChoosePercent ? 'bg-red-50' : 'bg-amber-50'
                            }`}
                        >
                            <AlertTriangle
                                className={`w-5 h-5 ${adminCanChoosePercent ? 'text-red-600' : 'text-amber-600'}`}
                            />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 leading-tight">{title}</h3>
                            <p
                                className={`text-sm mt-1 font-medium ${
                                    adminCanChoosePercent ? 'text-red-800' : 'text-amber-800'
                                }`}
                            >
                                {adminCanChoosePercent
                                    ? 'Fuera del plazo de reembolso del club'
                                    : policyEligible
                                      ? 'Dentro del plazo: reembolso completo automático'
                                      : subtitle}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => !submitting && onClose()}
                        className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">
                    {showSimpleConfirm && !hasRefundablePayments && (
                        <p className="text-sm text-gray-700">
                            No hay pagos registrados en esta reserva. Se cancelará sin reembolso.
                        </p>
                    )}
                    {showSimpleConfirm && hasRefundablePayments && policyEligible && (
                        <p className="text-sm text-gray-700">
                            Dentro del plazo de cancelación: se reembolsará el 100% a cada jugador que haya pagado.
                        </p>
                    )}
                    {showSimpleConfirm && hasRefundablePayments && !policyEligible && (
                        <p className="text-sm text-gray-700">
                            Fuera del plazo de reembolso. Se cancelará sin devolución.
                        </p>
                    )}

                    {adminCanChoosePercent && policyMessage && (
                        <p className="text-sm text-gray-700 leading-relaxed">{policyMessage}</p>
                    )}

                    {adminCanChoosePercent && (
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                                Porcentaje de reembolso
                            </p>
                            <div className="grid grid-cols-5 gap-1.5">
                                {REFUND_PERCENT_OPTIONS.map((pct) => (
                                    <button
                                        key={pct}
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => setRefundPercent(pct)}
                                        className={`px-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                                            refundPercent === pct
                                                ? 'border-[#006A6A] bg-[#006A6A]/10 text-[#006A6A]'
                                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {pct}%
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-500">
                                Fuera del plazo de la política podés elegir un reembolso parcial o ninguno.
                            </p>
                        </div>
                    )}

                    {showCashChoices && (
                        <>
                            <p className="text-sm text-gray-600">
                                Efectivo en mostrador ({policyEligible ? 100 : refundPercent}% del importe). Indica si
                                devuelves en mano o acreditas al monedero.
                            </p>
                            <div className="space-y-3">
                                {players.map((p) => {
                                    const name = `${p.first_name} ${p.last_name}`.trim() || 'Jugador';
                                    const selected = choices[p.player_id] ?? 'cash_hand';
                                    const pct = policyEligible ? 100 : refundPercent;
                                    const displayCents = Math.round((p.cash_amount_cents * pct) / 100);
                                    return (
                                        <div key={p.player_id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-semibold text-sm text-gray-900">{name}</span>
                                                <span className="text-sm font-bold text-[#006A6A]">
                                                    {formatEuros(displayCents)}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    disabled={submitting}
                                                    onClick={() =>
                                                        setChoices((prev) => ({ ...prev, [p.player_id]: 'cash_hand' }))
                                                    }
                                                    className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold border transition-colors ${
                                                        selected === 'cash_hand'
                                                            ? 'border-amber-500 bg-amber-50 text-amber-900'
                                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <Banknote className="w-3.5 h-3.5" />
                                                    Efectivo
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={submitting}
                                                    onClick={() =>
                                                        setChoices((prev) => ({ ...prev, [p.player_id]: 'wallet' }))
                                                    }
                                                    className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold border transition-colors ${
                                                        selected === 'wallet'
                                                            ? 'border-[#006A6A] bg-[#006A6A]/10 text-[#006A6A]'
                                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <Wallet className="w-3.5 h-3.5" />
                                                    Monedero
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
                </div>

                <div className="p-5 border-t border-gray-100 flex gap-2">
                    <button
                        type="button"
                        disabled={submitting}
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                        Volver
                    </button>
                    <button
                        type="button"
                        disabled={submitting || loading || !allChosen}
                        onClick={handleConfirm}
                        className={`flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-lg disabled:opacity-50 ${
                            !applyRefund ? 'bg-red-600 hover:bg-red-700' : 'bg-[#006A6A] hover:bg-[#005151]'
                        }`}
                    >
                        {submitting ? 'Procesando...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
