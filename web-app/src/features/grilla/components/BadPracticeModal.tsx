import React, { useEffect } from 'react';
import { X, AlertTriangle, ArrowRight, Clock, Lightbulb } from 'lucide-react';
import { useGrillaTranslation } from '../i18n/useGrillaTranslation';
import { useVisualViewportFix } from '../hooks/useVisualViewportFix';

export interface GapWarning {
    courtName: string;
    gapStartTime: string;
    gapEndTime: string;
    gapMinutes: number;
    suggestedTime: string;
    description: string;
}

interface BadPracticeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAcceptAnyway: () => void;
    onMoveToBetter: (suggestedTime: string) => void;
    warnings: GapWarning[];
}

export const BadPracticeModal: React.FC<BadPracticeModalProps> = ({
    isOpen,
    onClose,
    onAcceptAnyway,
    onMoveToBetter,
    warnings
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

    if (!isOpen || warnings.length === 0) return null;

    const mainWarning = warnings[0];

    return (
        <div style={vvStyle} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 transition-opacity duration-300">
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative flex flex-col w-full bg-white rounded-t-3xl shadow-2xl sm:max-w-[520px] sm:rounded-2xl animate-slide-up sm:animate-fade-scale-in overflow-hidden">

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
                        <h2 className="text-lg font-bold text-gray-900 leading-tight">{t('badPractice.title')}</h2>
                        <p className="text-sm text-amber-700 mt-0.5 font-medium">{t('badPractice.subtitle')}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 transition-colors bg-white/80 rounded-full hover:bg-white hover:text-gray-600 shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-5 py-4 space-y-4">

                    {/* Issue description */}
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-red-800 mb-1">{t('badPractice.deadGapDetected')}</p>
                                <p className="text-sm text-red-700 leading-relaxed">
                                    {t('badPractice.deadGapDescription', {
                                        minutes: mainWarning.gapMinutes,
                                        startTime: mainWarning.gapStartTime,
                                        endTime: mainWarning.gapEndTime,
                                        courtName: mainWarning.courtName,
                                    })}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Suggestion */}
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <Lightbulb className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-emerald-800 mb-1">{t('badPractice.suggestion')}</p>
                                <p className="text-sm text-emerald-700 leading-relaxed">
                                    {mainWarning.description}
                                </p>
                                <div className="flex items-center gap-2 mt-2 text-xs font-medium text-emerald-800 bg-emerald-100 rounded-lg px-3 py-1.5 w-fit">
                                    <Clock className="w-3.5 h-3.5" />
                                    {t('badPractice.suggestedTime')} <span className="font-bold">{mainWarning.suggestedTime}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Rule reference */}
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <p className="text-xs text-gray-500 leading-relaxed">
                            <span className="font-semibold text-gray-700">{t('badPractice.optimizationRule')}</span> {t('badPractice.optimizationRuleText')}
                        </p>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-gray-50 border-t border-gray-200 p-4 flex flex-col sm:flex-row gap-2">
                    <button
                        onClick={() => onMoveToBetter(mainWarning.suggestedTime)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
                    >
                        <ArrowRight className="w-4 h-4" />
                        {t('badPractice.moveToTime', { time: mainWarning.suggestedTime })}
                    </button>
                    <button
                        onClick={onAcceptAnyway}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-gray-100 text-gray-600 font-medium text-sm rounded-xl transition-colors border border-gray-200"
                    >
                        {t('badPractice.keepAnyway')}
                    </button>
                </div>

            </div>
        </div>
    );
};
