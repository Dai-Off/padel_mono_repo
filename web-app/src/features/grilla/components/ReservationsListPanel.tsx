import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
    Filter,
    ChevronLeft,
    ChevronRight,
    Calendar,
    LayoutGrid,
    X,
    Pencil,
    Eye,
    Download,
    Trash2,
    Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import type { Court, Reservation } from '../types';
import { useGrillaTranslation } from '../i18n/useGrillaTranslation';
import {
    EMPTY_RESERVATION_LIST_FILTERS,
    countActiveFilters,
    filterReservations,
    getReservationEndTime,
    isReservationPaid,
    isReservationPartiallyPaid,
    averageElo,
    isReservationPlayersComplete,
    type ReservationListFilters,
} from '../utils/reservationListFilters';
import {
    buildReservationExcelRows,
    downloadReservationsExcel,
    isDeletableReservationId,
} from '../utils/exportReservationsExcel';
import { ReservationDetailModal } from './ReservationDetailModal';

const RESERVATION_TYPE_OPTIONS = [
    { value: 'standard', labelKey: 'type_standard' },
    { value: 'fixed_recurring', labelKey: 'type_fixed_recurring' },
    { value: 'open_match', labelKey: 'type_open_match' },
    { value: 'pozo', labelKey: 'type_pozo' },
    { value: 'school_group', labelKey: 'type_school_group' },
    { value: 'school_individual', labelKey: 'type_school_individual' },
    { value: 'school_course', labelKey: 'type_school_group' },
    { value: 'flat_rate', labelKey: 'type_flat_rate' },
    { value: 'tournament', labelKey: 'type_tournament' },
    { value: 'blocked', labelKey: 'type_blocked' },
] as const;

const STATUS_OPTIONS = [
    { value: 'pending_payment', label: 'Pendiente pago' },
    { value: 'partial_payment', label: 'Pago parcial' },
    { value: 'confirmed', label: 'Confirmada' },
    { value: 'completed', label: 'Completada' },
    { value: 'cancelled', label: 'Cancelada' },
    { value: 'flat_rate', label: 'Tarifa plana' },
    { value: 'no_show', label: 'No presentado' },
];

const SOURCE_OPTIONS = [
    { value: 'manual', label: 'Manual' },
    { value: 'web', label: 'Web' },
    { value: 'mobile', label: 'App móvil' },
    { value: 'system', label: 'Sistema' },
];

type Props = {
    reservations: Reservation[];
    courts: Court[];
    dateStr: string;
    clubName?: string;
    onDateChange: (dateStr: string) => void;
    onEditBooking: (bookingId: string) => void;
    onDeleteBookings: (bookingIds: string[]) => Promise<void>;
    onOpenGrid: () => void;
    loading?: boolean;
};

function formatDateLabel(dateStr: string): string {
    const d = new Date(`${dateStr}T12:00:00`);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    if (dateStr === todayStr) return 'Hoy';
    if (dateStr === tomorrowStr) return 'Mañana';
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function shiftDateStr(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const ReservationsListPanel: React.FC<Props> = ({
    reservations,
    courts,
    dateStr,
    clubName,
    onDateChange,
    onEditBooking,
    onDeleteBookings,
    onOpenGrid,
    loading,
}) => {
    const { t } = useGrillaTranslation();
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [filters, setFilters] = useState<ReservationListFilters>(EMPTY_RESERVATION_LIST_FILTERS);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [detailReservation, setDetailReservation] = useState<Reservation | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const filterPanelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSelectedIds(new Set());
    }, [dateStr, reservations]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) {
                const toggleBtn = document.getElementById('reservations-list-advanced-filter-toggle');
                if (toggleBtn?.contains(event.target as Node)) return;
                setShowAdvancedFilters(false);
            }
        };
        if (showAdvancedFilters) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAdvancedFilters]);

    const courtNames = useMemo(
        () => [...new Set(courts.map((c) => c.name).filter(Boolean))].sort(),
        [courts],
    );

    const sorted = useMemo(
        () => [...reservations].sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [reservations],
    );

    const filtered = useMemo(() => filterReservations(sorted, filters), [sorted, filters]);
    const advancedFilterCount = countActiveFilters(filters);

    const deletableFiltered = useMemo(
        () => filtered.filter((r) => isDeletableReservationId(r.id)),
        [filtered],
    );

    const typeLabel = useCallback((type: string) => {
        const key = `reservation.type_${type}`;
        const translated = t(key);
        return translated !== key ? translated : type;
    }, [t]);

    const statusLabel = (status: string) =>
        STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;

    const paymentLabel = (res: Reservation) => {
        if (isReservationPaid(res)) return t('reservationsList.paid');
        if (isReservationPartiallyPaid(res)) return t('reservationsList.partial');
        return t('reservationsList.unpaid');
    };

    const clearFilters = () => setFilters(EMPTY_RESERVATION_LIST_FILTERS);

    const setFilter = <K extends keyof ReservationListFilters>(key: K, value: ReservationListFilters[K]) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const toggleSelect = (id: string) => {
        if (!isDeletableReservationId(id)) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allDeletableSelected =
        deletableFiltered.length > 0 && deletableFiltered.every((r) => selectedIds.has(r.id));

    const toggleSelectAll = () => {
        if (allDeletableSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(deletableFiltered.map((r) => r.id)));
        }
    };

    const filterSummary = useMemo(() => {
        const parts: string[] = [];
        if (filters.court) parts.push(`pista=${filters.court}`);
        if (filters.status) parts.push(`estado=${statusLabel(filters.status)}`);
        if (filters.client) parts.push(`cliente=${filters.client}`);
        if (filters.priceMin || filters.priceMax) parts.push(`precio ${filters.priceMin || '0'}-${filters.priceMax || '∞'}€`);
        if (filters.reservationType) parts.push(`tipo=${typeLabel(filters.reservationType)}`);
        return parts.length ? parts.join('; ') : t('reservationsList.all');
    }, [filters, typeLabel, t]);

    const handleExportExcel = () => {
        const rows = buildReservationExcelRows(filtered, dateStr, {
            status: statusLabel,
            type: typeLabel,
        });
        downloadReservationsExcel({
            rows,
            dateStr,
            clubName,
            filterSummary,
        });
        toast.success(t('reservationsList.exportSuccess'));
    };

    const handleBulkDelete = async () => {
        const ids = [...selectedIds].filter(isDeletableReservationId);
        if (ids.length === 0) return;
        setDeleting(true);
        try {
            await onDeleteBookings(ids);
            setSelectedIds(new Set());
            setConfirmDelete(false);
            toast.success(t('reservationsList.deleteSuccess', { count: ids.length }));
        } catch {
            toast.error(t('reservationsList.deleteError'));
        } finally {
            setDeleting(false);
        }
    };

    const inputClass = 'w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#006A6A]';

    return (
        <div className="flex flex-col h-full min-h-0 bg-white">
            <div className="px-4 py-3 border-b shrink-0 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                        <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">
                            {t('reservationsList.title')}
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {filtered.length} / {sorted.length} · {selectedIds.size > 0 ? `${selectedIds.size} ${t('reservationsList.selected')}` : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                            <button type="button" onClick={() => onDateChange(shiftDateStr(dateStr, -1))} className="px-2 py-1.5 text-gray-400 hover:bg-gray-50 border-r border-gray-200">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-700 min-w-[90px] justify-center">
                                {formatDateLabel(dateStr)}
                                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            </div>
                            <button type="button" onClick={() => onDateChange(shiftDateStr(dateStr, 1))} className="px-2 py-1.5 text-gray-400 hover:bg-gray-50 border-l border-gray-200">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        <button type="button" onClick={onOpenGrid} title={t('navigation.backToGrid')} className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-[#006A6A]/5 hover:border-[#006A6A] hover:text-[#006A6A]">
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={handleExportExcel}
                            disabled={filtered.length === 0}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-emerald-600 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-40"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Excel
                        </button>
                        {selectedIds.size > 0 && (
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(true)}
                                disabled={deleting}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
                            >
                                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                {t('reservationsList.deleteSelected')} ({selectedIds.size})
                            </button>
                        )}
                        <div className="relative">
                            <button
                                id="reservations-list-advanced-filter-toggle"
                                type="button"
                                onClick={() => setShowAdvancedFilters((p) => !p)}
                                className={clsx(
                                    'p-1.5 border rounded-lg transition-colors relative',
                                    showAdvancedFilters || advancedFilterCount > 0
                                        ? 'border-[#006A6A] text-[#006A6A] bg-[#006A6A]/5'
                                        : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                                )}
                            >
                                <Filter className="w-4 h-4" />
                                {advancedFilterCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#006A6A] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                        {advancedFilterCount}
                                    </span>
                                )}
                            </button>
                            {showAdvancedFilters && (
                                <AdvancedFiltersPanel
                                    ref={filterPanelRef}
                                    filters={filters}
                                    setFilter={setFilter}
                                    typeLabel={typeLabel}
                                    activeFilterCount={advancedFilterCount}
                                    clearFilters={clearFilters}
                                    onClose={() => setShowAdvancedFilters(false)}
                                    t={t}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Filtros principales siempre visibles */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <FilterField label={t('reservationsList.filterDate')}>
                        <input type="date" value={dateStr} onChange={(e) => e.target.value && onDateChange(e.target.value)} className={inputClass} />
                    </FilterField>
                    <FilterField label={t('reservationsList.filterCourt')}>
                        <select value={filters.court} onChange={(e) => setFilter('court', e.target.value)} className={inputClass}>
                            <option value="">{t('reservationsList.all')}</option>
                            {courtNames.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label={t('reservationsList.filterStatus')}>
                        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className={inputClass}>
                            <option value="">{t('reservationsList.all')}</option>
                            {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label={t('reservationsList.filterClient')}>
                        <input type="text" value={filters.client} onChange={(e) => setFilter('client', e.target.value)} placeholder={t('reservationsList.clientPlaceholder')} className={inputClass} />
                    </FilterField>
                    <FilterField label={t('reservationsList.filterPriceMin')}>
                        <input type="number" min={0} step="0.01" value={filters.priceMin} onChange={(e) => setFilter('priceMin', e.target.value)} className={inputClass} placeholder="0" />
                    </FilterField>
                    <FilterField label={t('reservationsList.filterPriceMax')}>
                        <input type="number" min={0} step="0.01" value={filters.priceMax} onChange={(e) => setFilter('priceMax', e.target.value)} className={inputClass} placeholder="∞" />
                    </FilterField>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-sm text-gray-500">{t('reservationsList.loading')}</div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2">
                        <p className="text-sm font-medium">{t('reservationsList.empty')}</p>
                        {advancedFilterCount > 0 && (
                            <button type="button" onClick={clearFilters} className="text-xs text-[#006A6A] font-semibold hover:underline">
                                {t('reservationsList.clearFilters')}
                            </button>
                        )}
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                            <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                <th className="px-2 py-2.5 w-10">
                                    <input
                                        type="checkbox"
                                        checked={allDeletableSelected}
                                        onChange={toggleSelectAll}
                                        disabled={deletableFiltered.length === 0}
                                        title={t('reservationsList.selectAll')}
                                        className="rounded border-gray-300 text-[#006A6A] focus:ring-[#006A6A]"
                                    />
                                </th>
                                <th className="px-3 py-2.5">{t('reservationsList.colTime')}</th>
                                <th className="px-3 py-2.5">{t('reservationsList.colCourt')}</th>
                                <th className="px-3 py-2.5">{t('reservationsList.colType')}</th>
                                <th className="px-3 py-2.5">{t('reservationsList.colClient')}</th>
                                <th className="px-3 py-2.5">{t('reservationsList.colPlayers')}</th>
                                <th className="px-3 py-2.5">{t('reservationsList.colElo')}</th>
                                <th className="px-3 py-2.5">{t('reservationsList.colStatus')}</th>
                                <th className="px-3 py-2.5">{t('reservationsList.colPayment')}</th>
                                <th className="px-3 py-2.5">{t('reservationsList.colPrice')}</th>
                                <th className="px-3 py-2.5">{t('reservationsList.colSource')}</th>
                                <th className="px-3 py-2.5 w-20">{t('reservationsList.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.map((res) => {
                                const elo = averageElo(res);
                                const playersN = res.detailedPlayers?.length ?? (res.playerName ? 1 : 0);
                                const complete = isReservationPlayersComplete(res);
                                const canDelete = isDeletableReservationId(res.id);
                                const isSelected = selectedIds.has(res.id);
                                return (
                                    <tr
                                        key={res.id}
                                        className={clsx(
                                            'text-xs text-gray-800 transition-colors',
                                            isSelected ? 'bg-[#006A6A]/10' : 'hover:bg-gray-50',
                                        )}
                                    >
                                        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                disabled={!canDelete}
                                                onChange={() => toggleSelect(res.id)}
                                                title={canDelete ? undefined : t('reservationsList.notDeletable')}
                                                className="rounded border-gray-300 text-[#006A6A] focus:ring-[#006A6A] disabled:opacity-30"
                                            />
                                        </td>
                                        <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                                            {res.startTime} – {getReservationEndTime(res)}
                                            <span className="text-gray-400 ml-1">({res.durationMinutes}′)</span>
                                        </td>
                                        <td className="px-3 py-2.5 font-medium">{res.courtName ?? '—'}</td>
                                        <td className="px-3 py-2.5">
                                            <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-semibold">
                                                {typeLabel(res.booking_type)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 max-w-[180px] truncate" title={res.playerName}>{res.playerName || '—'}</td>
                                        <td className="px-3 py-2.5">
                                            <span className={clsx('font-semibold', complete ? 'text-emerald-700' : 'text-amber-700')}>
                                                {playersN}
                                                {!complete && expectedSlotsLabel(res.booking_type) && (
                                                    <span className="text-gray-400 font-normal">/{expectedSlotsLabel(res.booking_type)}</span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 font-mono">{elo != null ? elo.toFixed(2) : '—'}</td>
                                        <td className="px-3 py-2.5">{statusLabel(res.status)}</td>
                                        <td className="px-3 py-2.5">
                                            <span className={clsx(
                                                'font-semibold',
                                                isReservationPaid(res) && 'text-emerald-700',
                                                isReservationPartiallyPaid(res) && 'text-amber-700',
                                                !isReservationPaid(res) && !isReservationPartiallyPaid(res) && 'text-red-600',
                                            )}>
                                                {paymentLabel(res)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 font-mono">
                                            {res.totalPrice != null ? `${res.totalPrice.toFixed(2)} €` : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-gray-500 capitalize">{res.source_channel ?? '—'}</td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setDetailReservation(res)}
                                                    className="p-1 rounded hover:bg-gray-100 text-gray-500"
                                                    title={t('reservationsList.viewDetail')}
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onEditBooking(res.id)}
                                                    className="p-1 rounded hover:bg-gray-100 text-gray-500"
                                                    title={t('reservation.edit')}
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <ReservationDetailModal
                reservation={detailReservation}
                dateStr={dateStr}
                onClose={() => setDetailReservation(null)}
                onEdit={onEditBooking}
            />

            {confirmDelete && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40" onClick={() => !deleting && setConfirmDelete(false)}>
                    <div className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-gray-900">{t('reservationsList.confirmDeleteTitle')}</h3>
                        <p className="text-sm text-gray-600 mt-2">
                            {t('reservationsList.confirmDeleteBody', { count: selectedIds.size })}
                        </p>
                        <div className="flex gap-2 mt-5 justify-end">
                            <button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                                {t('reservation.cancel')}
                            </button>
                            <button type="button" disabled={deleting} onClick={() => void handleBulkDelete()} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-1.5">
                                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                                {t('reservationsList.confirmDeleteYes')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const AdvancedFiltersPanel = React.forwardRef<
    HTMLDivElement,
    {
        filters: ReservationListFilters;
        setFilter: <K extends keyof ReservationListFilters>(key: K, value: ReservationListFilters[K]) => void;
        typeLabel: (type: string) => string;
        activeFilterCount: number;
        clearFilters: () => void;
        onClose: () => void;
        t: (key: string, opts?: Record<string, string | number>) => string;
    }
>(function AdvancedFiltersPanel(
    { filters, setFilter, typeLabel, activeFilterCount, clearFilters, onClose, t },
    ref,
) {
    const inputClass = 'w-full px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#006A6A]';
    return (
        <div ref={ref} className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-[min(100vw-2rem,640px)] max-h-[60vh] overflow-y-auto">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">{t('reservationsList.advancedFilters')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FilterField label={t('reservationsList.filterType')}>
                    <select value={filters.reservationType} onChange={(e) => setFilter('reservationType', e.target.value)} className={inputClass}>
                        <option value="">{t('reservationsList.all')}</option>
                        {RESERVATION_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{typeLabel(opt.value)}</option>
                        ))}
                    </select>
                </FilterField>
                <FilterField label={t('reservationsList.filterPayment')}>
                    <select value={filters.payment} onChange={(e) => setFilter('payment', e.target.value as ReservationListFilters['payment'])} className={inputClass}>
                        <option value="">{t('reservationsList.all')}</option>
                        <option value="paid">{t('reservationsList.paid')}</option>
                        <option value="unpaid">{t('reservationsList.unpaid')}</option>
                        <option value="partial">{t('reservationsList.partial')}</option>
                    </select>
                </FilterField>
                <FilterField label={t('reservationsList.filterSource')}>
                    <select value={filters.sourceChannel} onChange={(e) => setFilter('sourceChannel', e.target.value)} className={inputClass}>
                        <option value="">{t('reservationsList.all')}</option>
                        {SOURCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </FilterField>
                <FilterField label={t('reservationsList.filterPlayers')}>
                    <select value={filters.playersFill} onChange={(e) => setFilter('playersFill', e.target.value as ReservationListFilters['playersFill'])} className={inputClass}>
                        <option value="">{t('reservationsList.all')}</option>
                        <option value="complete">{t('reservationsList.playersComplete')}</option>
                        <option value="incomplete">{t('reservationsList.playersIncomplete')}</option>
                    </select>
                </FilterField>
                <FilterField label={t('reservationsList.filterEloMin')}>
                    <input type="number" step="0.01" min={0} value={filters.eloMin} onChange={(e) => setFilter('eloMin', e.target.value)} className={inputClass} />
                </FilterField>
                <FilterField label={t('reservationsList.filterEloMax')}>
                    <input type="number" step="0.01" min={0} value={filters.eloMax} onChange={(e) => setFilter('eloMax', e.target.value)} className={inputClass} />
                </FilterField>
                <FilterField label={t('reservationsList.filterTimeFrom')}>
                    <input type="time" value={filters.timeFrom} onChange={(e) => setFilter('timeFrom', e.target.value)} className={inputClass} />
                </FilterField>
                <FilterField label={t('reservationsList.filterTimeTo')}>
                    <input type="time" value={filters.timeTo} onChange={(e) => setFilter('timeTo', e.target.value)} className={inputClass} />
                </FilterField>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                {activeFilterCount > 0 ? (
                    <button type="button" onClick={clearFilters} className="px-2.5 py-1 text-[10px] font-bold text-red-600 hover:bg-red-50 rounded-lg border border-red-200 flex items-center gap-1">
                        <X className="w-3 h-3" />
                        {t('reservationsList.clearFilters')}
                    </button>
                ) : <span />}
                <button type="button" onClick={onClose} className="px-3 py-1 text-xs font-semibold text-[#006A6A] hover:bg-[#006A6A]/5 rounded-lg">
                    {t('reservationsList.apply')}
                </button>
            </div>
        </div>
    );
});

function expectedSlotsLabel(type: string): string | null {
    if (type === 'blocked' || type === 'tournament' || type === 'flat_rate') return null;
    if (type === 'school_group' || type === 'school_individual' || type === 'school_course') return '1';
    return '4';
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}
