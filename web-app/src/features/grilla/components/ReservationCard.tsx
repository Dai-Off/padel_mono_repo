import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import type { Reservation, ReservationType } from '../types';
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

// Color is driven by booking_type (the "what"), not by payment status
const bookingTypeColors: Record<ReservationType, string> = {
    'standard':          'bg-[#005bc5] text-white border-[#004fa8]',           // Azul — pista privada
    'open_match':        'bg-[#7c3aed] text-white border-[#6d28d9]',           // Violeta — partido abierto
    'pozo':              'bg-[#ea580c] text-white border-[#c2410c]',           // Naranja — americanas/melee
    'fixed_recurring':   'bg-[#166534] text-white border-[#14532d]',           // Verde oscuro — turno fijo
    'school_course':     'bg-[#fdf2f8] text-[#9d174d] border-[#f9a8d4]',          // Rosa claro — escuela curso
    'school_group':      'bg-[#fbcfe8] text-[#831843] border-[#f472b6]',      // Rosa — escuela grupo
    'school_individual': 'bg-[#fce7f3] text-[#9d174d] border-[#f9a8d4]',     // Rosa claro — clase particular
    'flat_rate':         'bg-[#be185d] text-white border-[#9d174d]',           // Fucsia — tarifa plana DPA
    'tournament':        'bg-[#b45309] text-white border-[#92400e]',           // Ámbar — torneo
    'blocked':           'bg-[#4b5563] text-white border-[#374151]',           // Gris — bloqueo admin
};

// Pending payment: dashed border to indicate "not yet paid"
const pendingPaymentStyle = 'border-dashed opacity-80';

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
                    bookingTypeColors[reservation.booking_type] ?? bookingTypeColors['standard']
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
                bookingTypeColors[reservation.booking_type] ?? bookingTypeColors['standard'],
                reservation.status === 'pending_payment' && pendingPaymentStyle,
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
                {!isCompact && reservation.totalPrice != null && reservation.totalPrice > 0 && (
                    <span className="text-[5px] opacity-90 mt-0.5">
                        {(reservation.totalPrice).toFixed(2).replace('.', ',')} €
                    </span>
                )}
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

            {/* Mobile channel badge (WM) — top left yellow circle */}
            {reservation.source_channel === 'mobile' && (
                <div
                    className="absolute top-0 left-0 z-20 rounded-full bg-yellow-400 flex items-center justify-center"
                    style={{
                        width: isCompact ? 9 : isSmallZoom ? 25 : 14,
                        height: isCompact ? 9 : isSmallZoom ? 25 : 14,
                    }}
                >
                    {!isCompact && (
                        <span
                            className="font-black text-gray-900 leading-none select-none"
                            style={{ fontSize: isSmallZoom ? 9 : 5 }}
                        >
                            WM
                        </span>
                    )}
                </div>
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
