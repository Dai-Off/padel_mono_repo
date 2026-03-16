import React from 'react';
import { getGridIntervals } from '../utils/timeGrid';
import clsx from 'clsx';

export const GridBackground: React.FC<{ compactPxPerMinute?: number }> = ({ compactPxPerMinute }) => {
    const intervals = getGridIntervals();
    const rowHeight = compactPxPerMinute ? compactPxPerMinute * 30 : 60;
    const isCompact = !!compactPxPerMinute;

    return (
        <div className={clsx("absolute inset-x-0 bottom-0 pointer-events-none", isCompact ? "top-6" : "top-[22px]")}>
            {intervals.map((time, i) => {
                const isHour = time.endsWith(':00');

                if (i === intervals.length - 1) {
                    return null;
                }

                return (
                    <div
                        key={time}
                        className={clsx(
                            'w-full border-t relative bg-white',
                            isHour ? 'border-white' : 'border-white'
                        )}
                        style={{ height: `${rowHeight}px` }}
                    />
                );
            })}
        </div>
    );
}
