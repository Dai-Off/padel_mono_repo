import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Court } from '../../types/court';

function formatMaintenance(value: string | null | undefined, locale: string): string {
    if (!value) return '—';
    try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString(locale === 'es' ? 'es-ES' : locale === 'zh' ? 'zh-CN' : 'en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return '—';
    }
}

type Props = {
    court: Court;
    onClose: () => void;
    onEdit?: (court: Court) => void;
};

export function CourtDetailModal({ court, onClose, onEdit }: Props) {
    const { t, i18n } = useTranslation();

    const statusStyles: Record<string, string> = {
        operational: 'bg-emerald-50 text-emerald-800 border-emerald-100',
        maintenance: 'bg-amber-50 text-amber-900 border-amber-100',
        closed: 'bg-red-50 text-red-800 border-red-100',
    };
    const statusLabels: Record<string, string> = {
        operational: t('operational'),
        maintenance: t('maintenance'),
        closed: t('closed'),
    };
    const glassLabel = court.glass_type === 'panoramic' ? t('glass_panoramic') : t('glass_standard');

    const rows: { label: string; value: string }[] = [
        { label: t('type'), value: 'Pádel' },
        { label: t('glass_type'), value: glassLabel },
        { label: t('location'), value: court.indoor ? t('indoor') : t('outdoor') },
        { label: t('lighting'), value: court.lighting ? t('yes') : t('no') },
        { label: t('last_maintenance'), value: formatMaintenance(court.last_maintenance, i18n.language) },
    ];
    if (typeof court.display_order === 'number') {
        rows.push({ label: t('court_display_order'), value: String(court.display_order + 1) });
    }

    return (
        <motion.div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="court-detail-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                className="w-full sm:max-w-md max-h-[85dvh] sm:max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-gray-100"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b border-gray-100">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('court_detail_title')}</p>
                        <h2 id="court-detail-title" className="text-lg font-black text-[#1A1A1A] truncate">
                            {court.name}
                        </h2>
                        <span
                            className={`inline-flex mt-2 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${statusStyles[court.status] ?? statusStyles.operational}`}
                        >
                            {statusLabels[court.status] ?? statusLabels.operational}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-shrink-0 w-10 h-10 rounded-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-[#1A1A1A] transition-colors"
                        aria-label={t('close')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-0">
                    {rows.map((row) => (
                        <div
                            key={row.label}
                            className="flex items-center justify-between gap-4 py-3 border-b border-gray-50 last:border-0"
                        >
                            <span className="text-xs text-gray-400 font-medium">{row.label}</span>
                            <span className="text-sm font-semibold text-[#1A1A1A] text-right">{row.value}</span>
                        </div>
                    ))}
                    <div className="pt-2 mt-1">
                        <p className="text-[10px] text-gray-300 font-mono break-all">ID · {court.id}</p>
                    </div>
                </div>
                <div className="p-4 pt-2 border-t border-gray-100 flex flex-col sm:flex-row gap-2 sm:justify-end bg-gray-50/80">
                    {onEdit && (
                        <button
                            type="button"
                            onClick={() => {
                                onEdit(court);
                                onClose();
                            }}
                            className="w-full sm:w-auto order-2 sm:order-1 px-4 py-3 sm:py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#1A1A1A] bg-white hover:bg-gray-50"
                        >
                            {t('edit_court')}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full sm:w-auto order-1 sm:order-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A1A1A] hover:opacity-90"
                    >
                        {t('close')}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
