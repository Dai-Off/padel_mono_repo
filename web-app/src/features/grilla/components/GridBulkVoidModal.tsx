import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { apiFetch, apiFetchWithAuth } from '../../../services/api';
import type { Reservation } from '../types';
import { isMaintenanceReservation, reservationCheckboxLabel } from '../utils/gridSelectUtils';

type Props = {
    reservations: Reservation[];
    onClose: () => void;
    onDone: () => void;
};

export const GridBulkVoidModal: React.FC<Props> = ({ reservations, onClose, onDone }) => {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<{ ok: number; failed: string[] } | null>(null);

    const groups = useMemo(() => {
        const maintenance = reservations.filter(isMaintenanceReservation);
        const tournaments = reservations.filter((r) => r.booking_type === 'tournament');
        const bookings = reservations.filter(
            (r) => !isMaintenanceReservation(r) && r.booking_type !== 'tournament',
        );
        return { maintenance, tournaments, bookings };
    }, [reservations]);

    const handleConfirm = async () => {
        setSaving(true);
        setError(null);
        const failed: string[] = [];
        let ok = 0;

        const cancelSimple = async (id: string) => {
            const res = await apiFetchWithAuth<any>(`/bookings/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ status: 'cancelled' }),
            });
            if (!res.ok) throw new Error(res.error || 'No se pudo cancelar');
        };

        const cancelWithRefund = async (id: string) => {
            const res = await apiFetch<any>(`/bookings/${id}`, {
                method: 'DELETE',
                body: JSON.stringify({ apply_refund: true }),
            });
            if (!res.ok) {
                if (res.code === 'cash_refund_required') {
                    throw new Error('Requiere indicar reembolso en efectivo (abre el turno individual)');
                }
                throw new Error(res.error || 'No se pudo cancelar');
            }
        };

        try {
            for (const r of [...groups.maintenance, ...groups.tournaments]) {
                try {
                    await cancelSimple(r.id);
                    ok += 1;
                } catch (e) {
                    failed.push(`${reservationCheckboxLabel(r)}: ${(e as Error).message}`);
                }
            }
            for (const r of groups.bookings) {
                try {
                    await cancelWithRefund(r.id);
                    ok += 1;
                } catch (e) {
                    failed.push(`${reservationCheckboxLabel(r)}: ${(e as Error).message}`);
                }
            }
            setResults({ ok, failed });
            if (ok > 0) onDone();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                            <Trash2 className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-[#1A1A1A]">Anular selección</h2>
                            <p className="text-xs text-gray-500 mt-0.5">{reservations.length} elemento{reservations.length === 1 ? '' : 's'}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-50">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {results ? (
                        <>
                            <p className="text-sm text-gray-600">
                                Se anularon {results.ok} elemento{results.ok === 1 ? '' : 's'}.
                            </p>
                            {results.failed.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1 max-h-32 overflow-y-auto">
                                    {results.failed.map((f) => (
                                        <p key={f}>{f}</p>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600">
                                Los turnos con pago aplicarán la política de reembolso del club. Mantenimiento y torneos se cancelan sin reembolso.
                            </p>
                            <ul className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs space-y-1 max-h-48 overflow-y-auto">
                                {reservations.map((r) => (
                                    <li key={r.id} className="flex justify-between gap-2">
                                        <span className="font-semibold truncate">{r.courtName} · {r.startTime}</span>
                                        <span className="text-gray-500 shrink-0">{reservationCheckboxLabel(r)}</span>
                                    </li>
                                ))}
                            </ul>
                            {groups.bookings.length > 0 && (
                                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>
                                        {groups.bookings.length} turno{groups.bookings.length === 1 ? '' : 's'} con posible reembolso. Si alguno tiene pago en efectivo, puede requerir cancelación individual.
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>

                <div className="p-4 border-t border-gray-100 flex gap-2 justify-end bg-gray-50/80">
                    {results ? (
                        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A1A1A]">
                            Cerrar
                        </button>
                    ) : (
                        <>
                            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold bg-white">
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleConfirm()}
                                disabled={saving}
                                className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                            >
                                {saving ? 'Anulando...' : 'Confirmar anulación'}
                            </button>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};
