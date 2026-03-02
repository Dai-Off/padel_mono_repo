import { SquarePen, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Court } from '../../types/court';

interface CourtCardProps {
    court: Court;
    onEdit: (court: Court) => void;
    onDelete?: (id: string) => void;
}

export const CourtCard = ({
    court,
    onEdit,
    onDelete
}: CourtCardProps) => {
    const { t } = useTranslation();

    const statusConfig = {
        operational: {
            label: t('operational'),
            classes: 'bg-green-50 text-green-700 border-green-100',
            dot: 'bg-green-500'
        },
        maintenance: {
            label: t('maintenance'),
            classes: 'bg-amber-50 text-warning border-warning/10',
            dot: 'bg-warning'
        },
        closed: {
            label: t('closed'),
            classes: 'bg-red-50 text-error border-error/10',
            dot: 'bg-error'
        }
    };

    const config = statusConfig[court.status] || statusConfig.operational;

    return (
        <article className="bg-card rounded-2xl border border-border-subtle overflow-hidden">
            <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-primary">{court.name}</h3>
                    <div className={`px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 border ${config.classes}`}>
                        <span className="relative flex h-2.5 w-2.5">
                            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${config.dot}`}></span>
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${config.dot}`}></span>
                        </span>
                        {config.label}
                    </div>
                </div>

                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">{t('type')}</span>
                        <span className="text-xs font-semibold text-primary">Pádel</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">{t('glass_type')}</span>
                        <span className="text-xs font-semibold text-primary">
                            {court.glass_type === 'Cristal Panorámico' ? t('glass_panoramic') :
                                court.glass_type === 'Cristal Estándar' ? t('glass_standard') :
                                    court.glass_type === 'Muro' ? t('glass_wall') : court.glass_type}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">{t('location')}</span>
                        <span className="text-xs font-semibold text-primary">{court.indoor ? t('indoor') : t('outdoor')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">{t('lighting')}</span>
                        <span className="text-xs font-semibold text-primary">{court.lighting ? t('led_pro') : t('no')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">{t('last_maintenance')}</span>
                        <span className="text-xs font-semibold text-primary">{court.last_maintenance}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">ID Pista</span>
                        <span className="text-xs font-semibold text-primary">{court.id.split('-')[0]}</span>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
                <button className="flex-1 px-3 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-colors shadow-sm">
                    {t('view_details')}
                </button>
                <button
                    onClick={() => onEdit(court)}
                    className="w-10 h-10 border border-border-subtle rounded-xl flex items-center justify-center hover:bg-gray-50 transition-colors group"
                >
                    <SquarePen className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                </button>
                {onDelete && (
                    <button
                        onClick={() => onDelete(court.id)}
                        className="w-10 h-10 border border-border-subtle rounded-xl flex items-center justify-center hover:bg-red-50 transition-colors group"
                    >
                        <Trash2 className="w-4 h-4 text-muted-foreground group-hover:text-error" />
                    </button>
                )}
            </div>
        </article>
    );
};
