import { apiFetchWithAuth } from './api';

export type Tariff = {
    id: string;
    club_id: string;
    name: string;
    price_cents: number;
    is_blocking: boolean;
    created_at: string;
    updated_at: string;
};

export type TariffDefaults = {
    club_id: string;
    weekday_tariff_id: string | null;
    weekend_tariff_id: string | null;
    updated_at?: string;
};

export type DayOverride = {
    id: string;
    club_id: string;
    date: string;
    tariff_id: string;
    label: string | null;
    source: 'holiday' | 'manual';
    created_at: string;
    updated_at: string;
};

export type CalendarDay = {
    date: string;
    dow: number;
    is_weekend: boolean;
    tariff_id: string | null;
    tariff_name: string | null;
    price_cents: number | null;
    is_blocking: boolean;
    origin: 'override' | 'default' | 'none';
    override_id: string | null;
    label: string | null;
    source: string | null;
    has_schedule: boolean;
    avg_price_cents: number | null;
};

// ---------- Tariffs CRUD ----------

export async function listTariffs(clubId: string): Promise<{ ok: true; tariffs: Tariff[] }> {
    return apiFetchWithAuth(`/tariffs?club_id=${encodeURIComponent(clubId)}`);
}

export async function createTariff(body: {
    club_id: string;
    name: string;
    price_cents: number;
    is_blocking?: boolean;
}): Promise<{ ok: true; tariff: Tariff }> {
    return apiFetchWithAuth('/tariffs', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateTariff(
    id: string,
    body: { name?: string; price_cents?: number; is_blocking?: boolean },
): Promise<{ ok: true; tariff: Tariff }> {
    return apiFetchWithAuth(`/tariffs/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteTariff(id: string): Promise<{ ok: true }> {
    return apiFetchWithAuth(`/tariffs/${id}`, { method: 'DELETE' });
}

// ---------- Defaults ----------

export async function getTariffDefaults(clubId: string): Promise<{ ok: true; defaults: TariffDefaults }> {
    return apiFetchWithAuth(`/tariffs/defaults?club_id=${encodeURIComponent(clubId)}`);
}

export async function saveTariffDefaults(body: {
    club_id: string;
    weekday_tariff_id: string | null;
    weekend_tariff_id: string | null;
}): Promise<{ ok: true; defaults: TariffDefaults }> {
    return apiFetchWithAuth('/tariffs/defaults', { method: 'PUT', body: JSON.stringify(body) });
}

// ---------- Day Overrides ----------

export async function putDayOverride(body: {
    club_id: string;
    date: string;
    tariff_id: string;
    label?: string | null;
    source?: 'holiday' | 'manual';
}): Promise<{ ok: true; override: DayOverride }> {
    return apiFetchWithAuth('/tariffs/overrides', { method: 'PUT', body: JSON.stringify(body) });
}

export async function deleteDayOverride(clubId: string, date: string): Promise<{ ok: true }> {
    return apiFetchWithAuth(
        `/tariffs/overrides?club_id=${encodeURIComponent(clubId)}&date=${encodeURIComponent(date)}`,
        { method: 'DELETE' },
    );
}

// ---------- Calendar ----------


export async function getTariffCalendar(
    clubId: string,
    year: number,
    month: number,
): Promise<{ ok: true; year: number; month: number; days: CalendarDay[]; tariffs: Tariff[]; defaults: TariffDefaults | null }> {
    const q = new URLSearchParams({ club_id: clubId, year: String(year), month: String(month) });
    return apiFetchWithAuth(`/tariffs/calendar?${q.toString()}`);
}

// ---------- Day Schedule (court × slot → tariff) ----------

export type DaySlotEntry = {
    court_id: string;
    slot: string;      // 'HH:MM'
    tariff_id: string;
};

export async function getDaySchedule(
    clubId: string,
    date: string,
): Promise<{ ok: true; slots: DaySlotEntry[] }> {
    const q = new URLSearchParams({ club_id: clubId, date });
    return apiFetchWithAuth(`/tariffs/schedule?${q.toString()}`);
}

export async function saveDaySchedule(
    clubId: string,
    date: string,
    slots: DaySlotEntry[],
): Promise<{ ok: true; saved: number }> {
    return apiFetchWithAuth('/tariffs/schedule', {
        method: 'PUT',
        body: JSON.stringify({ club_id: clubId, date, slots }),
    });
}

export async function repeatDaySchedule(
    clubId: string,
    sourceDate: string,
    targetDates: string[],
): Promise<{ ok: true; applied: number; rows_saved: number }> {
    return apiFetchWithAuth('/tariffs/schedule/repeat', {
        method: 'POST',
        body: JSON.stringify({ club_id: clubId, source_date: sourceDate, target_dates: targetDates }),
    });
}

export async function resetMonthSchedule(
    clubId: string,
    year: number,
    month: number,
): Promise<{ ok: true; deleted_slots: number; deleted_overrides: number }> {
    const q = new URLSearchParams({ club_id: clubId, year: String(year), month: String(month) });
    return apiFetchWithAuth(`/tariffs/schedule/month?${q.toString()}`, { method: 'DELETE' });
}
