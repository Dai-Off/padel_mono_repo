import React from 'react';
import { getGridIntervals, PIXELS_PER_MINUTE } from '../utils/timeGrid';
import clsx from 'clsx';
import { useZoom } from '../context/ZoomContext';

export const TimeAxis: React.FC<{ position: 'left' | 'right'; isCompact?: boolean; compactPxPerMinute?: number }> = ({ position, isCompact, compactPxPerMinute }) => {
    const intervals = getGridIntervals();
    const { zoomLevel } = useZoom();
    const isSmallZoom = !isCompact && (zoomLevel === 'XS' || zoomLevel === 'S' || zoomLevel === 'M');

    // Row height must match the grid: 30 minutes * ppm
    const rowHeightPx = isCompact && compactPxPerMinute
        ? compactPxPerMinute * 60   // compact: 60-min interval per label
        : PIXELS_PER_MINUTE * 30;   // desktop: 30-min interval per row

    return (
        <div
            className={clsx(
                'flex-shrink-0 bg-white z-20',
                isCompact ? 'w-5' : 'w-[34px]',
                position === 'left'
                    ? 'border-r-2 border-r-white'
                    : 'border-l-2 border-l-white'
            )}
        >
            {/* Header spacer */}
            <div className={clsx(
                "border-b-2 border-white bg-white",
                isCompact ? "h-6" : "h-[22px]"
            )} />

            <div className="relative">
                {intervals.map((time) => {
                    const isHour = time.endsWith(':00');
                    // In compact mode only show full hours
                    if (isCompact && !isHour) return null;
                    return (
                        <div
                            key={time}
                            className={clsx(
                                "flex items-start relative",
                                position === 'left' ? 'justify-end pr-1' : 'justify-start pl-1'
                            )}
                            style={{ height: time === '00:00' ? '0px' : `${rowHeightPx}px` }}
                        >
                            {time !== '00:00' && isHour && (
                                <span
                                    className={clsx(
                                        "absolute -top-[5px] select-none tabular-nums tracking-tight",
                                        isCompact
                                            ? "text-[7px] font-medium text-[#555]"
                                            : isSmallZoom
                                                ? "text-[11px] font-normal text-[#444]"
                                                : "text-[8px] font-normal text-[#444]",
                                    )}
                                    style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif" }}
                                >
                                    {time}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
