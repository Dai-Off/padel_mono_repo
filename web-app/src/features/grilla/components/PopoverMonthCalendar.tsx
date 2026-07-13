import React, { useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

type PopoverMonthCalendarProps = {
    value: Date;
    onChange: (date: Date) => void;
    open: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLElement | null>;
};

function toYmd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export const PopoverMonthCalendar: React.FC<PopoverMonthCalendarProps> = ({
    value,
    onChange,
    open,
    onClose,
    anchorRef,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [viewMonth, setViewMonth] = React.useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

    useEffect(() => {
        if (open) {
            setViewMonth(new Date(value.getFullYear(), value.getMonth(), 1));
        }
    }, [open, value]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const target = e.target as Node;
            if (panelRef.current?.contains(target)) return;
            if (anchorRef.current?.contains(target)) return;
            onClose();
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open, onClose, anchorRef]);

    const cells = useMemo(() => {
        const year = viewMonth.getFullYear();
        const month = viewMonth.getMonth();
        const first = new Date(year, month, 1);
        const startOffset = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();

        const out: Array<{ date: Date; inMonth: boolean }> = [];
        for (let i = startOffset - 1; i >= 0; i--) {
            out.push({ date: new Date(year, month - 1, prevMonthDays - i), inMonth: false });
        }
        for (let d = 1; d <= daysInMonth; d++) {
            out.push({ date: new Date(year, month, d), inMonth: true });
        }
        while (out.length < 42) {
            const nextDay = out.length - startOffset - daysInMonth + 1;
            out.push({ date: new Date(year, month + 1, nextDay), inMonth: false });
        }
        return out;
    }, [viewMonth]);

    if (!open) return null;

    const monthLabel = viewMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const today = new Date();

    return (
        <div
            ref={panelRef}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-[280px] rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
        >
            <div className="flex items-center justify-between mb-3">
                <button
                    type="button"
                    onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                    className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-gray-800 capitalize">{monthLabel}</span>
                <button
                    type="button"
                    onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                    className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map((wd) => (
                    <div key={wd} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">
                        {wd}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
                {cells.map(({ date, inMonth }) => {
                    const selected = sameDay(date, value);
                    const isToday = sameDay(date, today);
                    return (
                        <button
                            key={toYmd(date)}
                            type="button"
                            onClick={() => {
                                onChange(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
                                onClose();
                            }}
                            className={clsx(
                                'h-8 w-8 mx-auto rounded-full text-xs font-medium transition-colors',
                                !inMonth && 'text-gray-300',
                                inMonth && !selected && 'text-gray-700 hover:bg-gray-100',
                                isToday && !selected && 'ring-1 ring-[#006A6A]/40',
                                selected && 'bg-[#006A6A] text-white hover:bg-[#005151]',
                            )}
                        >
                            {date.getDate()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
