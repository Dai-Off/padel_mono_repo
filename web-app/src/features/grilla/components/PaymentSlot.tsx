import React from 'react';
import { Wallet } from 'lucide-react';
import type { PaymentMethod } from '../types';
import {
    centsToEuroInput,
    formatEuroLabel,
    parseEuroInputToCents,
    sanitizeEuroInput,
} from '../utils/moneyInput';

export interface SlotPayment {
    paidAmountCents: number;
    paymentMethod: PaymentMethod;
    walletAmountCents: number;
    walletBalanceCents: number | null;
    walletLoading: boolean;
}

export const defaultSlotPayment = (): SlotPayment => ({
    paidAmountCents: 0,
    paymentMethod: null,
    walletAmountCents: 0,
    walletBalanceCents: null,
    walletLoading: false,
});

export const PaymentSlot: React.FC<{
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
        setRawInput((prev) => {
            if (parseEuroInputToCents(prev) === effectiveAmountCents) return prev;
            return centsToEuroInput(effectiveAmountCents);
        });
    }, [effectiveAmountCents]);

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isLocked) return;
        const raw = sanitizeEuroInput(e.target.value);
        setRawInput(raw);
        const clamped = Math.min(parseEuroInputToCents(raw), maxPayableCents);
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
                    {t('reservation.shareAmount', { amount: formatEuroLabel(shareAmountCents) })}
                </span>
                <input
                    type="text"
                    inputMode="decimal"
                    value={rawInput}
                    onChange={handleAmountChange}
                    disabled={isLocked}
                    placeholder="0 €"
                    className={`w-24 p-1.5 border border-gray-300 rounded-md text-xs bg-white outline-none focus:ring-2 focus:ring-[#006A6A] ${isLocked ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}`}
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
