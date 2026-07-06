import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import type { Reservation } from '../types';

export type MaintenanceCancelScope = 'single' | 'all';

type Props = {
    target: Reservation;
    related: Reservation[];
    onClose: () => void;
    onConfirm: (scope: MaintenanceCancelScope) => Promise<void>;
};

export const MaintenanceCancelScopeModal: React.FC<Props> = ({
    target,
    related,
    onClose,
    onConfirm,
}) => {
    const [scope, setScope] = useState<MaintenanceCancelScope>('single');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const endLabel = (() => {
        const [h, m] = target.startTime.split(':').map(Number);
        const total = h * 60 + m + target.durationMinutes;
        const eh = Math.floor(total / 60) % 24;
        const em = total % 60;
        return `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
    })();

    const handleConfirm = async () => {
        setSaving(true);
        setError(null);
        try {
            await onConfirm(scope);
        } catch (e) {
            setError((e as Error).message || 'No se pudo anular');
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between p-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-[#1A1A1A]">Cancelación de reservas</h2>
                        <p className="text-sm text-gray-600 mt-1">¿Qué reservas desea cancelar?</p>
                    </div>
                    <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-50">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-200 p-3 hover:bg-gray-50">
                        <input
                            type="radio"
                            name="cancel-scope"
                            checked={scope === 'single'}
                            onChange={() => setScope('single')}
                            className="mt-1 accent-[#006A6A]"
                        />
                        <span className="text-sm text-gray-800">
                            <span className="font-bold">Sólo esta reserva</span>
                            <span className="block text-xs text-gray-500 mt-0.5">
                                {target.courtName} · {target.startTime} – {endLabel}
                            </span>
                        </span>
                    </label>

                    {related.length > 0 && (
                        <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-200 p-3 hover:bg-gray-50">
                            <input
                                type="radio"
                                name="cancel-scope"
                                checked={scope === 'all'}
                                onChange={() => setScope('all')}
                                className="mt-1 accent-[#006A6A]"
                            />
                            <span className="text-sm text-gray-800">
                                <span className="font-bold">
                                    Esta reserva y las {related.length} reserva{related.length === 1 ? '' : 's'} asociadas
                                </span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    Mismo horario ({target.startTime} – {endLabel}) en otras pistas
                                </span>
                                <span className="block text-[11px] text-gray-400 mt-1 line-clamp-3">
                                    {related.map((r) => r.courtName).join(', ')}
                                </span>
                            </span>
                        </label>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 flex gap-2 justify-end bg-gray-50/80">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2.5 rounded-xl border border-[#006A6A] text-sm font-semibold text-[#006A6A] bg-white hover:bg-[#006A6A]/5 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleConfirm()}
                        disabled={saving}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#006A6A] hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? 'Anulando...' : 'Aceptar'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
