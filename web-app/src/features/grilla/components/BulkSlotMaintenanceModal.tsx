import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Wrench, Trophy, Sparkles, AlertTriangle, ExternalLink, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetchWithAuth, HttpError } from '../../../services/api';
import { reservationTypePricesService } from '../../../services/reservationTypePrices';
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

export type BulkBlockMode = 'maintenance' | 'tournament' | 'custom';

export type ReservationTypeConfig = { color: string | null; display_name: string; is_system: boolean };

type Props = {
    dateStr: string;
    slots: GridSlot[];
    reservations: Reservation[];
    gridStartHour: number;
    mode?: BulkBlockMode;
    typeConfigs?: Record<string, ReservationTypeConfig>;
    clubId?: string | null;
    onTypeConfigsChange?: (configs: Record<string, ReservationTypeConfig>) => void;
    onClose: () => void;
    onDone: () => void;
};

export const BulkSlotMaintenanceModal: React.FC<Props> = ({
    dateStr,
    slots,
    reservations,
    gridStartHour,
    mode = 'maintenance',
    typeConfigs,
    clubId,
    onTypeConfigsChange,
    onClose,
    onDone,
}) => {
    const navigate = useNavigate();
    const isTournament = mode === 'tournament';
    const isCustom = mode === 'custom';

    const [localTypeConfigs, setLocalTypeConfigs] = useState(typeConfigs);
    const effectiveTypeConfigs = localTypeConfigs ?? typeConfigs;

    // Tipos ofrecidos en modo personalizado: los custom del club (Precios) + clase particular.
    const customTypeOptions = useMemo(() => {
        const opts: { value: string; label: string }[] = [];
        for (const [type, cfgEntry] of Object.entries(effectiveTypeConfigs ?? {})) {
            if (!cfgEntry.is_system && type.startsWith('custom_')) {
                opts.push({ value: type, label: cfgEntry.display_name || type });
            }
        }
        opts.sort((a, b) => a.label.localeCompare(b.label, 'es'));
        opts.push({ value: 'school_individual', label: effectiveTypeConfigs?.school_individual?.display_name || 'Clase particular' });
        return opts;
    }, [effectiveTypeConfigs]);

    const [customType, setCustomType] = useState(() => customTypeOptions[0]?.value ?? 'school_individual');
    const customTypeLabel = customTypeOptions.find((o) => o.value === customType)?.label ?? 'Reservado';

    const [showCreateType, setShowCreateType] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');
    const [newTypeColor, setNewTypeColor] = useState('#0f766e');
    const [creatingType, setCreatingType] = useState(false);

    const cfg = isTournament
        ? {
            title: 'Reservar para torneo',
            icon: <Trophy className="w-5 h-5 text-[#b45309]" />,
            iconBg: 'bg-amber-50',
            bookingType: 'tournament',
            reasonPlaceholder: 'Ej. Nombre del torneo, categoría...',
            defaultReason: 'Torneo',
            intro: 'Se reservarán los horarios seleccionados para el torneo. Las reservas existentes en esos slots no se cancelan ni acortan automáticamente.',
            confirmLabel: 'Reservar selección',
            confirmClass: 'bg-[#b45309] hover:bg-[#92400e]',
            doneNoun: 'reserva',
        }
        : isCustom
        ? {
            title: 'Reserva personalizada',
            icon: <Sparkles className="w-5 h-5 text-[#0f766e]" />,
            iconBg: 'bg-teal-50',
            bookingType: customType,
            reasonPlaceholder: 'Ej. Escuela infantil, cumpleaños, fiesta...',
            defaultReason: customTypeLabel,
            intro: 'Se reservarán los horarios seleccionados con el tipo elegido (escuela, fiestas, cumpleaños...). Las reservas existentes en esos slots no se cancelan ni acortan automáticamente.',
            confirmLabel: 'Reservar selección',
            confirmClass: 'bg-[#0f766e] hover:bg-[#115e59]',
            doneNoun: 'reserva',
        }
        : {
            title: 'Bloqueo por mantenimiento',
            icon: <Wrench className="w-5 h-5 text-amber-700" />,
            iconBg: 'bg-amber-50',
            bookingType: 'blocked',
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
    const [displacedCount, setDisplacedCount] = useState(0);
    const [lastAction, setLastAction] = useState<'block' | 'unblock' | null>(null);
    const [done, setDone] = useState(false);
    const [displaceIncomplete, setDisplaceIncomplete] = useState(false);

    const courtNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const s of slots) map.set(s.courtId, s.courtName);
        return map;
    }, [slots]);

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

    const incompleteConflictKeys = useMemo(
        () => new Set(
            conflicts
                .filter((c) => c.displaceableIncomplete)
                .map((c) => `${c.slot.courtId}:${c.slot.startMins}`),
        ),
        [conflicts],
    );

    const incompleteBookings = useMemo(() => {
        const map = new Map<string, Reservation>();
        for (const c of conflicts) {
            if (c.displaceableIncomplete) map.set(c.reservation.id, c.reservation);
        }
        return [...map.values()];
    }, [conflicts]);

    const isMaintenance = mode === 'maintenance';
    const validSlots = useMemo(
        () => slots.filter((s) => {
            const key = `${s.courtId}:${s.startMins}`;
            if (!conflictKeys.has(key)) return true;
            if (isMaintenance && maintenanceConflictKeys.has(key)) return true;
            if (displaceIncomplete && incompleteConflictKeys.has(key)) return true;
            return false;
        }),
        [slots, conflictKeys, maintenanceConflictKeys, incompleteConflictKeys, isMaintenance, displaceIncomplete],
    );

    const ranges = useMemo(() => mergeSlotsToRanges(validSlots), [validSlots]);
    const allRanges = useMemo(() => mergeSlotsToRanges(slots), [slots]);
    const skippedCourtIds = useMemo(() => {
        const validCourtIds = new Set(ranges.map((r) => r.courtId));
        return allRanges.filter((r) => !validCourtIds.has(r.courtId)).map((r) => r.courtName);
    }, [allRanges, ranges]);

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

    const handleCreateType = async () => {
        if (!clubId || !newTypeName.trim()) {
            setError('Indica un nombre para el tipo de reserva');
            return;
        }
        setCreatingType(true);
        setError(null);
        try {
            const prices = await reservationTypePricesService.createCustomType(clubId, {
                display_name: newTypeName.trim(),
                color: newTypeColor,
            });
            const nextConfigs: Record<string, ReservationTypeConfig> = {};
            let createdSlug = '';
            for (const [type, entry] of Object.entries(prices)) {
                nextConfigs[type] = {
                    color: entry.color ?? null,
                    display_name: entry.display_name ?? type,
                    is_system: entry.is_system ?? false,
                };
                if (!entry.is_system && entry.display_name?.toLowerCase() === newTypeName.trim().toLowerCase()) {
                    createdSlug = type;
                }
            }
            setLocalTypeConfigs(nextConfigs);
            onTypeConfigsChange?.(nextConfigs);
            if (createdSlug) setCustomType(createdSlug);
            setNewTypeName('');
            setShowCreateType(false);
        } catch (e) {
            setError((e as Error)?.message || 'No se pudo crear el tipo');
        } finally {
            setCreatingType(false);
        }
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
            const result = await apiFetchWithAuth<{ ok: boolean; created?: number; merged?: number; displaced?: number; skipped?: typeof skippedServer; error?: string }>(
                '/bookings/bulk-block-slots',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        ranges: payloadRanges,
                        booking_type: cfg.bookingType,
                        reason: trimmedReason,
                        displace_incomplete: displaceIncomplete && incompleteBookings.length > 0,
                    }),
                },
            );
            const created = result.created ?? 0;
            if (created === 0) {
                setError(result.error || 'No se pudo crear ningún registro. Puede haber conflictos de horario.');
                setSkippedServer(result.skipped ?? []);
                setDisplacedCount(result.displaced ?? 0);
                return;
            }
            setSavedCount(created);
            setMergedCount(result.merged ?? 0);
            setDisplacedCount(result.displaced ?? 0);
            setSkippedServer(result.skipped ?? []);
            setLastAction('block');
            setDone(true);
            onDone();
        } catch (e) {
            if (e instanceof HttpError) {
                const skipped = Array.isArray(e.data?.skipped)
                    ? (e.data!.skipped as typeof skippedServer)
                    : [];
                if (skipped.length > 0) setSkippedServer(skipped);
                if (typeof e.data?.displaced === 'number') setDisplacedCount(e.data.displaced as number);
                setError(e.message || 'No se pudo completar la operación');
            } else {
                setError((e as Error)?.message || 'No se pudo completar la operación');
            }
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
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
                            <p className="text-xs text-gray-500 mt-0.5">{prettyDate} · {slots.length} slots · {allRanges.length} pista{allRanges.length === 1 ? '' : 's'}</p>
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
                                    : `Se crearon ${savedCount} ${cfg.doneNoun}${savedCount === 1 ? '' : 's'} correctamente${mergedCount > 0 ? ` (${mergedCount} ampliado${mergedCount === 1 ? '' : 's'})` : ''}${displacedCount > 0 ? `. Se reembolsaron y cancelaron ${displacedCount} turno${displacedCount === 1 ? '' : 's'} incompleto${displacedCount === 1 ? '' : 's'}` : ''}.`}
                            </p>
                            {lastAction === 'block' && skippedServer.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1 max-h-40 overflow-y-auto">
                                    <p className="font-bold">{skippedServer.length} tramo{skippedServer.length === 1 ? '' : 's'} no se aplicaron:</p>
                                    {skippedServer.slice(0, 12).map((s, i) => (
                                        <p key={`${s.court_id}-${i}`}>
                                            <span className="font-semibold">{courtNameById.get(s.court_id) || s.court_id}</span>
                                            {' · '}
                                            {s.error}
                                        </p>
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
                                {allRanges.map((r) => {
                                    const willSkip = skippedCourtIds.includes(r.courtName) && !ranges.some((vr) => vr.courtId === r.courtId);
                                    const hasValid = ranges.some((vr) => vr.courtId === r.courtId && vr.startMins === r.startMins);
                                    return (
                                        <div key={`${r.courtId}-${r.startMins}`} className={`flex justify-between gap-2 ${!hasValid ? 'opacity-50' : ''}`}>
                                            <span className="font-semibold text-gray-800 truncate">{r.courtName}</span>
                                            <span className="text-gray-500 shrink-0">
                                                {minutesToTimeStr(r.startMins)} – {minutesToTimeStr(r.endMins)}
                                                {willSkip || !hasValid ? ' (omitida)' : ''}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            {isCustom && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Tipo de reserva
                                    </label>
                                    <select
                                        value={customType}
                                        onChange={(e) => setCustomType(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#1A1A1A]"
                                    >
                                        {customTypeOptions.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowCreateType((v) => !v)}
                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0f766e] hover:underline"
                                        >
                                            <Plus className="w-3 h-3" />
                                            Crear tipo aquí
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => navigate('/precios')}
                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:underline"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                            Ir a Precios
                                        </button>
                                    </div>
                                    {showCreateType && (
                                        <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 space-y-2">
                                            <input
                                                type="text"
                                                value={newTypeName}
                                                onChange={(e) => setNewTypeName(e.target.value)}
                                                placeholder="Ej. Cumpleaños, Escuela..."
                                                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#1A1A1A]"
                                            />
                                            <div className="flex items-center gap-2">
                                                <label className="text-[11px] text-gray-500">Color</label>
                                                <input
                                                    type="color"
                                                    value={newTypeColor}
                                                    onChange={(e) => setNewTypeColor(e.target.value)}
                                                    className="h-8 w-10 rounded border border-gray-200 cursor-pointer"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={creatingType || !newTypeName.trim() || !clubId}
                                                    onClick={() => void handleCreateType()}
                                                    className="ml-auto px-3 py-1.5 rounded-lg bg-[#0f766e] text-white text-xs font-bold disabled:opacity-50"
                                                >
                                                    {creatingType ? 'Creando...' : 'Crear y usar'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                    {isCustom ? 'Etiqueta (opcional)' : 'Motivo (opcional)'}
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
                            {incompleteBookings.length > 0 && (
                                <label className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-white/70 p-2.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5"
                                        checked={displaceIncomplete}
                                        onChange={(e) => setDisplaceIncomplete(e.target.checked)}
                                    />
                                    <span className="text-[11px] text-amber-950 leading-snug">
                                        <span className="font-bold">Reembolsar turno incompleto</span>
                                        {' — '}
                                        Cancelar {incompleteBookings.length} turno{incompleteBookings.length === 1 ? '' : 's'} incompleto{incompleteBookings.length === 1 ? '' : 's'} (devolver importe a jugadores) y crear el bloque sobre ese horario.
                                    </span>
                                </label>
                            )}
                            <p className="text-[11px] text-amber-800">
                                {displaceIncomplete && incompleteBookings.length > 0
                                    ? `Se creará en ${validSlots.length} slot${validSlots.length === 1 ? '' : 's'} (incluye reembolso de incompletos).`
                                    : `Puedes guardar solo los slots sin conflicto (${validSlots.length} válidos).`}
                                {isMaintenance && maintenanceConflictKeys.size > 0 && ' Los tramos ya en mantenimiento se ampliarán.'}
                            </p>
                        </div>
                    )}

                    {error && <p className="text-xs text-red-600">{error}</p>}
                    {!done && skippedServer.length > 0 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1 max-h-40 overflow-y-auto">
                            <p className="font-bold">{skippedServer.length} tramo{skippedServer.length === 1 ? '' : 's'} no se aplicaron:</p>
                            {skippedServer.slice(0, 12).map((s, i) => (
                                <p key={`${s.court_id}-${i}`}>
                                    <span className="font-semibold">{courtNameById.get(s.court_id) || s.court_id}</span>
                                    {' · '}
                                    {s.error}
                                </p>
                            ))}
                        </div>
                    )}
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
                            {isMaintenance && maintenanceBookings.length > 0 && (
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
                                {saving
                                    ? 'Guardando...'
                                    : displaceIncomplete && incompleteBookings.length > 0
                                      ? 'Reembolsar y crear'
                                      : conflicts.length > 0
                                        ? 'Guardar solo las válidas'
                                        : cfg.confirmLabel}
                            </button>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};
