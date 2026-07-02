import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Wrench, AlertTriangle } from 'lucide-react';
import { apiFetchWithAuth, HttpError } from '../../../services/api';
import {
    mergeSlotsToRanges,
    minutesToTimeStr,
    type GridSlot,
} from '../utils/gridMarqueeSelection';
import type { Reservation } from '../types';

type Props = {
    slots: GridSlot[];
    bookings: Reservation[];
    onClose: () => void;
    onDone: () => void;
};

export const BulkUnblockMaintenanceModal: React.FC<Props> = ({
    slots,
    bookings,
    onClose,
    onDone,
}) => {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedCount, setSavedCount] = useState(0);
    const [done, setDone] = useState(false);

    const ranges = useMemo(() => mergeSlotsToRanges(slots), [slots]);

    const handleSave = async () => {
        if (bookings.length === 0) return;
        setSaving(true);
        setError(null);
        let ok = 0;
        try {
            for (const booking of bookings) {
                try {
                    await apiFetchWithAuth(`/bookings/${booking.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ status: 'cancelled' }),
                    });
                    ok += 1;
                } catch {
                    // continue with others
                }
            }
            if (ok === 0) {
                setError('No se pudo anular ningún bloqueo de mantenimiento.');
                return;
            }
            setSavedCount(ok);
            setDone(true);
            onDone();
        } catch (e) {
            const msg = e instanceof HttpError ? e.message : (e as Error)?.message;
            setError(msg || 'No se pudo anular el mantenimiento');
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between p-5 border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                            <Wrench className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-[#1A1A1A]">Anular mantenimiento</h2>
                            <p className="text-xs text-gray-500 mt-0.5">{bookings.length} bloqueo{bookings.length === 1 ? '' : 's'}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-50">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {done ? (
                        <p className="text-sm text-gray-600">
                            Se anularon {savedCount} bloqueo{savedCount === 1 ? '' : 's'} de mantenimiento. Las pistas vuelven a estar disponibles en esos horarios.
                        </p>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600">
                                Se cancelarán los bloqueos de mantenimiento seleccionados. Las reservas de jugadores no se modifican.
                            </p>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 max-h-40 overflow-y-auto text-xs space-y-1">
                                {ranges.map((r) => (
                                    <div key={`${r.courtId}-${r.startMins}`} className="flex justify-between gap-2">
                                        <span className="font-semibold text-gray-800 truncate">{r.courtName}</span>
                                        <span className="text-gray-500 shrink-0">
                                            {minutesToTimeStr(r.startMins)} – {minutesToTimeStr(r.endMins)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {bookings.length > 1 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                                    <div className="flex items-center gap-2 font-bold uppercase tracking-wider mb-1">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        Varios bloqueos
                                    </div>
                                    Se anularán {bookings.length} reservas de bloqueo distintas que cubren la selección.
                                </div>
                            )}
                        </>
                    )}
                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>

                <div className="p-4 border-t border-gray-100 flex gap-2 justify-end bg-gray-50/80 shrink-0">
                    {done ? (
                        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A1A1A] hover:opacity-90">
                            Cerrar
                        </button>
                    ) : (
                        <>
                            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#1A1A1A] bg-white hover:bg-gray-50 disabled:opacity-50">
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={saving}
                                className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                            >
                                {saving ? 'Anulando...' : 'Anular mantenimiento'}
                            </button>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};
