import React, { useEffect } from 'react';
import { X, AlertTriangle, Clock, Info, Users } from 'lucide-react';
import { useGrillaTranslation } from '../i18n/useGrillaTranslation';
import { useVisualViewportFix } from '../hooks/useVisualViewportFix';
import type { Reservation } from '../types';

interface IncompleteMatchOverrideModalProps {
    isOpen: boolean;
    conflict: Reservation | null;
    isProcessing: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export const IncompleteMatchOverrideModal: React.FC<IncompleteMatchOverrideModalProps> = ({
    isOpen,
    conflict,
    isProcessing,
    onConfirm,
    onClose,
}) => {
    const { t } = useGrillaTranslation();
    const vvStyle = useVisualViewportFix(isOpen);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    if (!isOpen || !conflict) return null;

    const playerCount = conflict.detailedPlayers?.length ?? (conflict.playerName ? 1 : 0);

    return (
        <div style={vvStyle} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 transition-opacity duration-300">
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative flex flex-col w-full bg-white rounded-t-3xl shadow-2xl sm:max-w-[500px] sm:rounded-2xl animate-slide-up sm:animate-fade-scale-in overflow-hidden">

                {/* Mobile drag indicator */}
                <div className="flex justify-center w-full pt-3 pb-1 sm:hidden cursor-grab" onClick={onClose}>
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-start gap-4 px-5 pt-4 pb-3 bg-amber-50 border-b border-amber-100">
                    <div className="p-2.5 bg-amber-100 rounded-xl shrink-0 mt-0.5">
                        <AlertTriangle className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-bold text-gray-900 leading-tight">{t('override.title')}</h2>
                        <p className="text-sm text-amber-700 mt-0.5 font-medium">{t('override.subtitle')}</p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isProcessing}
                        className="p-2 text-gray-400 transition-colors bg-white/80 rounded-full hover:bg-white hover:text-gray-600 shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-5 py-4 space-y-4">

                    {/* Conflict Info Box */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-blue-800 mb-1">
                                    {conflict.courtName} — {conflict.startTime}
                                </p>
                                <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-blue-800 bg-blue-100 rounded-lg px-3 py-1.5 w-fit">
                                    <Users className="w-3.5 h-3.5" />
                                    {t('override.matchInfo', { players: playerCount })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Warning Box */}
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-red-800 mb-1">Consecuencia del cambio</p>
                                <p className="text-sm text-red-700 leading-relaxed">
                                    {t('override.consequence')}
                                </p>
                                <p className="text-xs text-red-600 mt-2 font-medium">
                                    {t('override.emailNote')}
                                </p>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="bg-gray-50 border-t border-gray-200 p-4 flex flex-col sm:flex-row gap-2">
                    <button
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
                    >
                        {isProcessing ? 'Procesando...' : t('override.confirmButton')}
                    </button>
                    <button
                        onClick={onClose}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-gray-100 text-gray-600 font-medium text-sm rounded-xl transition-colors border border-gray-200"
                    >
                        {t('override.cancelButton')}
                    </button>
                </div>

            </div>
        </div>
    );
};
