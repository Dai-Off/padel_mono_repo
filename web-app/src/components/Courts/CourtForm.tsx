import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { Court } from '../../types/court';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface CourtFormProps {
    court?: Court;
    onClose: () => void;
    onSubmit: (data: Partial<Court>) => void;
}

export const CourtForm = ({ court, onClose, onSubmit }: CourtFormProps) => {
    const { t } = useTranslation();
    const isEdit = !!court;

    const { register, handleSubmit, reset, formState: { errors } } = useForm<Partial<Court>>({
        defaultValues: court || {
            name: '',
            indoor: false,
            glass_type: 'Cristal Panorámico',
            status: 'operational',
            lighting: true,
            last_maintenance: new Date().toISOString().split('T')[0],
            club_id: 'default-club-id'
        }
    });

    useEffect(() => {
        if (court) {
            reset(court);
        }
    }, [court, reset]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/20 backdrop-blur-sm animate-fadein">
            <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border-subtle overflow-hidden animate-fadeInUp">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-background">
                    <h3 className="font-bold text-primary">
                        {isEdit ? t('edit_court') : t('add_court')}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-muted-foreground"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                            {t('name')}
                        </label>
                        <input
                            {...register('name', { required: t('required') })}
                            placeholder={t('placeholder_name')}
                            className="w-full px-4 py-2.5 rounded-xl border border-border-subtle focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-[#FAFAFA] text-sm font-medium transition-all"
                        />
                        {errors.name && <span className="text-[10px] text-error font-bold">{errors.name.message}</span>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                                {t('glass_type')}
                            </label>
                            <select
                                {...register('glass_type')}
                                className="w-full px-4 py-2.5 rounded-xl border border-border-subtle focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-[#FAFAFA] text-sm font-medium transition-all appearance-none cursor-pointer"
                            >
                                <option value="Cristal Panorámico">{t('glass_panoramic')}</option>
                                <option value="Cristal Estándar">{t('glass_standard')}</option>
                                <option value="Muro">{t('glass_wall')}</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                                {t('status')}
                            </label>
                            <select
                                {...register('status')}
                                className="w-full px-4 py-2.5 rounded-xl border border-border-subtle focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-[#FAFAFA] text-sm font-medium transition-all appearance-none cursor-pointer"
                            >
                                <option value="operational">{t('operational')}</option>
                                <option value="maintenance">{t('maintenance')}</option>
                                <option value="closed">{t('closed')}</option>
                            </select>
                        </div>
                    </div>

                    {/* Indoor Toggle */}
                    <div className="flex items-center justify-between p-4 bg-[#FAFAFA] rounded-xl border border-border-subtle">
                        <div className="space-y-0.5">
                            <span className="text-sm font-bold text-primary">{t('indoor')}</span>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase">{t('indoor_desc')}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                {...register('indoor')}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
                        </label>
                    </div>

                    {/* Lighting Toggle */}
                    <div className="flex items-center justify-between p-4 bg-[#FAFAFA] rounded-xl border border-border-subtle">
                        <div className="space-y-0.5">
                            <span className="text-sm font-bold text-primary">{t('lighting')}</span>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase">{t('lighting_led_desc')}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                {...register('lighting')}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
                        </label>
                    </div>

                    {/* Last Maintenance Date */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                            {t('last_maintenance')}
                        </label>
                        <input
                            type="date"
                            {...register('last_maintenance')}
                            className="w-full px-4 py-2.5 rounded-xl border border-border-subtle focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-[#FAFAFA] text-sm font-medium transition-all"
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="flex gap-3 pt-4 border-t border-border-subtle">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 border border-border-subtle rounded-xl text-xs font-bold text-primary hover:bg-gray-50 transition-colors"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-2.5 bg-brand text-white rounded-xl text-xs font-bold hover:opacity-90 transition-opacity shadow-sm shadow-brand/20"
                        >
                            {isEdit ? t('save') : t('add_court')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
