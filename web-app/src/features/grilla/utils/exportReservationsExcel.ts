import * as XLSX from 'xlsx';
import type { Reservation } from '../types';
import {
    averageElo,
    getReservationEndTime,
    isReservationPaid,
    isReservationPartiallyPaid,
} from './reservationListFilters';

export type ReservationExcelRow = {
    fecha: string;
    horaInicio: string;
    horaFin: string;
    duracionMin: number;
    pista: string;
    tipo: string;
    cliente: string;
    jugadores: string;
    numJugadores: number;
    eloMedio: number | '';
    estado: string;
    pago: string;
    precioEur: number | '';
    cobradoEur: number | '';
    pendienteEur: number | '';
    canal: string;
    notas: string;
    id: string;
};

function paymentText(res: Reservation): string {
    if (isReservationPaid(res)) return 'Pagado';
    if (isReservationPartiallyPaid(res)) return 'Pago parcial';
    return 'Pendiente';
}

function playersText(res: Reservation): string {
    const list = res.detailedPlayers?.map((p) => p.name).filter(Boolean) ?? [];
    if (list.length > 0) return list.join('; ');
    return res.playerName || '';
}

export function buildReservationExcelRows(
    reservations: Reservation[],
    dateStr: string,
    labels: {
        status: (s: string) => string;
        type: (t: string) => string;
    },
): ReservationExcelRow[] {
    return reservations.map((res) => {
        const total = res.totalPrice ?? 0;
        const paid = (res.totalPaidCents ?? 0) / 100;
        const pending = Math.max(0, total - paid);
        const elo = averageElo(res);
        return {
            fecha: dateStr,
            horaInicio: res.startTime,
            horaFin: getReservationEndTime(res),
            duracionMin: res.durationMinutes,
            pista: res.courtName ?? '',
            tipo: labels.type(res.booking_type),
            cliente: res.playerName || '',
            jugadores: playersText(res),
            numJugadores: res.detailedPlayers?.length ?? (res.playerName ? 1 : 0),
            eloMedio: elo != null ? Math.round(elo * 100) / 100 : '',
            estado: labels.status(res.status),
            pago: paymentText(res),
            precioEur: res.totalPrice != null ? res.totalPrice : '',
            cobradoEur: paid > 0 ? Math.round(paid * 100) / 100 : '',
            pendienteEur: total > 0 ? Math.round(pending * 100) / 100 : '',
            canal: res.source_channel ?? '',
            notas: res.notes ?? '',
            id: res.id,
        };
    });
}

const HEADERS: { key: keyof ReservationExcelRow; label: string; width: number }[] = [
    { key: 'fecha', label: 'Fecha', width: 12 },
    { key: 'horaInicio', label: 'Hora inicio', width: 10 },
    { key: 'horaFin', label: 'Hora fin', width: 10 },
    { key: 'duracionMin', label: 'Duración (min)', width: 14 },
    { key: 'pista', label: 'Pista', width: 16 },
    { key: 'tipo', label: 'Tipo reserva', width: 22 },
    { key: 'cliente', label: 'Cliente / título', width: 28 },
    { key: 'jugadores', label: 'Jugadores', width: 36 },
    { key: 'numJugadores', label: 'Nº jug.', width: 8 },
    { key: 'eloMedio', label: 'Elo medio', width: 10 },
    { key: 'estado', label: 'Estado', width: 16 },
    { key: 'pago', label: 'Pago', width: 14 },
    { key: 'precioEur', label: 'Precio (€)', width: 12 },
    { key: 'cobradoEur', label: 'Cobrado (€)', width: 12 },
    { key: 'pendienteEur', label: 'Pendiente (€)', width: 12 },
    { key: 'canal', label: 'Canal', width: 12 },
    { key: 'notas', label: 'Notas', width: 24 },
    { key: 'id', label: 'ID reserva', width: 38 },
];

export function downloadReservationsExcel(opts: {
    rows: ReservationExcelRow[];
    dateStr: string;
    clubName?: string;
    filterSummary?: string;
}): void {
    const { rows, dateStr, clubName, filterSummary } = opts;
    const headerLabels = HEADERS.map((h) => h.label);
    const dataRows = rows.map((r) => HEADERS.map((h) => r[h.key] ?? ''));

    const titleLine = [`Lista de reservas — ${clubName?.trim() || 'Club'} — ${dateStr}`];
    const metaLine = filterSummary ? [`Filtros: ${filterSummary}`] : [];
    const exportLine = [`Exportado: ${new Date().toLocaleString('es-ES')}`, `Total filas: ${rows.length}`];
    const blank: string[] = [];
    const headerRowIndex = titleLine.length + metaLine.length + exportLine.length + 1;
    const sheetData: (string | number)[][] = [
        titleLine,
        ...metaLine,
        exportLine,
        blank,
        headerLabels,
        ...dataRows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const lastCol = XLSX.utils.encode_col(HEADERS.length - 1);
    const lastDataRow = headerRowIndex + 1 + dataRows.length;

    ws['!cols'] = HEADERS.map((h) => ({ wch: h.width }));
    ws['!autofilter'] = { ref: `A${headerRowIndex + 1}:${lastCol}${lastDataRow}` };
    ws['!freeze'] = { xSplit: 0, ySplit: headerRowIndex + 1, topLeftCell: `A${headerRowIndex + 2}`, activePane: 'bottomLeft', state: 'frozen' };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reservas');

    const safeDate = dateStr.replace(/[^\d-]/g, '');
    XLSX.writeFile(wb, `reservas_${safeDate}.xlsx`, { bookType: 'xlsx', compression: true });
}

export function isDeletableReservationId(id: string): boolean {
    return !id.startsWith('school-slot-') && !id.startsWith('school-private-slot-');
}
