import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Wrench, Trophy, AlertTriangle } from 'lucide-react';
import { apiFetchWithAuth, HttpError } from '../../../services/api';
import { zonedTimeToUtc } from '../../../lib/clubTimeZone';
import {
    findSlotConflict,
    mergeSlotsToRanges,
    minutesToTimeStr,
    collectMaintenanceBookingsForSlots,
    type GridSlot,
    type SlotConflict,
} from '../utils/gridMarqueeSelection';
import type { Reservation } from '../types';

export type BulkBlockMode = 'maintenance' | 'tournament';

type Props = {
    dateStr: string;
    slots: GridSlot[];
    reservations: Reservation[];
    gridStartHour: number;
    mode?: BulkBlockMode;
    onClose: () => void;
    onDone: () => void;
};

export const BulkSlotMaintenanceModal: React.FC<Props> = ({
    dateStr,
    slots,
    reservations,
    gridStartHour,
    mode = 'maintenance',
    onClose,
    onDone,
}) => {
    const isTournament = mode === 'tournament';
    const cfg = isTournament
        ? {
            title: 'Reservar para torneo',
            icon: <Trophy className="w-5 h-5 text-[#b45309]" />,
            iconBg: 'bg-amber-50',
            bookingType: 'tournament' as const,
            reasonPlaceholder: 'Ej. Nombre del torneo, categoría...',
            defaultReason: 'Torneo',
            intro: 'Se reservarán los horarios seleccionados para el torneo. Las reservas existentes en esos slots no se cancelan ni acortan automáticamente.',
            confirmLabel: 'Reservar selección',
            confirmClass: 'bg-[#b45309] hover:bg-[#92400e]',
            doneNoun: 'reserva',
        }
        : {
            title: 'Bloqueo por mantenimiento',
            icon: <Wrench className="w-5 h-5 text-amber-700" />,
            iconBg: 'bg-amber-50',
            bookingType: 'blocked' as const,
            reasonPlaceholder: 'Ej. Cambio de césped, reparación...',
            defaultReason: 'Mantenimiento',
            intro: 'Se bloquearán los horarios seleccionados. Las reservas existentes en esos slots no se cancelan ni acortan automáticamente.',
            confirmLabel: 'Bloquear selección',
            confirmClass: 'bg-amber-600 hover:bg-amber-700',
            doneNoun: 'bloqueo',
        };

    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedCount, setSavedCount] = useState(0);
    const [skippedServer, setSkippedServer] = useState<{ court_id: string; start_at: string; end_at: string; error: string }[]>([]);
    const [mergedCount, setMergedCount] = useState(0);
    const [lastAction, setLastAction] = useState<'block' | 'unblock' | null>(null);
    const [done, setDone] = useState(false);

    const conflicts = useMemo(() => {
        const list: SlotConflict[] = [];
        const seen = new Set<string>();
        for (const slot of slots) {
            const key = `${slot.courtId}:${slot.startMins}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const c = findSlotConflict(slot, reservations, gridStartHour);
            if (c) list.push(c);
        }
        return list;
    }, [slots, reservations, gridStartHour]);

    const conflictKeys = useMemo(
        () => new Set(conflicts.map((c) => `${c.slot.courtId}:${c.slot.startMins}`)),
        [conflicts],
    );

    const maintenanceConflictKeys = useMemo(
        () => new Set(
            conflicts
                .filter((c) => c.reason === 'Ya bloqueado por mantenimiento')
                .map((c) => `${c.slot.courtId}:${c.slot.startMins}`),
        ),
        [conflicts],
    );

    const validSlots = useMemo(
        () => slots.filter((s) => {
            const key = `${s.courtId}:${s.startMins}`;
            if (!conflictKeys.has(key)) return true;
            if (!isTournament && maintenanceConflictKeys.has(key)) return true;
            return false;
        }),
        [slots, conflictKeys, maintenanceConflictKeys, isTournament],
    );

    const ranges = useMemo(() => mergeSlotsToRanges(validSlots), [validSlots]);

    const maintenanceBookings = useMemo(
        () => collectMaintenanceBookingsForSlots(slots, reservations, gridStartHour),
        [slots, reservations, gridStartHour],
    );

    const prettyDate = (() => {
        try {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
            });
        } catch { return dateStr; }
    })();

    const createBlock = async (range: ReturnType<typeof mergeSlotsToRanges>[number]) => {
        const startTime = minutesToTimeStr(range.startMins);
        const endTime = minutesToTimeStr(range.endMins);
        return {
            court_id: range.courtId,
            start_at: zonedTimeToUtc(`${dateStr}T${startTime}:00`).toISOString(),
            end_at: zonedTimeToUtc(`${dateStr}T${endTime}:00`).toISOString(),
        };
    };

    const handleSave = async () => {
        if (ranges.length === 0) {
            setError('No hay slots válidos. Revisa los conflictos.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const payloadRanges = await Promise.all(ranges.map((r) => createBlock(r)));
            const trimmedReason = reason.trim() || cfg.defaultReason;
            const result = await apiFetchWithAuth<{ ok: boolean; created?: number; merged?: number; skipped?: typeof skippedServer; error?: string }>(
                '/bookings/bulk-block-slots',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        ranges: payloadRanges,
                        booking_type: cfg.bookingType,
                        reason: trimmedReason,
                    }),
                },
            );
            const created = result.created ?? 0;
            if (created === 0) {
                setError(result.error || 'No se pudo crear ningún registro. Puede haber conflictos de horario.');
                return;
            }
            setSavedCount(created);
            setMergedCount(result.merged ?? 0);
            setSkippedServer(result.skipped ?? []);
            setLastAction('block');
            setDone(true);
            onDone();
        } catch (e) {
            const msg = e instanceof HttpError ? e.message : (e as Error)?.message;
            setError(msg || 'No se pudo completar la operación');
        } finally {
            setSaving(false);
        }
    };

    const handleUnblock = async () => {
        if (maintenanceBookings.length === 0) return;
        setSaving(true);
        setError(null);
        try {
            let ok = 0;
            for (const booking of maintenanceBookings) {
                try {
                    await apiFetchWithAuth(`/bookings/${booking.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ status: 'cancelled' }),
                    });
                    ok += 1;
                } catch {
                    // continue
                }
            }
            if (ok === 0) {
                setError('No se pudo anular ningún bloqueo de mantenimiento.');
                return;
            }
            setSavedCount(ok);
            setLastAction('unblock');
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
                        <div className={`w-10 h-10 rounded-xl ${cfg.iconBg} flex items-center justify-center`}>
                            {cfg.icon}
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-[#1A1A1A]">{cfg.title}</h2>
                            <p className="text-xs text-gray-500 mt-0.5">{prettyDate} · {slots.length} slots</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-50">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {done ? (
                        <div className="text-sm text-gray-600 space-y-2">
                            <p>
                                {lastAction === 'unblock'
                                    ? `Se anularon ${savedCount} bloqueo${savedCount === 1 ? '' : 's'} de mantenimiento.`
                                    : `Se crearon ${savedCount} ${cfg.doneNoun}${savedCount === 1 ? '' : 's'} correctamente${mergedCount > 0 ? ` (${mergedCount} ampliado${mergedCount === 1 ? '' : 's'})` : ''}.`}
                            </p>
                            {lastAction === 'block' && skippedServer.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1 max-h-32 overflow-y-auto">
                                    <p className="font-bold">{skippedServer.length} tramo{skippedServer.length === 1 ? '' : 's'} no se aplicaron:</p>
                                    {skippedServer.slice(0, 8).map((s, i) => (
                                        <p key={`${s.court_id}-${i}`}>{s.error}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600">
                                {cfg.intro}
                            </p>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 max-h-36 overflow-y-auto text-xs space-y-1">
                                {mergeSlotsToRanges(slots).map((r) => (
                                    <div key={`${r.courtId}-${r.startMins}`} className="flex justify-between gap-2">
                                        <span className="font-semibold text-gray-800 truncate">{r.courtName}</span>
                                        <span className="text-gray-500 shrink-0">
                                            {minutesToTimeStr(r.startMins)} – {minutesToTimeStr(r.endMins)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                    Motivo (opcional)
                                </label>
                                <input
                                    type="text"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder={cfg.reasonPlaceholder}
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#1A1A1A]"
                                />
                            </div>
                        </>
                    )}

                    {conflicts.length > 0 && !done && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                            <div className="flex items-center gap-2 text-amber-900">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span className="text-xs font-bold uppercase tracking-wider">
                                    {conflicts.filter((c) => !maintenanceConflictKeys.has(`${c.slot.courtId}:${c.slot.startMins}`)).length} slot{conflicts.length === 1 ? '' : 's'} con conflicto
                                </span>
                            </div>
                            <ul className="space-y-1 max-h-28 overflow-y-auto">
                                {conflicts
                                    .filter((c) => !maintenanceConflictKeys.has(`${c.slot.courtId}:${c.slot.startMins}`))
                                    .slice(0, 12)
                                    .map((c) => (
                                    <li key={`${c.slot.courtId}-${c.slot.startMins}`} className="text-xs text-amber-900 flex justify-between gap-2">
                                        <span className="truncate">{c.slot.courtName} · {minutesToTimeStr(c.slot.startMins)}</span>
                                        <span className="text-amber-700 shrink-0">{c.reason}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-[11px] text-amber-800">
                                Puedes guardar solo los slots sin conflicto ({validSlots.length} válidos).
                                {!isTournament && maintenanceConflictKeys.size > 0 && ' Los tramos ya en mantenimiento se ampliarán.'}
                            </p>
                        </div>
                    )}

                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>

                <div className="p-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end bg-gray-50/80 shrink-0">
                    {done ? (
                        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A1A1A] hover:opacity-90">
                            Cerrar
                        </button>
                    ) : (
                        <>
                            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#1A1A1A] bg-white hover:bg-gray-50 disabled:opacity-50">
                                Cancelar
                            </button>
                            {!isTournament && maintenanceBookings.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => void handleUnblock()}
                                    disabled={saving}
                                    className="px-4 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 bg-white hover:bg-red-50 disabled:opacity-50"
                                >
                                    {saving ? 'Anulando...' : 'Anular lo seleccionado'}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={saving || validSlots.length === 0}
                                className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 ${cfg.confirmClass}`}
                            >
                                {saving ? 'Guardando...' : conflicts.length > 0 ? 'Guardar solo las válidas' : cfg.confirmLabel}
                            </button>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};
