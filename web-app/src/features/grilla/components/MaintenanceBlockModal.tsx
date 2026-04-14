import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Wrench, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { apiFetchWithAuth, HttpError } from '../../../services/api';
import { START_HOUR, END_HOUR } from '../utils/timeGrid';

interface Props {
    courtId: string;
    courtName: string;
    dateStr: string;
    existingBlockId?: string;
    existingReason?: string;
    onClose: () => void;
    onDone: () => void;
}

interface Relocation {
    booking_id: string;
    to_court: string;
    start_at: string;
    end_at: string;
    player_name: string;
}

interface ConflictDetail {
    bookingId: string;
    startAt: string;
    endAt: string;
    playerName: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtTime = (iso: string) => iso.slice(11, 16);

export const MaintenanceBlockModal: React.FC<Props> = ({ courtId, courtName, dateStr, existingBlockId, existingReason, onClose, onDone }) => {
    const isUnblock = !!existingBlockId;
    const [reason, setReason] = useState(existingReason || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);
    const [relocated, setRelocated] = useState<Relocation[]>([]);
    const [done, setDone] = useState(false);

    const prettyDate = (() => {
        try {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
            });
        } catch { return dateStr; }
    })();

    const handleBlock = async () => {
        setSaving(true);
        setError(null);
        setConflicts([]);
        try {
            const body = { court_id: courtId, date: dateStr, reason: reason.trim() || undefined };
            const result = await apiFetchWithAuth<any>('/bookings/block-maintenance', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            if (result.relocated?.length) {
                setRelocated(result.relocated);
            }
            setDone(true);
            onDone();
        } catch (e: any) {
            if (e instanceof HttpError && Array.isArray(e.data?.conflicts)) {
                setConflicts(e.data.conflicts as ConflictDetail[]);
                setError(e.message);
            } else {
                setError(e?.message || 'No se pudo bloquear la pista');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleUnblock = async () => {
        setSaving(true);
        setError(null);
        try {
            await apiFetchWithAuth(`/bookings/${existingBlockId}`, {
                method: 'PUT',
                body: JSON.stringify({ status: 'cancelled' }),
            });
            onDone();
            onClose();
        } catch (e: any) {
            setError(e?.message || 'No se pudo desbloquear la pista');
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
                className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            done ? 'bg-emerald-50' : isUnblock ? 'bg-emerald-50' : 'bg-amber-50'
                        }`}>
                            <Wrench className={`w-5 h-5 ${
                                done ? 'text-emerald-700' : isUnblock ? 'text-emerald-700' : 'text-amber-700'
                            }`} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-[#1A1A1A]">
                                {done ? 'Pista bloqueada' : isUnblock ? 'Desbloquear pista' : 'Bloquear pista por mantenimiento'}
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">{courtName} · {prettyDate}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 rounded-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-50">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* ── Success: show relocated bookings ── */}
                    {done ? (
                        <>
                            <p className="text-sm text-gray-600">
                                La pista ha sido bloqueada correctamente para el día completo ({pad2(START_HOUR)}:00 – {pad2(END_HOUR)}:00).
                            </p>
                            {relocated.length > 0 && (
                                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-2">
                                    <div className="flex items-center gap-2 text-blue-800">
                                        <ArrowRightLeft className="w-4 h-4" />
                                        <span className="text-xs font-bold uppercase tracking-wider">
                                            {relocated.length} reserva{relocated.length > 1 ? 's' : ''} reubicada{relocated.length > 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <ul className="space-y-1">
                                        {relocated.map((r) => (
                                            <li key={r.booking_id} className="text-xs text-blue-900 flex justify-between">
                                                <span className="font-medium">{r.player_name}</span>
                                                <span className="text-blue-600">{fmtTime(r.start_at)}–{fmtTime(r.end_at)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    ) : isUnblock ? (
                        <p className="text-sm text-gray-600">
                            Esta pista está bloqueada por mantenimiento{existingReason ? `: "${existingReason}"` : ''}. Al desbloquearla, los jugadores podrán volver a reservar.
                        </p>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600">
                                Se creará una reserva de bloqueo que ocupará todo el día ({pad2(START_HOUR)}:00 – {pad2(END_HOUR)}:00). Los jugadores no podrán reservar esta pista en esa fecha.
                            </p>
                            <p className="text-xs text-gray-500">
                                Si la pista tiene reservas existentes, se intentarán reubicar automáticamente en otras pistas libres en el mismo horario.
                            </p>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                    Motivo (opcional)
                                </label>
                                <input
                                    type="text"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Ej. Cambio de césped, reparación de luces..."
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#1A1A1A]"
                                />
                            </div>
                        </>
                    )}

                    {/* ── Conflict error: bookings that can't be moved ── */}
                    {conflicts.length > 0 && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                            <div className="flex items-center gap-2 text-red-800">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">
                                    Reservas sin pista alternativa
                                </span>
                            </div>
                            <ul className="space-y-1">
                                {conflicts.map((c) => (
                                    <li key={c.bookingId} className="text-xs text-red-900 flex justify-between">
                                        <span className="font-medium">{c.playerName}</span>
                                        <span className="text-red-600">{fmtTime(c.startAt)}–{fmtTime(c.endAt)}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-[11px] text-red-700 mt-1">
                                Reubica o cancela estas reservas manualmente antes de bloquear.
                            </p>
                        </div>
                    )}

                    {error && conflicts.length === 0 && <p className="text-xs text-red-600">{error}</p>}
                </div>

                <div className="p-4 border-t border-gray-100 flex gap-2 justify-end bg-gray-50/80">
                    {done ? (
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A1A1A] hover:opacity-90"
                        >
                            Cerrar
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={saving}
                                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#1A1A1A] bg-white hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            {isUnblock ? (
                                <button
                                    type="button"
                                    onClick={handleUnblock}
                                    disabled={saving}
                                    className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {saving ? 'Desbloqueando...' : 'Desbloquear pista'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleBlock}
                                    disabled={saving}
                                    className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
                                >
                                    {saving ? 'Bloqueando...' : 'Bloquear día'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};
