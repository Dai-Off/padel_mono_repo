import React from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import clsx from 'clsx';
import type { Court, Reservation } from '../types';
import { ReservationCard } from './ReservationCard';
import { getGridIntervals, parseTimeStr, START_HOUR, END_HOUR, PIXELS_PER_MINUTE } from '../utils/timeGrid';
import { useGrillaTranslation } from '../i18n/useGrillaTranslation';
import { useZoom } from '../context/ZoomContext';

interface Props {
    court: Court;
    reservations: Reservation[];
    dragGhost?: { startTime: string; duration: number };
    recentlyDroppedId?: string | null;
    onReservationClick?: (reservation: Reservation) => void;
    onFreeSlotClick?: (courtId: string, courtName: string, timeStr: string, isDisabled: boolean) => void;
    onHeaderClick?: (courtId: string) => void;
    onHeaderHover?: (courtId: string | null) => void;
    isMaintenanceBlocked?: boolean;
    onHoverStart?: (res: Reservation, el: HTMLElement) => void;
    onHoverEnd?: () => void;
    isFocusedMode?: boolean;
    isCurrentlyFocused?: boolean;
    isCompactView?: boolean;
    compactPxPerMinute?: number;
    totalCourts?: number;
}

// Split "Pista 2 CENTRAL" → { main: "PISTA 2", sub: "CENTRAL" }
function parseCourtName(name: string): { main: string; sub?: string } {
    const parts = name.trim().split(/\s+/);
    // e.g. ["Pista", "2"] or ["Pista", "2", "CENTRAL"] or ["Pista", "Virtual"]
    if (parts.length <= 2) {
        return { main: name.toUpperCase() };
    }
    const mainParts = parts.slice(0, 2).join(' ').toUpperCase();
    const sub = parts.slice(2).join(' ').toUpperCase();
    return { main: mainParts, sub };
}

export const CourtColumn: React.FC<Props> = ({ court, reservations, dragGhost, recentlyDroppedId, onReservationClick, onFreeSlotClick, onHeaderClick, onHeaderHover, isMaintenanceBlocked, onHoverStart, onHoverEnd, isFocusedMode, isCurrentlyFocused, isCompactView, compactPxPerMinute, totalCourts }) => {
    const { tData } = useGrillaTranslation();
    const { zoomLevel } = useZoom();
    const isSmallZoom = !isCompactView && (zoomLevel === 'XS' || zoomLevel === 'S' || zoomLevel === 'M');
    const { setNodeRef, isOver } = useDroppable({
        id: court.id,
        data: court,
    });

    // Make the court header draggable (to drag between tabs)
    const { attributes: dragAttrs, listeners: dragListeners, setNodeRef: setDragRef, isDragging } = useDraggable({
        id: `court-header-${court.id}`,
        data: { type: 'court', court },
    });

    const intervals = getGridIntervals();
    const ppm = (isCompactView && compactPxPerMinute) ? compactPxPerMinute : PIXELS_PER_MINUTE;
    const height = (intervals.length - 1) * 30 * ppm;

    const isVirtual = /virtual/i.test(court.name);
    const { main: courtMain, sub: courtSub } = parseCourtName(tData(court.name));

    // Calculate free slots
    const getFreeSlots = () => {
        const slots = [];
        const startMin = START_HOUR * 60;
        const endMin = END_HOUR * 60;
        let currentMin = startMin;

        const sortedRes = [...reservations].sort((a, b) => parseTimeStr(a.startTime) - parseTimeStr(b.startTime));

        for (const res of sortedRes) {
            const resStart = parseTimeStr(res.startTime);
            const resEnd = resStart + res.durationMinutes;

            if (resStart > currentMin) {
                slots.push({ startMins: currentMin, endMins: resStart });
            }
            if (resEnd > currentMin) {
                currentMin = resEnd;
            }
        }

        if (currentMin < endMin) {
            slots.push({ startMins: currentMin, endMins: endMin });
        }

        return slots;
    };

    const freeSlots = getFreeSlots();

    return (
        <div className={clsx(
            "flex-1 border-r-2 border-white flex flex-col relative transition-all duration-300 ease-in-out",
            isCompactView ? "min-w-0 w-0" : "min-w-[81px] max-w-[161px]",
            // Dim non-focused courts when in focus mode
            isFocusedMode && !isCurrentlyFocused && "bg-gray-50 opacity-60 grayscale-[20%]"
        )}>
            {/* Court Header — draggable to move between tabs */}
            <div
                ref={setDragRef}
                {...dragListeners}
                {...dragAttrs}
                onClick={() => onHeaderClick?.(court.id)}
                onMouseEnter={() => onHeaderHover?.(court.id)}
                onMouseLeave={() => onHeaderHover?.(null)}
                className={clsx(
                    "border-b border-[#b0b0b0] flex flex-col items-center justify-center font-bold transition-colors touch-none relative",
                    isCompactView ? "h-6 text-[7px] leading-tight px-0.5 text-center" : isSmallZoom ? "h-[22px] text-[14px]" : "h-[22px] text-[10px]",
                    isDragging && "opacity-40",
                    isVirtual
                        ? "text-slate-500 bg-white"
                        : isMaintenanceBlocked
                            ? "bg-amber-100 text-amber-800 cursor-grab"
                            : isCurrentlyFocused
                                ? "bg-[#e8f5e9] text-[#005a4f] cursor-grab"
                                : "bg-white text-[#005a4f] cursor-grab hover:bg-[#f0faf0]"
                )}
            >
                {isCompactView ? (
                    <span>{tData(court.name).replace(/^球場 /, 'C').replace(/^Pista /, 'P')}</span>
                ) : (
                    <>
                        <span className="leading-none tracking-wide">{courtMain}</span>
                        {courtSub && (
                            <span className={clsx(
                                "leading-none tracking-wider font-semibold opacity-80 mt-0.5 text-[#007a6a]",
                                isSmallZoom ? "text-[12px]" : "text-[9px]"
                            )}>
                                {courtSub}
                            </span>
                        )}
                    </>
                )}
            </div>

            <div
                ref={setNodeRef}
                className={clsx(
                    "relative flex-1 transition-colors duration-200",
                    isOver ? "bg-green-50/70" : "bg-transparent"
                )}
                style={{ height }}
            >
                {/* Render Free Slots — grey when maintenance-blocked or outside operational hours */}
                {(isMaintenanceBlocked
                    ? Array.from({ length: Math.floor(((END_HOUR - START_HOUR) * 60) / 30) }).map((_, b) => {
                        const blockStartMins = START_HOUR * 60 + b * 30;
                        const h = Math.floor(blockStartMins / 60);
                        const m = blockStartMins % 60;
                        const displayH = h >= 24 ? h - 24 : h;
                        const timeStr = `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                        const manyCourts = totalCourts && totalCourts > 10;
                        return (
                            <div
                                key={`maint-${b}`}
                                className="absolute inset-x-0 border-b z-[5] flex items-center justify-center bg-[#d0d0d0] border-white cursor-not-allowed"
                                style={{
                                    top: (blockStartMins - START_HOUR * 60) * ppm,
                                    height: 30 * ppm,
                                }}
                            >
                                <span className={clsx(
                                    "font-semibold pointer-events-none text-[#919191]",
                                    isCompactView
                                        ? (manyCourts ? "text-[7.5px] -ml-0.5 tracking-tighter" : "text-[7px]")
                                        : isSmallZoom ? "text-[13px]" : "text-[8px]",
                                )}>
                                    {timeStr}
                                </span>
                            </div>
                        );
                    })
                    : freeSlots.map((slot, i) => {
                        const duration = slot.endMins - slot.startMins;
                        if (duration < 30) return null;

                        const blocksCount = Math.floor(duration / 30);

                        return Array.from({ length: blocksCount }).map((_, b) => {
                            const blockStartMins = slot.startMins + (b * 30);

                            const h = Math.floor(blockStartMins / 60);
                            const m = blockStartMins % 60;
                            const displayH = h >= 24 ? h - 24 : h;
                            const timeStr = `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

                            const isUnavailable = blockStartMins < 8 * 60 || blockStartMins >= 23 * 60;

                            const manyCourts = totalCourts && totalCourts > 10;

                            return (
                                <div
                                    key={`free-${i}-${b}`}
                                    onClick={() => onFreeSlotClick?.(court.id, court.name, timeStr, isUnavailable)}
                                    className={clsx(
                                        "absolute inset-x-0 border-b z-0 flex items-center justify-center transition-colors",
                                        isUnavailable
                                            ? "bg-[#e0e0e0] border-white cursor-pointer hover:bg-[#d0d0d0]"
                                            : "bg-[#ade88f] border-white cursor-pointer hover:bg-[#93db72]"
                                    )}
                                    style={{
                                        top: (blockStartMins - START_HOUR * 60) * ppm,
                                        height: 30 * ppm,
                                    }}
                                >
                                    <span className={clsx(
                                        "font-semibold pointer-events-none",
                                        isCompactView
                                            ? (manyCourts ? "text-[7.5px] -ml-0.5 tracking-tighter" : "text-[7px]")
                                            : isSmallZoom ? "text-[13px]" : "text-[8px]",
                                        isUnavailable ? "text-[#919191]" : "text-[#919191]"
                                    )}>
                                        {timeStr}
                                    </span>
                                </div>
                            );
                        });
                    })
                )}

                {dragGhost && (
                    <div
                        className="absolute inset-x-0 z-0 pointer-events-none transition-all duration-75 border-2 border-dashed border-gray-600 bg-transparent"
                        style={{
                            top: (() => {
                                const [h, m] = dragGhost.startTime.split(':').map(Number);
                                let absoluteH = h;
                                if (h < START_HOUR && START_HOUR > 0) absoluteH += 24;
                                return ((absoluteH * 60 + m) - (START_HOUR * 60)) * ppm;
                            })() + 1,
                            height: (dragGhost.duration * ppm) - 2,
                        }}
                    />
                )}

                {reservations.map(res => (
                    <ReservationCard
                        key={res.id}
                        reservation={res}
                        justDropped={res.id === recentlyDroppedId}
                        onClick={onReservationClick}
                        compactPxPerMinute={compactPxPerMinute}
                        onHoverStart={onHoverStart}
                        onHoverEnd={onHoverEnd}
                    />
                ))}
            </div>
        </div>
    );
};
