import { motion } from 'framer-motion';
import { SquarePen, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Court } from '../../types/court';

function PulseDot({ color }: { color: string }) {
    return (
        <span className="relative flex h-2.5 w-2.5">
            <span
                className="absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: color }}
            />
            <span
                className="relative inline-flex rounded-full h-2.5 w-2.5 animate-pulse"
                style={{ backgroundColor: color }}
            />
        </span>
    );
}

interface CourtCardProps {
    court: Court;
    onEdit: (court: Court) => void;
    onDelete?: (id: string) => void;
}

function formatMaintenance(value: string | null | undefined): string {
    if (!value) return '—';
    try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return '—';
    }
}

export const CourtCard = ({ court, onEdit, onDelete }: CourtCardProps) => {
    const { t } = useTranslation();

    const statusConfig: Record<string, { color: string; label: string; dotColor: string }> = {
        operational: {
            color: 'bg-green-50 border-green-100',
            label: t('operational'),
            dotColor: '#22C55E',
        },
        maintenance: {
            color: 'bg-amber-50 border-amber-100',
            label: t('maintenance'),
            dotColor: '#F59E0B',
        },
        closed: {
            color: 'bg-red-50 border-red-100',
            label: t('closed'),
            dotColor: '#E31E24',
        },
    };

    const cfg = statusConfig[court.status] ?? statusConfig.operational;
    const glassLabel = court.glass_type === 'panoramic' ? t('glass_panoramic') : t('glass_standard');

    return (
        <motion.article
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.25 }}
        >
            <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[#1A1A1A]">{court.name}</h3>
                    <div
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 border ${cfg.color}`}
                    >
                        <PulseDot color={cfg.dotColor} />
                        {cfg.label}
                    </div>
                </div>
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">{t('type')}</span>
                        <span className="text-xs font-semibold text-[#1A1A1A]">Pádel</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">{t('glass_type')}</span>
                        <span className="text-xs font-semibold text-[#1A1A1A]">{glassLabel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">{t('location')}</span>
                        <span className="text-xs font-semibold text-[#1A1A1A]">
                            {court.indoor ? t('indoor') : t('outdoor')}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">{t('lighting')}</span>
                        <span className="text-xs font-semibold text-[#1A1A1A]">
                            {court.lighting ? t('yes') : t('no')}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">{t('last_maintenance')}</span>
                        <span className="text-xs font-semibold text-[#1A1A1A]">
                            {formatMaintenance(court.last_maintenance)}
                        </span>
                    </div>
                </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
                <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    className="flex-1 px-3 py-2.5 bg-[#1A1A1A] text-white rounded-xl text-xs font-bold hover:opacity-90 transition-opacity"
                >
                    {t('view_details')}
                </motion.button>
                <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onEdit(court)}
                    className="w-10 h-10 border border-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-400 hover:text-[#1A1A1A]"
                >
                    <SquarePen className="w-4 h-4" />
                </motion.button>
                {onDelete && (
                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onDelete(court.id)}
                        className="w-10 h-10 border border-gray-100 rounded-xl flex items-center justify-center hover:bg-red-50 transition-colors text-gray-400 hover:text-red-600"
                    >
                        <Trash2 className="w-4 h-4" />
                    </motion.button>
                )}
            </div>
        </motion.article>
    );
};
