import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type WeeklyScheduleDay = {
    open: string;
    close: string;
    closed?: boolean;
};

export type WeeklyScheduleForm = Record<string, WeeklyScheduleDay>;

const WEEKDAYS: { key: string; labelKey: string }[] = [
    { key: 'mon', labelKey: 'club_schedule_mon' },
    { key: 'tue', labelKey: 'club_schedule_tue' },
    { key: 'wed', labelKey: 'club_schedule_wed' },
    { key: 'thu', labelKey: 'club_schedule_thu' },
    { key: 'fri', labelKey: 'club_schedule_fri' },
    { key: 'sat', labelKey: 'club_schedule_sat' },
    { key: 'sun', labelKey: 'club_schedule_sun' },
];

const DEFAULT_DAY: WeeklyScheduleDay = { open: '08:00', close: '23:00', closed: false };

export function parseWeeklySchedule(raw: unknown): WeeklyScheduleForm {
    const out: WeeklyScheduleForm = {};
    for (const { key } of WEEKDAYS) {
        out[key] = { ...DEFAULT_DAY };
    }
    if (!raw || typeof raw !== 'object') return out;
    const ws = raw as Record<string, unknown>;
    for (const { key } of WEEKDAYS) {
        const entry = ws[key];
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            const obj = entry as Record<string, unknown>;
            out[key] = {
                open: String(obj.open ?? obj.open_time ?? obj.start ?? DEFAULT_DAY.open).slice(0, 5),
                close: String(obj.close ?? obj.close_time ?? obj.end ?? DEFAULT_DAY.close).slice(0, 5),
                closed: obj.closed === true || obj.is_closed === true,
            };
        } else if (typeof entry === 'string' && entry.includes('-')) {
            const [a, b] = entry.split(/[-–—]/).map((s) => s.trim());
            out[key] = { open: a?.slice(0, 5) ?? DEFAULT_DAY.open, close: b?.slice(0, 5) ?? DEFAULT_DAY.close, closed: false };
        }
    }
    return out;
}

export function weeklyScheduleToPayload(form: WeeklyScheduleForm): Record<string, WeeklyScheduleDay> {
    const payload: Record<string, WeeklyScheduleDay> = {};
    for (const { key } of WEEKDAYS) {
        const d = form[key] ?? DEFAULT_DAY;
        payload[key] = {
            open: d.open,
            close: d.close,
            closed: !!d.closed,
        };
    }
    return payload;
}

type Props = {
    value: WeeklyScheduleForm;
    onChange: (next: WeeklyScheduleForm) => void;
};

export function ClubWeeklyScheduleEditor({ value, onChange }: Props) {
    const { t } = useTranslation();

    const applyToAll = (sourceKey: string) => {
        const src = value[sourceKey] ?? DEFAULT_DAY;
        const next = { ...value };
        for (const { key } of WEEKDAYS) {
            next[key] = { ...src };
        }
        onChange(next);
    };

    const rows = useMemo(() => WEEKDAYS.map((d) => ({ ...d, day: value[d.key] ?? DEFAULT_DAY })), [value]);

    return (
        <div className="space-y-3">
            <p className="text-[11px] text-gray-500 leading-relaxed">{t('club_schedule_help')}</p>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-left text-xs min-w-[520px]">
                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase">
                        <tr>
                            <th className="px-3 py-2">{t('club_schedule_day')}</th>
                            <th className="px-3 py-2">{t('club_schedule_open')}</th>
                            <th className="px-3 py-2">{t('club_schedule_close')}</th>
                            <th className="px-3 py-2 text-center">{t('club_schedule_closed')}</th>
                            <th className="px-3 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.map(({ key, labelKey, day }) => (
                            <tr key={key} className={day.closed ? 'bg-gray-50/80' : ''}>
                                <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">
                                    {t(labelKey)}
                                </td>
                                <td className="px-3 py-2">
                                    <input
                                        type="time"
                                        value={day.open}
                                        disabled={day.closed}
                                        onChange={(e) => onChange({ ...value, [key]: { ...day, open: e.target.value } })}
                                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40"
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    <input
                                        type="time"
                                        value={day.close}
                                        disabled={day.closed}
                                        onChange={(e) => onChange({ ...value, [key]: { ...day, close: e.target.value } })}
                                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40"
                                    />
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <input
                                        type="checkbox"
                                        checked={!!day.closed}
                                        onChange={(e) => onChange({ ...value, [key]: { ...day, closed: e.target.checked } })}
                                        className="rounded border-gray-300 text-[#E31E24]"
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    <button
                                        type="button"
                                        onClick={() => applyToAll(key)}
                                        className="text-[10px] font-semibold text-[#006A6A] hover:underline whitespace-nowrap"
                                    >
                                        {t('club_schedule_copy_all')}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex items-start gap-2 text-[11px] text-gray-500 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{t('club_schedule_grilla_note')}</span>
            </div>
        </div>
    );
}
