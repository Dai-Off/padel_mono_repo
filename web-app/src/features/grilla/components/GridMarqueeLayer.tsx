import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Wrench, Trophy, Users, GraduationCap, Trash2 } from 'lucide-react';
import type { Court, Reservation } from '../types';
import {
    collectSlotsInMarquee,
    collectMaintenanceBookingsForSlots,
    computeMarqueeMenuPosition,
    getCourtsHorizontalBounds,
    snapMarqueeVertical,
    clientYToSlotMins,
    slotKey,
    type GridSlot,
} from '../utils/gridMarqueeSelection';

export type MarqueeAction = 'maintenance' | 'tournament' | 'match' | 'class' | 'unblock_maintenance';

type Props = {
    shellRef?: React.RefObject<HTMLElement | null>;
    containerRef: React.RefObject<HTMLElement | null>;
    visibleCourts: Court[];
    reservations: Reservation[];
    gridStartHour: number;
    headerPx: number;
    ppm: number;
    gridStartMin: number;
    gridEndMin: number;
    disabled?: boolean;
    selectedKeys: Set<string>;
    onSelectionChange: (keys: Set<string>, slots: GridSlot[]) => void;
    onAction: (action: MarqueeAction) => void;
};

const DRAG_THRESHOLD_PX = 6;
const MENU_WIDTH = 210;
const SLOT_STEP_MIN = 30;

export const GridMarqueeLayer: React.FC<Props> = ({
    shellRef,
    containerRef,
    visibleCourts,
    reservations,
    gridStartHour,
    headerPx,
    ppm,
    gridStartMin,
    gridEndMin,
    disabled,
    selectedKeys,
    onSelectionChange,
    onAction,
}) => {
    const originRef = useRef<{ x: number; y: number } | null>(null);
    const draggingRef = useRef(false);
    const axisDragRef = useRef(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [marquee, setMarquee] = useState<DOMRect | null>(null);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
    const [selectedCourtCount, setSelectedCourtCount] = useState(0);
    const [selectedSlots, setSelectedSlots] = useState<GridSlot[]>([]);

    const listenRef = shellRef ?? containerRef;

    const getColumnRects = useCallback(() => {
        const root = containerRef.current;
        if (!root) return [];
        return visibleCourts
            .map((court) => {
                const el = root.querySelector(`[data-court-column-id="${court.id}"]`);
                if (!el) return null;
                return { courtId: court.id, courtName: court.name, rect: el.getBoundingClientRect() };
            })
            .filter((x): x is { courtId: string; courtName: string; rect: DOMRect } => x != null);
    }, [containerRef, visibleCourts]);

    const getGridBodyMetrics = useCallback(() => {
        const root = containerRef.current;
        if (!root) return null;
        const gridRect = root.getBoundingClientRect();
        const bodyTop = gridRect.top + headerPx;
        const bodyBottom = bodyTop + (gridEndMin - gridStartMin) * ppm;
        const slotPx = SLOT_STEP_MIN * ppm;
        return { gridRect, bodyTop, bodyBottom, slotPx };
    }, [containerRef, gridEndMin, gridStartMin, headerPx, ppm]);

    const buildMarqueeRect = useCallback(
        (left: number, top: number, right: number, bottom: number): DOMRect => {
            const metrics = getGridBodyMetrics();
            if (!metrics) return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
            const v = snapMarqueeVertical(top, bottom, metrics.bodyTop, metrics.bodyBottom, metrics.slotPx);
            return new DOMRect(left, v.top, Math.max(0, right - left), v.bottom - v.top);
        },
        [getGridBodyMetrics],
    );

    const finalizeSelection = useCallback(
        (rect: DOMRect | null) => {
            const root = containerRef.current;
            if (!rect || !root || rect.width < DRAG_THRESHOLD_PX || rect.height < DRAG_THRESHOLD_PX) {
                return;
            }
            const columnRects = getColumnRects();
            const gridRect = root.getBoundingClientRect();
            const slots = collectSlotsInMarquee(
                rect,
                columnRects,
                gridRect,
                headerPx,
                ppm,
                gridStartMin,
                gridEndMin,
            );
            const keys = new Set(slots.map((s) => slotKey(s.courtId, s.startMins)));
            onSelectionChange(keys, slots);
            if (keys.size > 0) {
                setSelectedSlots(slots);
                setSelectedCourtCount(new Set(slots.map((s) => s.courtId)).size);
                setAnchorRect(rect);
            }
        },
        [containerRef, getColumnRects, gridEndMin, gridStartMin, headerPx, onSelectionChange, ppm],
    );

    useEffect(() => {
        const root = listenRef.current;
        if (!root || disabled) return;

        const onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            const target = e.target as HTMLElement;
            if (target.closest('[data-marquee-menu]')) return;

            const axisRow = target.closest('[data-time-axis-row]') as HTMLElement | null;
            const onAxis = target.closest('[data-time-axis]');
            const metrics = getGridBodyMetrics();
            const columnRects = getColumnRects();
            const courtBounds = getCourtsHorizontalBounds(columnRects);

            if ((axisRow || onAxis) && metrics && courtBounds) {
                const rowMins = axisRow?.dataset.slotMins;
                const slotMins = rowMins != null
                    ? Number(rowMins)
                    : clientYToSlotMins(e.clientY, metrics.bodyTop, metrics.slotPx, gridStartMin);
                const slotIdx = Math.max(0, (slotMins - gridStartMin) / SLOT_STEP_MIN);
                const slotTop = metrics.bodyTop + slotIdx * metrics.slotPx;

                axisDragRef.current = true;
                originRef.current = { x: e.clientX, y: slotTop };
                draggingRef.current = false;
                setAnchorRect(null);
                setMenuPos(null);
                setMarquee(buildMarqueeRect(courtBounds.left, slotTop, courtBounds.right, slotTop + metrics.slotPx));
                e.preventDefault();
                return;
            }

            axisDragRef.current = false;
            const card = target.closest('[data-reservation-card]');
            if (card && !card.hasAttribute('data-maintenance-block')) return;
            if (target.closest('[data-court-header]')) return;
            if (metrics && e.clientY < metrics.bodyTop) return;

            setAnchorRect(null);
            setMenuPos(null);
            originRef.current = { x: e.clientX, y: e.clientY };
            draggingRef.current = false;
            setMarquee(new DOMRect(e.clientX, e.clientY, 0, 0));
        };

        const onPointerMove = (e: PointerEvent) => {
            const origin = originRef.current;
            if (!origin) return;
            const dx = Math.abs(e.clientX - origin.x);
            const dy = Math.abs(e.clientY - origin.y);
            if (!draggingRef.current && dx + dy < DRAG_THRESHOLD_PX) return;

            if (!draggingRef.current) {
                draggingRef.current = true;
                setIsDragging(true);
                document.body.classList.add('grilla-marquee-selecting');
                window.getSelection()?.removeAllRanges();
            }

            const metrics = getGridBodyMetrics();
            const columnRects = getColumnRects();
            const courtBounds = getCourtsHorizontalBounds(columnRects);

            if (axisDragRef.current && metrics && courtBounds) {
                const v = snapMarqueeVertical(origin.y, e.clientY, metrics.bodyTop, metrics.bodyBottom, metrics.slotPx);
                setMarquee(buildMarqueeRect(courtBounds.left, v.top, courtBounds.right, v.bottom));
                return;
            }

            const left = Math.min(origin.x, e.clientX);
            const right = Math.max(origin.x, e.clientX);
            const top = Math.min(origin.y, e.clientY);
            const bottom = Math.max(origin.y, e.clientY);
            setMarquee(buildMarqueeRect(left, top, right, bottom));
        };

        const onPointerUp = (e: PointerEvent) => {
            const origin = originRef.current;
            if (!origin) return;

            const metrics = getGridBodyMetrics();
            const columnRects = getColumnRects();
            const courtBounds = getCourtsHorizontalBounds(columnRects);

            let rect: DOMRect;
            if (axisDragRef.current && metrics && courtBounds) {
                const v = snapMarqueeVertical(origin.y, e.clientY, metrics.bodyTop, metrics.bodyBottom, metrics.slotPx);
                rect = buildMarqueeRect(courtBounds.left, v.top, courtBounds.right, v.bottom);
            } else {
                const left = Math.min(origin.x, e.clientX);
                const right = Math.max(origin.x, e.clientX);
                const top = Math.min(origin.y, e.clientY);
                const bottom = Math.max(origin.y, e.clientY);
                rect = buildMarqueeRect(left, top, right, bottom);
            }

            if (draggingRef.current) finalizeSelection(rect);
            originRef.current = null;
            draggingRef.current = false;
            axisDragRef.current = false;
            setIsDragging(false);
            document.body.classList.remove('grilla-marquee-selecting');
            window.getSelection()?.removeAllRanges();
            setMarquee(null);
        };

        root.addEventListener('pointerdown', onPointerDown, { capture: true });
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        return () => {
            root.removeEventListener('pointerdown', onPointerDown, { capture: true });
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            document.body.classList.remove('grilla-marquee-selecting');
        };
    }, [
        listenRef,
        disabled,
        finalizeSelection,
        getColumnRects,
        getGridBodyMetrics,
        buildMarqueeRect,
        gridStartMin,
    ]);

    useLayoutEffect(() => {
        if (!anchorRect) {
            setMenuPos(null);
            return;
        }
        const menuH = menuRef.current?.offsetHeight ?? 220;
        setMenuPos(computeMarqueeMenuPosition(anchorRect, MENU_WIDTH, menuH));
    }, [anchorRect, selectedKeys.size, selectedCourtCount]);

    const closeMenu = useCallback(() => {
        setAnchorRect(null);
        setMenuPos(null);
        setSelectedSlots([]);
        onSelectionChange(new Set(), []);
    }, [onSelectionChange]);

    useEffect(() => {
        if (!anchorRect) return;
        const onDown = (e: PointerEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-marquee-menu]')) return;
            closeMenu();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeMenu();
        };
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [anchorRect, closeMenu]);

    useEffect(() => {
        if (disabled || selectedKeys.size === 0) {
            setAnchorRect(null);
            setMenuPos(null);
        }
    }, [disabled, selectedKeys.size]);

    const maintenanceBookings = collectMaintenanceBookingsForSlots(selectedSlots, reservations, gridStartHour);
    const hasMaintenance = maintenanceBookings.length > 0;
    const singleCourt = selectedCourtCount === 1;
    const count = selectedKeys.size;

    const items: { id: MarqueeAction; label: string; icon: React.ReactNode; show: boolean }[] = [
        { id: 'unblock_maintenance', label: 'Anular mantenimiento', icon: <Trash2 className="w-4 h-4 text-red-600" />, show: hasMaintenance },
        { id: 'match', label: 'Partido', icon: <Users className="w-4 h-4 text-[#005bc5]" />, show: singleCourt && !hasMaintenance },
        { id: 'class', label: 'Clase particular', icon: <GraduationCap className="w-4 h-4 text-[#9d174d]" />, show: singleCourt && !hasMaintenance },
        { id: 'tournament', label: 'Torneo', icon: <Trophy className="w-4 h-4 text-[#b45309]" />, show: !hasMaintenance },
        { id: 'maintenance', label: 'Mantenimiento', icon: <Wrench className="w-4 h-4 text-amber-700" />, show: !hasMaintenance },
    ];

    const menuNode = anchorRect && count > 0 && menuPos ? (
        <div
            ref={menuRef}
            data-marquee-menu
            className="fixed z-[250] bg-white rounded-xl shadow-2xl border border-gray-100 py-1 overflow-hidden"
            style={{ left: menuPos.left, top: menuPos.top, width: MENU_WIDTH }}
        >
            <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-[11px] font-bold text-gray-500">
                    {count} slot{count === 1 ? '' : 's'} · {selectedCourtCount} pista{selectedCourtCount === 1 ? '' : 's'}
                </p>
            </div>
            {items.filter((it) => it.show).map((it) => (
                <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                        setAnchorRect(null);
                        setMenuPos(null);
                        onAction(it.id);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm font-semibold flex items-center gap-2.5 transition-colors ${
                        it.id === 'unblock_maintenance'
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    {it.icon}
                    {it.label}
                </button>
            ))}
            <div className="border-t border-gray-100 mt-1">
                <button
                    type="button"
                    onClick={closeMenu}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-gray-400 hover:bg-gray-50"
                >
                    Cancelar
                </button>
            </div>
        </div>
    ) : null;

    return (
        <>
            {marquee && isDragging && (
                <div
                    className="fixed z-[60] pointer-events-none border-2 border-[#006A6A] bg-[#006A6A]/15 rounded-sm"
                    style={{
                        left: marquee.left,
                        top: marquee.top,
                        width: marquee.width,
                        height: marquee.height,
                    }}
                />
            )}
            {typeof document !== 'undefined' && menuNode ? createPortal(menuNode, document.body) : null}
        </>
    );
};
