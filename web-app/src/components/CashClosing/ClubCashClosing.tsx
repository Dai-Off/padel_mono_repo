import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Calculator, CheckCircle2, History, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageSpinner } from '../Layout/PageSpinner';
import { clubStaffService } from '../../services/clubStaff';
import { HttpError } from '../../services/api';
import {
  paymentsService,
  type CashClosingBookingExpected,
  type CashOpeningSavedRecord,
  type CashClosingSavedRecord,
} from '../../services/payments';
import type { ClubStaffMember } from '../../types/clubStaff';

type CashBreakdown = {
  bills_500: number;
  bills_200: number;
  bills_100: number;
  bills_50: number;
  bills_20: number;
  bills_10: number;
  bills_5: number;
  coins_2: number;
  coins_1: number;
  coins_050: number;
  coins_020: number;
  coins_010: number;
  coins_005: number;
  coins_002: number;
  coins_001: number;
};

type CashClosingRecord = {
  id: string;
  date: Date;
  employeeName: string;
  realCashTotal: number;
  realCardTotal: number;
  systemCashTotal: number;
  systemCardTotal: number;
  totalDifference: number;
  observations: string;
  status: 'perfect' | 'surplus' | 'deficit';
};

function localDateYmd(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mapSavedToLocal(r: CashClosingSavedRecord): CashClosingRecord {
  return {
    id: r.id,
    date: new Date(r.closed_at),
    employeeName: r.employee_name,
    realCashTotal: r.real_cash_cents / 100,
    realCardTotal: r.real_card_cents / 100,
    systemCashTotal: r.system_cash_cents / 100,
    systemCardTotal: r.system_card_cents / 100,
    totalDifference: r.difference_cents / 100,
    observations: r.observations ?? '',
    status: r.status,
  };
}

const emptyBreakdown: CashBreakdown = {
  bills_500: 0, bills_200: 0, bills_100: 0, bills_50: 0, bills_20: 0, bills_10: 0, bills_5: 0,
  coins_2: 0, coins_1: 0, coins_050: 0, coins_020: 0, coins_010: 0, coins_005: 0, coins_002: 0, coins_001: 0,
};

const denominations: { key: keyof CashBreakdown; label: string; value: number }[] = [
  { key: 'bills_500', label: '500EUR', value: 500 }, { key: 'bills_200', label: '200EUR', value: 200 }, { key: 'bills_100', label: '100EUR', value: 100 },
  { key: 'bills_50', label: '50EUR', value: 50 }, { key: 'bills_20', label: '20EUR', value: 20 }, { key: 'bills_10', label: '10EUR', value: 10 }, { key: 'bills_5', label: '5EUR', value: 5 },
  { key: 'coins_2', label: '2EUR', value: 2 }, { key: 'coins_1', label: '1EUR', value: 1 }, { key: 'coins_050', label: '0.50EUR', value: 0.5 },
  { key: 'coins_020', label: '0.20EUR', value: 0.2 }, { key: 'coins_010', label: '0.10EUR', value: 0.1 }, { key: 'coins_005', label: '0.05EUR', value: 0.05 },
  { key: 'coins_002', label: '0.02EUR', value: 0.02 }, { key: 'coins_001', label: '0.01EUR', value: 0.01 },
];

function staffRoleAllowsCashLedger(role: string | null | undefined): boolean {
  const r = String(role ?? '').trim().toLowerCase();
  return !/entrenador|entrenadora|coach|trainer|profesor/.test(r);
}

export function ClubCashClosingTab({
  clubId,
  clubResolved = true,
}: {
  clubId: string | null;
  clubResolved?: boolean;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<'new' | 'history'>('new');
  const [staff, setStaff] = useState<ClubStaffMember[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const selectedEmployeeName = useMemo(
    () => staff.find((s) => s.id === employeeId)?.name ?? '',
    [staff, employeeId]
  );
  const [observations, setObservations] = useState('');
  const [cardTotal, setCardTotal] = useState('');
  const [cashBreakdown, setCashBreakdown] = useState<CashBreakdown>(emptyBreakdown);
  const [historyRecords, setHistoryRecords] = useState<CashClosingRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expectedBookings, setExpectedBookings] = useState<CashClosingBookingExpected[]>([]);
  const [systemCashTotal, setSystemCashTotal] = useState(0);
  const [systemCardTotal, setSystemCardTotal] = useState(0);
  const [loadingExpected, setLoadingExpected] = useState(true);
  const [saving, setSaving] = useState(false);
  const [operativeDate, setOperativeDate] = useState(localDateYmd());
  const [openingRecord, setOpeningRecord] = useState<CashOpeningSavedRecord | null>(null);
  const [needsNewOpeningAfterClosing, setNeedsNewOpeningAfterClosing] = useState(false);
  const [openingEmployeeId, setOpeningEmployeeId] = useState('');
  const [openingCashTotal, setOpeningCashTotal] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');
  const [savingOpening, setSavingOpening] = useState(false);
  const operativeTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
    } catch {
      return 'Europe/Madrid';
    }
  }, []);

  const staffForCashOperations = useMemo(
    () => staff.filter((m) => m.status === 'active' && staffRoleAllowsCashLedger(m.role)),
    [staff],
  );

  useEffect(() => {
    if (employeeId && !staffForCashOperations.some((s) => s.id === employeeId)) {
      setEmployeeId('');
    }
  }, [staffForCashOperations, employeeId]);

  useEffect(() => {
    if (openingEmployeeId && !staffForCashOperations.some((s) => s.id === openingEmployeeId)) {
      setOpeningEmployeeId('');
    }
  }, [staffForCashOperations, openingEmployeeId]);

  const realCashTotal = useMemo(
    () => denominations.reduce((acc, d) => acc + (cashBreakdown[d.key] * d.value), 0),
    [cashBreakdown],
  );
  const realCardTotal = Number(cardTotal) || 0;
  const totalDifference = (realCashTotal + realCardTotal) - (systemCashTotal + systemCardTotal);

  const canSave = employeeId.trim() !== '';

  const filteredHistory = historyRecords.filter((r) => {
    const q = searchTerm.toLowerCase();
    return r.employeeName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
  });

  const openingAppliesToSelectedDay = useMemo(() => {
    if (!openingRecord) return false;
    const raw = openingRecord.for_date;
    if (raw == null || String(raw).trim() === '') return true;
    return String(raw).slice(0, 10) === operativeDate;
  }, [openingRecord, operativeDate]);

  useEffect(() => {
    if (!needsNewOpeningAfterClosing) return;
    setOpeningEmployeeId('');
    setOpeningCashTotal('');
    setOpeningNotes('');
  }, [needsNewOpeningAfterClosing]);

  useEffect(() => {
    if (!clubResolved || !clubId) return;
    let cancelled = false;
    setLoadingExpected(true);
    setOpeningRecord(null);

    (async () => {
      try {
        const [staffRows, expected, opening] = await Promise.all([
          clubStaffService.list(clubId),
          paymentsService.getCashClosingExpected(clubId, operativeDate, operativeTimezone),
          paymentsService.getCashOpeningForDay(clubId, operativeDate),
        ]);
        if (cancelled) return;

        setStaff(staffRows ?? []);
        setExpectedBookings(expected.bookings ?? []);
        setSystemCashTotal(expected.systemCashTotal_eur ?? 0);
        setSystemCardTotal(expected.systemCardTotal_eur ?? 0);
        setOpeningRecord(opening.opening ?? null);
        setNeedsNewOpeningAfterClosing(expected.needs_new_opening_after_closing === true);

        try {
          const recs = await paymentsService.listCashClosingRecords(clubId, 50, operativeDate);
          if (!cancelled) setHistoryRecords(recs.map(mapSavedToLocal));
        } catch (histErr) {
          if (!cancelled) setHistoryRecords([]);
          if (!cancelled && histErr instanceof HttpError && histErr.status === 503) {
            toast.error(
              'Falta la tabla de arqueos en la base de datos. Aplica la migración 012_club_cash_closings.sql en Supabase.'
            );
          } else if (!cancelled) {
            toast.error((histErr as Error).message || t('payments_load_error'));
          }
        }
      } catch (e) {
        if (cancelled) return;
        setOpeningRecord(null);
        setNeedsNewOpeningAfterClosing(false);
        setExpectedBookings([]);
        setSystemCashTotal(0);
        setSystemCardTotal(0);
        toast.error((e as Error).message || t('payments_load_error'));
      } finally {
        if (!cancelled) setLoadingExpected(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clubId, clubResolved, operativeDate, operativeTimezone]);

  const saveClosing = async () => {
    if (!canSave || !clubId) return;
    if (!selectedEmployeeName) return;
    setSaving(true);
    try {
      const forDate = operativeDate;
      const saved = await paymentsService.createCashClosingRecord({
        club_id: clubId,
        staff_id: employeeId,
        for_date: forDate,
        real_cash_cents: Math.round(realCashTotal * 100),
        real_card_cents: Math.round(realCardTotal * 100),
        system_cash_cents: Math.round(systemCashTotal * 100),
        system_card_cents: Math.round(systemCardTotal * 100),
        observations: observations.trim() || undefined,
      });
      const refreshedExpected = await paymentsService.getCashClosingExpected(clubId, saved.for_date, operativeTimezone);
      setHistoryRecords((prev) => [mapSavedToLocal(saved), ...prev]);
      setExpectedBookings(refreshedExpected.bookings ?? []);
      setSystemCashTotal(refreshedExpected.systemCashTotal_eur ?? 0);
      setSystemCardTotal(refreshedExpected.systemCardTotal_eur ?? 0);
      setNeedsNewOpeningAfterClosing(refreshedExpected.needs_new_opening_after_closing === true);
      setCashBreakdown(emptyBreakdown);
      setCardTotal('');
      setEmployeeId('');
      setObservations('');
      setView('history');
    } catch (e) {
      if (e instanceof HttpError && e.status === 503) {
        toast.error(
          'Falta la tabla de arqueos en la base de datos. Aplica la migración 012_club_cash_closings.sql en Supabase.'
        );
      } else {
        toast.error((e as Error).message || t('payments_load_error'));
      }
    } finally {
      setSaving(false);
    }
  };

  const saveOpening = async () => {
    if (!clubId || !openingEmployeeId) return;
    const openingCashCents = Math.round((Number(openingCashTotal) || 0) * 100);
    if (openingCashCents < 0) return;
    setSavingOpening(true);
    try {
      const forDate = operativeDate;
      const saved = await paymentsService.createCashOpeningRecord({
        club_id: clubId,
        staff_id: openingEmployeeId,
        for_date: forDate,
        opening_cash_cents: openingCashCents,
        notes: openingNotes.trim() || undefined,
      });
      setOpeningRecord(saved);
      const expected = await paymentsService.getCashClosingExpected(clubId, saved.for_date, operativeTimezone);
      setExpectedBookings(expected.bookings ?? []);
      setSystemCashTotal(expected.systemCashTotal_eur ?? 0);
      setSystemCardTotal(expected.systemCardTotal_eur ?? 0);
      setNeedsNewOpeningAfterClosing(expected.needs_new_opening_after_closing === true);
      setEmployeeId(saved.staff_id ?? '');
      setOpeningCashTotal('');
      setOpeningNotes('');
      toast.success(t('cash_opening_success'));
    } catch (e) {
      toast.error((e as Error).message || t('payments_load_error'));
    } finally {
      setSavingOpening(false);
    }
  };

  if (!clubResolved) return <PageSpinner />;
  if (!clubId) return <p className="text-sm text-gray-500 text-center py-12">No se pudo determinar el club.</p>;
  if (loadingExpected) return <PageSpinner />;
  const showOpeningOnly = !openingAppliesToSelectedDay || needsNewOpeningAfterClosing;
  if (showOpeningOnly) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">{t('cash_opening_daily_title')}</h2>
          <p className="text-[11px] text-gray-500 mt-1">{t('cash_opening_daily_sub')}</p>
          {needsNewOpeningAfterClosing && (
            <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">{t('cash_after_close_hint')}</p>
          )}
        </div>
        {staff.length > 0 && staffForCashOperations.length === 0 && (
          <p className="text-[11px] text-amber-800 font-medium max-w-xl">{t('cash_no_staff_authorized_for_caja')}</p>
        )}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 max-w-xl">
          <input
            type="date"
            value={operativeDate}
            onChange={(e) => setOperativeDate(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
          />
          <select
            value={openingEmployeeId}
            onChange={(e) => setOpeningEmployeeId(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
          >
            <option value="">{t('cash_opening_employee')}</option>
            {staffForCashOperations.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            step="0.01"
            value={openingCashTotal}
            onChange={(e) => setOpeningCashTotal(e.target.value)}
            placeholder={t('cash_opening_initial_placeholder')}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
          />
          <textarea
            value={openingNotes}
            onChange={(e) => setOpeningNotes(e.target.value)}
            placeholder={t('cash_opening_notes_placeholder')}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs resize-none"
            rows={3}
          />
          <button
            type="button"
            onClick={() => void saveOpening()}
            disabled={!openingEmployeeId || savingOpening || staffForCashOperations.length === 0}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1A1A1A] text-white disabled:opacity-40"
          >
            {savingOpening ? t('loading') : t('cash_opening_save')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">{t('cash_closing_title')}</h2>
          <p className="text-[10px] text-gray-400">{operativeDate}</p>
          <p className="text-[10px] text-gray-500 mt-1">
            {openingRecord
              ? t('cash_opening_banner', {
                  amount: (openingRecord.opening_cash_cents / 100).toFixed(2),
                  name: openingRecord.employee_name,
                })
              : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={operativeDate}
            onChange={(e) => setOperativeDate(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-[#1A1A1A]"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-2xl">
          <button onClick={() => setView('new')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${view === 'new' ? 'bg-[#1A1A1A] text-white' : 'text-gray-500'}`}>
            <Calculator className="w-3.5 h-3.5" />
            {t('cash_closing_new')}
          </button>
          <button onClick={() => setView('history')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${view === 'history' ? 'bg-[#1A1A1A] text-white' : 'text-gray-500'}`}>
            <History className="w-3.5 h-3.5" />
            {t('cash_closing_history')}
          </button>
        </div>
      </div>

      {view === 'new' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="text-[10px] text-gray-400 mb-1 font-semibold">{t('cash_counted')}</div>
            <div className="text-lg font-black text-[#1A1A1A]">{realCashTotal.toFixed(2)}€</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="text-[10px] text-gray-400 mb-1 font-semibold">{t('cards')}</div>
            <div className="text-lg font-black text-[#1A1A1A]">{realCardTotal.toFixed(2)}€</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="text-[10px] text-gray-400 mb-1 font-semibold">{t('cash_total_real')}</div>
            <div className="text-lg font-black text-[#1A1A1A]">{(realCashTotal + realCardTotal).toFixed(2)}€</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="text-[10px] text-gray-400 mb-1 font-semibold">{t('cash_difference')}</div>
            <div className={`text-lg font-black flex items-center gap-1 ${
              Math.abs(totalDifference) < 0.01
                ? 'text-green-600'
                : totalDifference > 0
                  ? 'text-blue-600'
                  : 'text-red-600'
            }`}>
              {Math.abs(totalDifference) < 0.01 ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : totalDifference > 0 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
              {totalDifference > 0 ? '+' : ''}
              {totalDifference.toFixed(2)}€
            </div>
          </div>
        </div>
      )}

      {view === 'new' ? (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-xs font-bold text-[#1A1A1A] mb-4">{t('cash_counting')}</h3>
            <div className="grid md:grid-cols-2 gap-2">
              {denominations.map((d) => (
                <div key={d.key} className="flex items-center gap-2 p-2 rounded-xl border border-gray-100">
                  <div className="w-20 text-xs font-bold text-[#1A1A1A]">{d.label}</div>
                  <input
                    type="number"
                    min={0}
                    value={cashBreakdown[d.key] || ''}
                    onChange={(e) => setCashBreakdown((prev) => ({ ...prev, [d.key]: Math.max(0, parseInt(e.target.value || '0', 10) || 0) }))}
                    className="w-20 px-2 py-1.5 rounded-xl border border-gray-200 text-xs"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-gray-400 ml-auto">{(cashBreakdown[d.key] * d.value).toFixed(2)}€</span>
                </div>
              ))}
            </div>
            {staff.length > 0 && staffForCashOperations.length === 0 && (
              <p className="mt-3 text-[11px] text-amber-800 font-medium">{t('cash_no_staff_authorized_for_caja')}</p>
            )}
            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
              >
                <option value="">{t('cash_employee')}</option>
                {staffForCashOperations.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                value={cardTotal}
                onChange={(e) => setCardTotal(e.target.value)}
                placeholder={t('cards')}
                className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
              />
            </div>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder={t('cash_observations')}
              className="w-full mt-3 px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs resize-none"
              rows={3}
            />
            <div className="mt-4 bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <h4 className="text-[10px] font-bold text-gray-500 mb-2">Esperado ({operativeDate})</h4>
              {loadingExpected ? (
                <p className="text-xs text-gray-400">Cargando...</p>
              ) : expectedBookings.length === 0 ? (
                <p className="text-xs text-gray-400">Sin pagos registrados para este día.</p>
              ) : (
                <div className="space-y-2 max-h-[180px] overflow-auto pr-1">
                  {expectedBookings.slice(0, 12).map((b) => {
                    const time = b.start_at
                      ? new Date(b.start_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                      : '-';
                    return (
                      <div key={b.booking_id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1A1A1A] truncate">{b.court_name ?? 'Reserva'}</p>
                          <p className="text-[10px] text-gray-400">{time}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-500">Físico: €{(b.cash_paid_cents / 100).toFixed(2)}</p>
                          <p className="text-[10px] text-gray-500">Tarjeta: €{(b.card_paid_cents / 100).toFixed(2)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void saveClosing()}
              disabled={!canSave || saving || staffForCashOperations.length === 0}
              className="mt-4 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1A1A1A] text-white disabled:opacity-40"
            >
              {saving ? t('loading') : t('cash_save_closing')}
            </button>
          </div>

          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[10px] text-gray-400">{t('cash_total_real')}</p>
              <p className="text-lg font-black text-[#1A1A1A]">{(realCashTotal + realCardTotal).toFixed(2)}€</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[10px] text-gray-400">{t('cash_difference')}</p>
              <p className={`text-lg font-black flex items-center gap-1 ${Math.abs(totalDifference) < 0.01 ? 'text-green-600' : totalDifference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {Math.abs(totalDifference) < 0.01 ? <CheckCircle2 className="w-5 h-5" /> : totalDifference > 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {totalDifference > 0 ? '+' : ''}
                {totalDifference.toFixed(2)}€
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[10px] text-gray-400">Sistema (esperado)</p>
              <p className="text-[12px] font-bold text-[#1A1A1A]">
                Físico: €{systemCashTotal.toFixed(2)} • Tarjeta: €{systemCardTotal.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('cash_search_placeholder')}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
              />
            </div>
          </div>
          {filteredHistory.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <BarChart3 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-xs font-bold text-[#1A1A1A]">{t('cash_no_records')}</p>
            </div>
          ) : (
            filteredHistory.map((record) => (
              <div key={record.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-xs font-bold text-[#1A1A1A]">{record.date.toLocaleString('es-ES')}</p>
                <p className="text-[10px] text-gray-400 mt-1">{record.employeeName}</p>
                <p className="text-[10px] text-gray-500 mt-2">
                  Real: {(record.realCashTotal + record.realCardTotal).toFixed(2)}€ • Sistema: {(record.systemCashTotal + record.systemCardTotal).toFixed(2)}€
                  {record.observations ? ` • ${record.observations}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
