import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { Court, CourtVisibilityWindow } from '../../types/court';
import type { MeResponse } from '../../types/auth';
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clubService, type Club } from '../../services/club';
import { authService } from '../../services/auth';

interface CourtFormProps {
    court?: Court;
    onClose: () => void;
    onSubmit: (data: Partial<Court>) => void;
}

export const CourtForm = ({ court, onClose, onSubmit }: CourtFormProps) => {
    const { t } = useTranslation();
    const isEdit = !!court;
    const [clubs, setClubs] = useState<Club[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [clubsReady, setClubsReady] = useState(false);

    const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<Partial<Court>>({
        defaultValues: court || {
            name: '',
            club_id: '',
            indoor: false,
            glass_type: 'normal',
            status: 'operational',
            lighting: true,
            last_maintenance: new Date().toISOString().split('T')[0],
            is_hidden: false,
        }
    });

    const [windowsText, setWindowsText] = useState('');
    const [windowsError, setWindowsError] = useState('');

    useEffect(() => {
        if (court?.visibility_windows != null && Array.isArray(court.visibility_windows)) {
            setWindowsText(JSON.stringify(court.visibility_windows, null, 2));
        } else {
            setWindowsText('');
        }
        setWindowsError('');
    }, [court]);

    useEffect(() => {
        setClubsReady(false);
        (async () => {
            const me = await authService.getMe().catch(() => ({ ok: false as const }));
            const isMeResponse = (value: unknown): value is MeResponse =>
                typeof value === 'object' && value !== null && 'roles' in value;

            let admin = false;
            let ownerId: string | undefined;

            if (isMeResponse(me) && me.ok) {
                admin = !!me.roles.admin_id;
                ownerId = me.roles.club_owner_id ?? undefined;
            }

            setIsAdmin(admin);
            const list = ownerId ? await clubService.getAll(ownerId) : await clubService.getAll();
            setClubs(list ?? []);
            if (!court && list?.length === 1) setValue('club_id', list[0].id);
            setClubsReady(true);
        })();
    }, [court, setValue]);

    useEffect(() => {
        if (court) {
            reset({ ...court, is_hidden: Boolean(court.is_hidden) });
        }
    }, [court, reset]);

    const submitCourt = useCallback((data: Partial<Court>) => {
        setWindowsError('');
        let visibility_windows: CourtVisibilityWindow[] | null | undefined = undefined;
        if (windowsText.trim()) {
            try {
                visibility_windows = JSON.parse(windowsText) as CourtVisibilityWindow[];
            } catch {
                setWindowsError(t('visibility_windows_invalid'));
                return;
            }
        } else if (court) {
            visibility_windows = null;
        }
        onSubmit({
            ...data,
            is_hidden: Boolean(data.is_hidden),
            visibility_windows,
        });
    }, [windowsText, court, onSubmit, t]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary/20 backdrop-blur-sm animate-fadein">
            <div className="bg-card w-full max-w-md rounded-[32px] shadow-2xl border border-border-subtle overflow-hidden animate-fadeInUp">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle bg-background">
                    <h3 className="font-bold text-primary">
                        {isEdit ? t('edit_court') : t('add_court')}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-muted-foreground"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit(submitCourt)} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {clubsReady && !isAdmin && clubs.length === 1 && <input type="hidden" {...register('club_id')} />}
                    {clubsReady && (isAdmin || clubs.length !== 1) && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider px-1">
                                {t('club_select')}
                            </label>
                            <select
                                {...register('club_id', { required: t('required') })}
                                className="w-full px-4 py-3.5 rounded-2xl border border-border-subtle focus:outline-none focus:ring-4 focus:ring-brand/5 focus:border-brand bg-[#FAFAFA] text-sm font-semibold transition-all appearance-none cursor-pointer"
                            >
                                <option value="">{t('select_option')}</option>
                                {clubs.map((club) => (
                                    <option key={club.id} value={club.id}>{club.name}</option>
                                ))}
                            </select>
                            {errors.club_id && <span className="text-[10px] text-error font-bold px-1">{errors.club_id.message}</span>}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider px-1">
                            {t('name')}
                        </label>
                        <input
                            {...register('name', { required: t('required') })}
                            placeholder={t('placeholder_name')}
                            className="w-full px-4 py-3.5 rounded-2xl border border-border-subtle focus:outline-none focus:ring-4 focus:ring-brand/5 focus:border-brand bg-[#FAFAFA] text-sm font-semibold transition-all"
                        />
                        {errors.name && <span className="text-[10px] text-error font-bold px-1">{errors.name.message}</span>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider px-1">
                                {t('glass_type')}
                            </label>
                            <select
                                {...register('glass_type')}
                                className="w-full px-4 py-3.5 rounded-2xl border border-border-subtle focus:outline-none focus:ring-4 focus:ring-brand/5 focus:border-brand bg-[#FAFAFA] text-sm font-semibold transition-all appearance-none cursor-pointer"
                            >
                                <option value="normal">{t('glass_standard')}</option>
                                <option value="panoramic">{t('glass_panoramic')}</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider px-1">
                                {t('status')}
                            </label>
                            <select
                                {...register('status')}
                                className="w-full px-4 py-3.5 rounded-2xl border border-border-subtle focus:outline-none focus:ring-4 focus:ring-brand/5 focus:border-brand bg-[#FAFAFA] text-sm font-semibold transition-all appearance-none cursor-pointer"
                            >
                                <option value="operational">{t('operational')}</option>
                                <option value="maintenance">{t('maintenance')}</option>
                                <option value="closed">{t('closed')}</option>
                            </select>
                        </div>
                    </div>

                    {/* Indoor Toggle */}
                    <div className="flex items-center justify-between p-4 bg-[#FAFAFA] rounded-2xl border border-border-subtle">
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
                    <div className="flex items-center justify-between p-4 bg-[#FAFAFA] rounded-2xl border border-border-subtle">
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

                    <div className="flex items-center justify-between p-4 bg-[#FAFAFA] rounded-2xl border border-border-subtle">
                        <div className="space-y-0.5 pr-2">
                            <span className="text-sm font-bold text-primary">{t('is_hidden_court')}</span>
                            <p className="text-[10px] text-muted-foreground font-medium leading-snug">{t('is_hidden_court_desc')}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input type="checkbox" {...register('is_hidden')} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand" />
                        </label>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider px-1">
                            {t('visibility_windows')}
                        </label>
                        <textarea
                            value={windowsText}
                            onChange={(e) => { setWindowsText(e.target.value); setWindowsError(''); }}
                            rows={4}
                            spellCheck={false}
                            placeholder='[{"days_of_week":[1,2,3,4,5],"start_minutes":480,"end_minutes":1320}]'
                            className="w-full px-4 py-3 rounded-2xl border border-border-subtle focus:outline-none focus:ring-4 focus:ring-brand/5 focus:border-brand bg-[#FAFAFA] text-xs font-mono transition-all"
                        />
                        <p className="text-[10px] text-muted-foreground px-1">{t('visibility_windows_desc')}</p>
                        {windowsError ? <span className="text-[10px] text-error font-bold px-1">{windowsError}</span> : null}
                    </div>

                    {/* Last Maintenance Date */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider px-1">
                            {t('last_maintenance')}
                        </label>
                        <input
                            type="date"
                            {...register('last_maintenance')}
                            className="w-full px-4 py-3.5 rounded-2xl border border-border-subtle focus:outline-none focus:ring-4 focus:ring-brand/5 focus:border-brand bg-[#FAFAFA] text-sm font-semibold transition-all"
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="flex gap-3 pt-6 border-t border-border-subtle">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-4 border border-border-subtle rounded-2xl text-xs font-bold text-primary hover:bg-gray-50 transition-all active:scale-95"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="submit"
                            className="flex-[1.5] py-4 bg-brand text-white rounded-2xl text-xs font-bold hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-brand/20"
                        >
                            {isEdit ? t('save') : t('add_court')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
