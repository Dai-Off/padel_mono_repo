import { useEffect, useMemo, useState } from 'react';
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
  type CashRecordKind,
  type CashMovementRecord,
  type CashMovementType,
} from '../../services/payments';
import type { ClubStaffMember } from '../../types/clubStaff';
import {
  CashCountForm,
  CashDayTimeline,
  CashMovementsPanel,
  CashOperatorDelegate,
  DayNavigator,
  RecordList,
  SectionTabs,
  emptyBreakdown,
  denominations,
  localDateYmd,
  staffRoleAllowsCashLedger,
  type CashBreakdown,
  type CashLedgerRecord,
  type CashSection,
  type CashTimelineEntry,
} from './cashRegisterUi';

function mapSavedToLocal(r: CashClosingSavedRecord): CashLedgerRecord {
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
    recordKind: r.record_kind === 'arqueo' ? 'arqueo' : 'cierre',
  };
}

export function ClubCashClosingTab({
  clubId,
  clubResolved = true,
}: {
  clubId: string | null;
  clubResolved?: boolean;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<CashSection>('listado');
  const [staff, setStaff] = useState<ClubStaffMember[]>([]);
  const [observations, setObservations] = useState('');
  const [cardTotal, setCardTotal] = useState('');
  const [cashBreakdown, setCashBreakdown] = useState<CashBreakdown>(emptyBreakdown);
  const [historyRecords, setHistoryRecords] = useState<CashLedgerRecord[]>([]);
  const [expectedBookings, setExpectedBookings] = useState<CashClosingBookingExpected[]>([]);
  const [systemCashTotal, setSystemCashTotal] = useState(0);
  const [systemCardTotal, setSystemCardTotal] = useState(0);
  const [storeSalesCashTotal, setStoreSalesCashTotal] = useState(0);
  const [storeSalesCardTotal, setStoreSalesCardTotal] = useState(0);
  const [loadingExpected, setLoadingExpected] = useState(true);
  const [saving, setSaving] = useState(false);
  const [operativeDate, setOperativeDate] = useState(localDateYmd());
  const [openingRecord, setOpeningRecord] = useState<CashOpeningSavedRecord | null>(null);
  const [needsNewOpeningAfterClosing, setNeedsNewOpeningAfterClosing] = useState(false);
  const [openingsForDay, setOpeningsForDay] = useState<CashOpeningSavedRecord[]>([]);
  const [openingCashTotal, setOpeningCashTotal] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');
  const [savingOpening, setSavingOpening] = useState(false);
  const [cashMovements, setCashMovements] = useState<CashMovementRecord[]>([]);
  const [operatorStaffId, setOperatorStaffId] = useState('');
  const [operatorName, setOperatorName] = useState<string | null>(null);
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [canDelegate, setCanDelegate] = useState(false);
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(null);
  const [delegateMode, setDelegateMode] = useState(false);
  const [delegatedStaffId, setDelegatedStaffId] = useState('');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNotes, setMovementNotes] = useState('');
  const [activeMovementType, setActiveMovementType] = useState<CashMovementType | null>(null);
  const [savingMovement, setSavingMovement] = useState(false);

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
  const staffOptions = useMemo(
    () => staffForCashOperations.map((m) => ({ id: m.id, name: m.name })),
    [staffForCashOperations],
  );

  const effectiveStaffId = delegateMode ? delegatedStaffId : operatorStaffId;
  const effectiveOperatorName = useMemo(() => {
    if (delegateMode && delegatedStaffId) {
      return staffOptions.find((s) => s.id === delegatedStaffId)?.name ?? null;
    }
    return operatorName ?? ownerDisplayName;
  }, [delegateMode, delegatedStaffId, operatorName, ownerDisplayName, staffOptions]);

  const realCashTotal = useMemo(
    () => denominations.reduce((acc, d) => acc + cashBreakdown[d.key] * d.value, 0),
    [cashBreakdown],
  );
  const realCardTotal = Number(cardTotal) || 0;
  const totalDifference = realCashTotal + realCardTotal - (systemCashTotal + systemCardTotal);
  const operatorReady = canDelegate ? (delegateMode ? Boolean(delegatedStaffId) : true) : Boolean(operatorStaffId);
  const canSave = operatorReady;

  const staffIdForSave = effectiveStaffId || undefined;

  const delegatePanelProps = {
    delegateMode,
    setDelegateMode,
    delegatedStaffId,
    setDelegatedStaffId,
    staffOptions,
    selfName: ownerDisplayName ?? operatorName,
    t,
  };

  const openingAppliesToSelectedDay = useMemo(() => {
    if (!openingRecord) return false;
    const raw = openingRecord.for_date;
    if (raw == null || String(raw).trim() === '') return true;
    return String(raw).slice(0, 10) === operativeDate;
  }, [openingRecord, operativeDate]);

  const arqueoRecords = useMemo(() => historyRecords.filter((r) => r.recordKind === 'arqueo'), [historyRecords]);
  const cierreRecords = useMemo(() => historyRecords.filter((r) => r.recordKind === 'cierre'), [historyRecords]);
  const isToday = operativeDate === localDateYmd();
  const openingPending = !openingAppliesToSelectedDay || needsNewOpeningAfterClosing;
  const sessionActive = openingAppliesToSelectedDay && !needsNewOpeningAfterClosing;
  const showOpeningTab = openingPending && !sessionActive;

  const applyExpected = (expected: Awaited<ReturnType<typeof paymentsService.getCashClosingExpected>>) => {
    setExpectedBookings(expected.bookings ?? []);
    setSystemCashTotal(expected.systemCashTotal_eur ?? 0);
    setSystemCardTotal(expected.systemCardTotal_eur ?? 0);
    setStoreSalesCashTotal(expected.storeSalesCash_eur ?? 0);
    setStoreSalesCardTotal(expected.storeSalesCard_eur ?? 0);
    setNeedsNewOpeningAfterClosing(expected.needs_new_opening_after_closing === true);
    setCashMovements((expected.cash_movements ?? []) as CashMovementRecord[]);
    setOpeningsForDay((expected.openings ?? []) as CashOpeningSavedRecord[]);
  };

  useEffect(() => {
    if (!showOpeningTab && section === 'apertura') setSection('listado');
  }, [showOpeningTab, section]);

  useEffect(() => {
    if (!needsNewOpeningAfterClosing) return;
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
        const [staffRows, expected, opening, operator] = await Promise.all([
          clubStaffService.list(clubId),
          paymentsService.getCashClosingExpected(clubId, operativeDate, operativeTimezone),
          paymentsService.getCashOpeningForDay(clubId, operativeDate),
          paymentsService.getCashCurrentOperator(clubId).catch((e) => {
            const msg = (e as Error).message;
            return { ok: false as const, error: msg };
          }),
        ]);
        if (cancelled) return;

        setStaff(staffRows ?? []);
        applyExpected(expected);
        setOpeningRecord(opening.opening ?? null);
        if ('staff_id' in operator && !('error' in operator)) {
          setCanDelegate(operator.can_delegate === true);
          setOwnerDisplayName(operator.owner_display_name ?? null);
          setOperatorStaffId(operator.staff_id ?? '');
          setOperatorName(operator.employee_name);
          setOperatorError(null);
          setDelegateMode(false);
          setDelegatedStaffId('');
        } else {
          setCanDelegate(false);
          setOwnerDisplayName(null);
          setOperatorStaffId('');
          setOperatorName(null);
          setOperatorError(
            'error' in operator && typeof operator.error === 'string'
              ? operator.error
              : t('cash_operator_not_linked'),
          );
          setDelegateMode(false);
          setDelegatedStaffId('');
        }

        try {
          const recs = await paymentsService.listCashClosingRecords(clubId, 50, operativeDate);
          if (!cancelled) setHistoryRecords(recs.map(mapSavedToLocal));
        } catch (histErr) {
          if (!cancelled) setHistoryRecords([]);
          if (!cancelled && histErr instanceof HttpError && histErr.status === 503) {
            toast.error(
              'Falta la tabla de arqueos en la base de datos. Aplica la migración 012_club_cash_closings.sql en Supabase.',
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
        setStoreSalesCashTotal(0);
        setStoreSalesCardTotal(0);
        setCashMovements([]);
        toast.error((e as Error).message || t('payments_load_error'));
      } finally {
        if (!cancelled) setLoadingExpected(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clubId, clubResolved, operativeDate, operativeTimezone, t]);

  const resetCountForm = () => {
    setCashBreakdown(emptyBreakdown);
    setCardTotal('');
    setObservations('');
  };

  const saveClosing = async (recordKind: CashRecordKind) => {
    if (!canSave || !clubId) return;
    if (recordKind === 'cierre' && needsNewOpeningAfterClosing) {
      toast.error(t('cash_closing_wait_reopen'));
      setSection('apertura');
      return;
    }
    setSaving(true);
    try {
      const saved = await paymentsService.createCashClosingRecord({
        club_id: clubId,
        staff_id: staffIdForSave,
        for_date: operativeDate,
        real_cash_cents: Math.round(realCashTotal * 100),
        real_card_cents: Math.round(realCardTotal * 100),
        system_cash_cents: Math.round(systemCashTotal * 100),
        system_card_cents: Math.round(systemCardTotal * 100),
        observations: observations.trim() || undefined,
        record_kind: recordKind,
      });
      const refreshedExpected = await paymentsService.getCashClosingExpected(
        clubId,
        saved.for_date,
        operativeTimezone,
      );
      setHistoryRecords((prev) => [mapSavedToLocal(saved), ...prev]);
      applyExpected(refreshedExpected);
      resetCountForm();
      toast.success(recordKind === 'arqueo' ? t('cash_arqueo_success') : t('cash_cierre_success'));
      setSection('listado');
    } catch (e) {
      if (e instanceof HttpError && e.status === 503) {
        toast.error(
          'Falta la tabla de arqueos en la base de datos. Aplica la migración 012_club_cash_closings.sql en Supabase.',
        );
      } else {
        toast.error((e as Error).message || t('payments_load_error'));
      }
    } finally {
      setSaving(false);
    }
  };

  const saveOpening = async () => {
    if (!clubId || !operatorReady) return;
    const openingCashCents = Math.round((Number(openingCashTotal) || 0) * 100);
    if (openingCashCents < 0) return;
    setSavingOpening(true);
    try {
      const saved = await paymentsService.createCashOpeningRecord({
        club_id: clubId,
        staff_id: staffIdForSave,
        for_date: operativeDate,
        opening_cash_cents: openingCashCents,
        notes: openingNotes.trim() || undefined,
      });
      setOpeningRecord(saved);
      const expected = await paymentsService.getCashClosingExpected(clubId, saved.for_date, operativeTimezone);
      applyExpected(expected);
      setOpeningCashTotal('');
      setOpeningNotes('');
      toast.success(t('cash_opening_success'));
      setSection('listado');
    } catch (e) {
      toast.error((e as Error).message || t('payments_load_error'));
    } finally {
      setSavingOpening(false);
    }
  };

  const saveMovement = async () => {
    if (!clubId || !activeMovementType || !operatorReady) return;
    const amountCents = Math.round((Number(movementAmount) || 0) * 100);
    if (amountCents <= 0) return;
    setSavingMovement(true);
    try {
      await paymentsService.createCashMovementRecord({
        club_id: clubId,
        staff_id: staffIdForSave,
        movement_type: activeMovementType,
        for_date: operativeDate,
        amount_cents: amountCents,
        notes: movementNotes.trim() || undefined,
      });
      const expected = await paymentsService.getCashClosingExpected(clubId, operativeDate, operativeTimezone);
      applyExpected(expected);
      setMovementAmount('');
      setMovementNotes('');
      setActiveMovementType(null);
      toast.success(
        activeMovementType === 'withdrawal' ? t('cash_withdrawal_success') : t('cash_deposit_success'),
      );
    } catch (e) {
      toast.error((e as Error).message || t('payments_load_error'));
    } finally {
      setSavingMovement(false);
    }
  };

  const timelineEntries = useMemo((): CashTimelineEntry[] => {
    const items: CashTimelineEntry[] = [];
    for (const o of openingsForDay) {
      items.push({
        id: `open-${o.id}`,
        at: new Date(o.opened_at),
        kind: 'opening',
        title: t('cash_section_opening'),
        employeeName: o.employee_name,
        amountEur: o.opening_cash_cents / 100,
        tone: 'green',
        subtitle: o.notes ?? undefined,
      });
    }
    for (const r of historyRecords) {
      const isCierre = r.recordKind === 'cierre';
      items.push({
        id: r.id,
        at: r.date,
        kind: isCierre ? 'cierre' : 'arqueo',
        title: isCierre ? t('cash_section_close') : t('cash_section_count'),
        employeeName: r.employeeName,
        tone: isCierre ? 'neutral' : 'blue',
        details: [
          `Real: ${(r.realCashTotal + r.realCardTotal).toFixed(2)} €`,
          `Sistema: ${(r.systemCashTotal + r.systemCardTotal).toFixed(2)} €`,
          `Diferencia: ${r.totalDifference > 0 ? '+' : ''}${r.totalDifference.toFixed(2)} €`,
        ],
      });
    }
    for (const m of cashMovements) {
      items.push({
        id: m.id,
        at: new Date(m.created_at),
        kind: m.movement_type,
        title: m.movement_type === 'withdrawal' ? t('cash_withdrawal_btn') : t('cash_deposit_btn'),
        employeeName: m.employee_name,
        amountEur: m.amount_cents / 100,
        tone: m.movement_type === 'withdrawal' ? 'red' : 'emerald',
        subtitle: m.notes ?? undefined,
      });
    }
    for (const b of expectedBookings) {
      if (!b.start_at) continue;
      const total = (b.cash_paid_cents + b.card_paid_cents) / 100;
      if (total <= 0) continue;
      items.push({
        id: `sale-${b.booking_id}`,
        at: new Date(b.start_at),
        kind: 'sale',
        title: b.court_name ?? 'Reserva',
        tone: 'neutral',
        amountEur: total,
        subtitle: `Efectivo ${(b.cash_paid_cents / 100).toFixed(2)} € · Tarjeta ${(b.card_paid_cents / 100).toFixed(2)} €`,
      });
    }
    return items;
  }, [openingsForDay, historyRecords, cashMovements, expectedBookings, t]);

  const movementPanelProps = {
    sessionActive,
    movements: cashMovements,
    operatorName: effectiveOperatorName,
    operatorReady,
    canDelegate,
    movementAmount,
    setMovementAmount,
    movementNotes,
    setMovementNotes,
    activeMovementType,
    setActiveMovementType,
    savingMovement,
    onSubmitMovement: () => void saveMovement(),
    t,
  };

  const countFormProps = {
    t,
    cashBreakdown,
    setCashBreakdown,
    cardTotal,
    setCardTotal,
    observations,
    setObservations,
    noStaffWarning: staff.length > 0 && staffForCashOperations.length === 0,
    realCashTotal,
    realCardTotal,
    totalDifference,
    systemCashTotal,
    systemCardTotal,
    storeSalesCashTotal,
    storeSalesCardTotal,
    expectedBookings,
    operativeDate,
    saving,
    canSave,
    operatorName: effectiveOperatorName,
    operatorReady,
    canDelegate,
    delegatePanelProps,
  };

  if (!clubResolved) return <PageSpinner />;
  if (!clubId) return <p className="text-sm text-gray-500 text-center py-12">No se pudo determinar el club.</p>;
  if (loadingExpected) return <PageSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-black text-[#1A1A1A] uppercase tracking-wide">{t('cash_register_title')}</h2>
          {openingRecord && openingAppliesToSelectedDay && (
            <p className="text-[10px] text-gray-500 mt-1">
              {t('cash_opening_banner', {
                amount: (openingRecord.opening_cash_cents / 100).toFixed(2),
                name: openingRecord.employee_name,
              })}
            </p>
          )}
        </div>
        <DayNavigator operativeDate={operativeDate} isToday={isToday} onDateChange={setOperativeDate} t={t} />
        <SectionTabs
          section={section}
          openingPending={openingPending}
          showOpeningTab={showOpeningTab}
          onSectionChange={setSection}
          t={t}
        />
      </div>

      {operatorError && !canDelegate && (
        <p className="text-[11px] text-amber-800 font-medium bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          {operatorError}
        </p>
      )}

      {canDelegate && <CashOperatorDelegate {...delegatePanelProps} />}

      {section === 'listado' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold">{t('cash_day_summary')}</p>
              <p className="text-[10px] text-gray-500 mt-1">{operativeDate}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-[10px] text-gray-400">Sistema efectivo</p>
              <p className="text-lg font-black">{systemCashTotal.toFixed(2)} €</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-[10px] text-gray-400">Sistema tarjeta</p>
              <p className="text-lg font-black">{systemCardTotal.toFixed(2)} €</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-[10px] text-gray-400">{t('cash_arqueos_today')}</p>
              <p className="text-lg font-black">{arqueoRecords.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-xs font-bold text-[#1A1A1A] mb-3">{t('cash_day_timeline')}</h3>
            <CashDayTimeline entries={timelineEntries} emptyLabel={t('cash_sales_empty')} />
          </div>

          {sessionActive && <CashMovementsPanel {...movementPanelProps} />}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-bold text-[#1A1A1A] mb-2">{t('cash_arqueos_today')}</h3>
              <RecordList records={arqueoRecords} emptyLabel={t('cash_no_records')} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#1A1A1A] mb-2">{t('cash_cierres_today')}</h3>
              <RecordList records={cierreRecords} emptyLabel={t('cash_no_records')} />
            </div>
          </div>
        </div>
      )}

      {section === 'apertura' && showOpeningTab && (
        <div className="space-y-4 max-w-xl">
          <div>
            <h3 className="text-sm font-bold text-[#1A1A1A]">{t('cash_section_opening')}</h3>
            <p className="text-[11px] text-gray-500 mt-1">{t('cash_opening_daily_sub')}</p>
            {needsNewOpeningAfterClosing && (
              <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">{t('cash_after_close_hint')}</p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              {!canDelegate && effectiveOperatorName && (
                <p className="text-[11px] text-gray-600 mb-1">
                  {t('cash_operator_label')}: <span className="font-bold">{effectiveOperatorName}</span>
                </p>
              )}
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
                disabled={!operatorReady || savingOpening}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1A1A1A] text-white disabled:opacity-40"
              >
                {savingOpening ? t('loading') : t('cash_opening_save')}
              </button>
          </div>
        </div>
      )}

      {section === 'arqueo' && (
        <div className="space-y-3">
          <p className="text-[11px] text-gray-500">{t('cash_arqueo_sub')}</p>
          <CashCountForm
            {...countFormProps}
            showSalesDetail={false}
            saveLabel={t('cash_save_arqueo')}
            onSave={() => void saveClosing('arqueo')}
          />
          <div>
            <h3 className="text-xs font-bold text-[#1A1A1A] mb-2">{t('cash_arqueos_today')}</h3>
            <RecordList records={arqueoRecords} emptyLabel={t('cash_no_records')} />
          </div>
        </div>
      )}

      {section === 'cierre' && (
        <div className="space-y-4">
          {needsNewOpeningAfterClosing && (
            <p className="text-[11px] text-amber-800 font-medium bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
              {t('cash_closing_wait_reopen')}
            </p>
          )}
          <CashCountForm
            {...countFormProps}
            showSalesDetail
            saveLabel={t('cash_save_cierre')}
            onSave={() => void saveClosing('cierre')}
          />
          <div>
            <h3 className="text-xs font-bold text-[#1A1A1A] mb-2">{t('cash_cierres_today')}</h3>
            <RecordList records={cierreRecords} emptyLabel={t('cash_no_records')} />
          </div>
        </div>
      )}
    </div>
  );
}
