import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import type { Reservation, ReservationStatus } from '../types';
import { PIXELS_PER_MINUTE, START_HOUR } from '../utils/timeGrid';
import { useTranslation } from '../i18n/I18nContext';
import { useZoom } from '../context/ZoomContext';

interface Props {
    reservation: Reservation;
    isOverlay?: boolean;
    justDropped?: boolean;
    onClick?: (reservation: Reservation) => void;
    compactPxPerMinute?: number;
    onHoverStart?: (res: Reservation, el: HTMLElement) => void;
    onHoverEnd?: () => void;
}

const statusColors: Record<ReservationStatus, string> = {
    // Normal Players -> Blue
    'Reservado': 'bg-[#005bc5] text-white border-[#004fa8]',
    'Pagado': 'bg-[#005bc5] text-white border-[#004fa8]',
    'Torneo Reservado': 'bg-[#005bc5] text-white border-[#004fa8]',
    'Torneo Pagado': 'bg-[#005bc5] text-white border-[#004fa8]',
    'RESERVA FIJA 2025 - 40€ Pagado': 'bg-[#005bc5] text-white border-[#004fa8]',
    'Reserva Internet Pago parcial': 'bg-[#005bc5] text-white border-[#004fa8]',
    'Reserva Internet Pagado': 'bg-[#005bc5] text-white border-[#004fa8]',
    'S7 RESERVAS Reservado': 'bg-[#005bc5] text-white border-[#004fa8]',
    
    // School -> Pink
    'DIAGONAL TARIFA PLANA Reservado': 'bg-[#fbcfe8] text-[#831843] border-[#f472b6]',
    'DIAGONAL ESCUELA DE 17:00 A 23:00 Reservado': 'bg-[#fbcfe8] text-[#831843] border-[#f472b6]',
    'DIAGONAL ACADEMY 9:00 A 17:00 Reservado': 'bg-[#fbcfe8] text-[#831843] border-[#f472b6]',
    'RESERVA VALLE CHINO Reservado': 'bg-[#fbcfe8] text-[#831843] border-[#f472b6]',
    'RESERVA PUNTA CHINO Reservado': 'bg-[#fbcfe8] text-[#831843] border-[#f472b6]',
    'D.ADICIONAL MAÑANAS (A-D) Reservado': 'bg-[#fbcfe8] text-[#831843] border-[#f472b6]',
    
    // Free / Passed
    'Disponible': 'bg-[#9cd670] text-[#5a7a3a] border-[#8bc55e]',
    'Tiempo pasado': 'bg-[#e5e7eb] text-gray-500 border-gray-300',
};

export const ReservationCard: React.FC<Props> = ({ reservation, isOverlay, justDropped, onClick, compactPxPerMinute, onHoverStart, onHoverEnd }) => {
    const { tData } = useTranslation();
    const { zoomLevel } = useZoom();
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: reservation.id,
        data: reservation,
    });

    const displayLabel = tData(reservation.matchType || reservation.playerName);
    const isCompact = !!compactPxPerMinute;
    const isSmallZoom = !isCompact && (zoomLevel === 'XS' || zoomLevel === 'S' || zoomLevel === 'M');
    const isShortBooking = reservation.durationMinutes <= 60;
    const ppm = compactPxPerMinute || PIXELS_PER_MINUTE;

    const computedTop = (() => {
        const [h, m] = reservation.startTime.split(':').map(Number);
        let absoluteH = h;
        if (h < START_HOUR && START_HOUR > 0) absoluteH += 24;
        return ((absoluteH * 60 + m) - (START_HOUR * 60)) * ppm;
    })();

    const computedHeight = (reservation.durationMinutes * ppm) - 1;

    const style: React.CSSProperties = {
        position: 'absolute',
        top: computedTop,
        height: computedHeight,
        left: 0,
        right: 0,
        ...(isOverlay ? { top: 0, left: 0 } : {}),
        zIndex: isDragging ? 50 : 10,
        transform: CSS.Translate.toString(transform),
        ...(isDragging ? { touchAction: 'none' } : {}),
    };

    // Extreme compact handling for very short cards
    const isVeryShort = isCompact && computedHeight < 10;
    const isShort = isCompact && computedHeight >= 10 && computedHeight < 20;

    if (isDragging && !isOverlay) {
        return (
            <div
                className={clsx(
                    'absolute inset-x-0 border flex flex-col overflow-hidden text-xs transition-none opacity-50 grayscale',
                    isCompact ? 'p-0 px-0.5' : 'p-1.5',
                    statusColors[reservation.status]
                )}
                style={{ ...style, transform: undefined, zIndex: 0 }}
            >
                <div className={clsx(
                    "font-bold text-center leading-none overflow-hidden",
                    isVeryShort && "hidden",
                    isShort ? "text-[5px] truncate" : isCompact ? "text-[6px]" : "text-[12px] leading-tight"
                )}>
                    {reservation.startTime}
                </div>
                <div className={clsx("flex flex-col mt-auto text-center opacity-90", isCompact && "hidden")}>
                    <span className="uppercase font-bold text-[10px] leading-tight break-words whitespace-normal">{displayLabel}</span>
                </div>
            </div>
        );
    }

    return (
        <div
            id={reservation.id}
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            data-dnd-draggable
            onClick={(e) => {
                if (!isDragging && onClick) {
                    e.stopPropagation();
                    onClick(reservation);
                }
            }}
            onMouseEnter={(e) => {
                if (!isDragging && onHoverStart) {
                    onHoverStart(reservation, e.currentTarget);
                }
            }}
            onMouseLeave={() => {
                if (!isDragging && onHoverEnd) {
                    onHoverEnd();
                }
            }}
            className={clsx(
                // Rectangular card: no rounded corners, border on all sides
                'absolute inset-x-0 border flex flex-col overflow-hidden cursor-pointer hover:brightness-95 transition-[filter]',
                isShortBooking && 'justify-center items-center',
                isCompact ? 'p-0 px-0.5 text-[8px]' : isShortBooking ? 'p-0 px-0.5' : isSmallZoom ? 'p-1.5 text-[18px]' : 'p-1.5 text-xs',
                statusColors[reservation.status],
                isOverlay && 'shadow-lg scale-[1.02] ring-2 ring-blue-400 opacity-95 cursor-grabbing !transition-none',
                justDropped && 'relative z-20'
            )}
        >
            <AnimatePresence>
                {justDropped && (
                    <motion.div
                        className="absolute inset-x-0 -inset-y-[1px] ring-4 ring-blue-400 bg-blue-100/20 z-0 pointer-events-none"
                        initial={{ opacity: 0, scale: 0.90 }}
                        animate={{ opacity: 1, scale: 1.05 }}
                        exit={{ opacity: 0, scale: 1.08 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                )}
            </AnimatePresence>

            {/* Time label — hidden for short bookings (≤60 min) */}
            {!isShortBooking && (
                <div className={clsx(
                    "font-semibold text-center leading-none relative z-10 overflow-hidden opacity-80 pt-0.5",
                    isVeryShort && "hidden",
                    isShort
                        ? "text-[5px] truncate"
                        : isCompact
                            ? "text-[6px]"
                            : "text-[5px] leading-tight"
                )}>
                    {reservation.startTime}
                </div>
            )}

            {/* Player / match label */}
            <div className={clsx(
                "flex flex-col text-center relative z-10 overflow-hidden",
                !isShortBooking && "pt-0.5",
                isCompact && "hidden",
                isVeryShort && "hidden",
            )}>
                <span className="uppercase font-bold leading-tight break-words whitespace-normal text-[5.5px]">
                    {displayLabel}
                </span>
            </div>

            {/* Yellow alert circle — top left */}
            {reservation.hasYellowAlert && (
                <div
                    className="absolute top-0.5 left-0.5 z-20 rounded-full bg-yellow-400"
                    style={{
                        width: isCompact ? 10 : isSmallZoom ? 26 : 14,
                        height: isCompact ? 10 : isSmallZoom ? 26 : 14,
                    }}
                />
            )}

            {/* Payment icons: white circle (count) + red circle (paid) */}
            {reservation.isPaidIcon && reservation.paymentNumber !== undefined && (
                <div className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 z-20">
                    {/* White circle with player count */}
                    <div
                        className="flex items-center justify-center rounded-full bg-white shadow font-bold leading-none"
                        style={{
                            width: isCompact ? 10 : isSmallZoom ? 26 : 16,
                            height: isCompact ? 10 : isSmallZoom ? 26 : 16,
                            fontSize: isCompact ? 7 : isSmallZoom ? 12 : 9
                        }}
                    >
                        {reservation.paymentNumber}
                    </div>
                    {/* Red circle with minus (paid indicator) */}
                    <div
                        className="flex items-center justify-center rounded-full bg-red-500 leading-none"
                        style={{
                            width: isCompact ? 10 : isSmallZoom ? 26 : 16,
                            height: isCompact ? 10 : isSmallZoom ? 26 : 16,
                        }}
                    >
                        <span style={{
                            display: 'block',
                            width: isCompact ? 6 : isSmallZoom ? 12 : 8,
                            height: isCompact ? 1.5 : isSmallZoom ? 3 : 2,
                            backgroundColor: 'white',
                            borderRadius: 2
                        }} />
                    </div>
                </div>
            )}
        </div>
    );
};
