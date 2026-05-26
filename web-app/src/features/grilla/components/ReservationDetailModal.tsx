import React from 'react';
import { X, Pencil, Banknote, CreditCard, Wallet } from 'lucide-react';
import clsx from 'clsx';
import type { Reservation } from '../types';
import { useGrillaTranslation } from '../i18n/useGrillaTranslation';
import {
    averageElo,
    getReservationEndTime,
    isReservationPaid,
    isReservationPartiallyPaid,
} from '../utils/reservationListFilters';

type Props = {
    reservation: Reservation | null;
    dateStr: string;
    onClose: () => void;
    onEdit: (bookingId: string) => void;
};

export const ReservationDetailModal: React.FC<Props> = ({
    reservation,
    dateStr,
    onClose,
    onEdit,
}) => {
    const { t } = useGrillaTranslation();
    if (!reservation) return null;

    const typeLabel = (type: string) => {
        const key = `reservation.type_${type}`;
        const translated = t(key);
        return translated !== key ? translated : type;
    };

    const total = reservation.totalPrice ?? 0;
    const paid = (reservation.totalPaidCents ?? 0) / 100;
    const pending = Math.max(0, total - paid);
    const elo = averageElo(reservation);

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">{t('reservationsList.detailTitle')}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{dateStr} · {reservation.courtName}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
                    <DetailSection title={t('reservationsList.detailSchedule')}>
                        <DetailRow label={t('reservationsList.colTime')}>
                            {reservation.startTime} – {getReservationEndTime(reservation)} ({reservation.durationMinutes} min)
                        </DetailRow>
                        <DetailRow label={t('reservationsList.colCourt')}>{reservation.courtName ?? '—'}</DetailRow>
                        <DetailRow label={t('reservationsList.colType')}>{typeLabel(reservation.booking_type)}</DetailRow>
                        <DetailRow label={t('reservationsList.colSource')}>{reservation.source_channel ?? '—'}</DetailRow>
                    </DetailSection>

                    <DetailSection title={t('reservationsList.colClient')}>
                        <p className="font-semibold text-gray-900">{reservation.playerName || '—'}</p>
                        {reservation.matchType && (
                            <p className="text-gray-600 mt-1">{reservation.matchType}</p>
                        )}
                        {reservation.notes && (
                            <p className="text-gray-500 mt-2 text-xs whitespace-pre-wrap">{reservation.notes}</p>
                        )}
                    </DetailSection>

                    <DetailSection title={t('reservationsList.detailPayment')}>
                        <DetailRow label={t('reservationsList.colPrice')}>
                            {total > 0 ? `${total.toFixed(2)} €` : '—'}
                        </DetailRow>
                        <DetailRow label={t('reservationsList.detailPaid')}>
                            <span className={paid > 0 ? 'text-emerald-700 font-semibold' : ''}>
                                {paid > 0 ? `${paid.toFixed(2)} €` : '0,00 €'}
                            </span>
                        </DetailRow>
                        <DetailRow label={t('reservationsList.detailPending')}>
                            <span className={pending > 0 ? 'text-red-600 font-semibold' : 'text-emerald-700'}>
                                {pending.toFixed(2)} €
                            </span>
                        </DetailRow>
                        <DetailRow label={t('reservationsList.colPayment')}>
                            <span className={clsx(
                                'font-semibold',
                                isReservationPaid(reservation) && 'text-emerald-700',
                                isReservationPartiallyPaid(reservation) && 'text-amber-700',
                                !isReservationPaid(reservation) && !isReservationPartiallyPaid(reservation) && 'text-red-600',
                            )}>
                                {isReservationPaid(reservation)
                                    ? t('reservationsList.paid')
                                    : isReservationPartiallyPaid(reservation)
                                        ? t('reservationsList.partial')
                                        : t('reservationsList.unpaid')}
                            </span>
                        </DetailRow>
                        <DetailRow label={t('reservationsList.colStatus')}>{reservation.status}</DetailRow>
                    </DetailSection>

                    {reservation.detailedPlayers && reservation.detailedPlayers.length > 0 && (
                        <DetailSection title={`${t('reservation.players')} (${reservation.detailedPlayers.length})`}>
                            {elo != null && (
                                <p className="text-xs text-gray-500 mb-2">
                                    {t('reservationsList.colElo')}: <span className="font-mono font-semibold">{elo.toFixed(2)}</span>
                                </p>
                            )}
                            <ul className="space-y-2">
                                {reservation.detailedPlayers.map((p, idx) => (
                                    <li key={idx} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold flex items-center justify-center shrink-0">
                                                {p.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                                            </span>
                                            <div className="min-w-0">
                                                <span className="font-medium text-gray-900 truncate block">{p.name}</span>
                                                <span className="text-[11px] text-gray-500">Elo {p.level.toFixed(2)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {p.paymentMethod === 'cash' && <Banknote className="w-3.5 h-3.5 text-gray-400" />}
                                            {p.paymentMethod === 'card' && <CreditCard className="w-3.5 h-3.5 text-gray-400" />}
                                            {p.paymentMethod === 'wallet' && <Wallet className="w-3.5 h-3.5 text-gray-400" />}
                                            <span className={clsx('text-xs font-semibold', p.paidAmount > 0 ? 'text-emerald-700' : 'text-gray-400')}>
                                                {p.paidAmount > 0 ? `${p.paidAmount.toFixed(2)} €` : '—'}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </DetailSection>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg border border-gray-200"
                    >
                        {t('reservation.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onEdit(reservation.id);
                            onClose();
                        }}
                        className="px-4 py-2 text-sm font-semibold text-white bg-[#006A6A] hover:bg-[#005555] rounded-lg flex items-center gap-1.5"
                    >
                        <Pencil className="w-4 h-4" />
                        {t('reservation.edit')}
                    </button>
                </div>
            </div>
        </div>
    );
};

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{title}</h4>
            <div className="space-y-1.5">{children}</div>
        </section>
    );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-4">
            <span className="text-gray-500 shrink-0">{label}</span>
            <span className="text-gray-900 text-right font-medium">{children}</span>
        </div>
    );
}
