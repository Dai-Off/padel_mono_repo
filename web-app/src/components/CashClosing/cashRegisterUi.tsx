import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  List,
  Lock,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import type {
  CashClosingBookingExpected,
  CashMovementRecord,
  CashMovementType,
  CashOpeningSavedRecord,
} from '../../services/payments';
import type { CashRecordKind } from '../../services/payments';

export type CashSection = 'listado' | 'apertura' | 'arqueo' | 'cierre';

export type CashBreakdown = {
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

export type CashLedgerRecord = {
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
  recordKind: CashRecordKind;
};

export const emptyBreakdown: CashBreakdown = {
  bills_500: 0, bills_200: 0, bills_100: 0, bills_50: 0, bills_20: 0, bills_10: 0, bills_5: 0,
  coins_2: 0, coins_1: 0, coins_050: 0, coins_020: 0, coins_010: 0, coins_005: 0, coins_002: 0, coins_001: 0,
};

export const denominations: { key: keyof CashBreakdown; label: string; value: number }[] = [
  { key: 'bills_500', label: '500€', value: 500 }, { key: 'bills_200', label: '200€', value: 200 }, { key: 'bills_100', label: '100€', value: 100 },
  { key: 'bills_50', label: '50€', value: 50 }, { key: 'bills_20', label: '20€', value: 20 }, { key: 'bills_10', label: '10€', value: 10 }, { key: 'bills_5', label: '5€', value: 5 },
  { key: 'coins_2', label: '2€', value: 2 }, { key: 'coins_1', label: '1€', value: 1 }, { key: 'coins_050', label: '0,50€', value: 0.5 },
  { key: 'coins_020', label: '0,20€', value: 0.2 }, { key: 'coins_010', label: '0,10€', value: 0.1 }, { key: 'coins_005', label: '0,05€', value: 0.05 },
  { key: 'coins_002', label: '0,02€', value: 0.02 }, { key: 'coins_001', label: '0,01€', value: 0.01 },
];

export function localDateYmd(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDateYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDateYmd(dt);
}

export function staffRoleAllowsCashLedger(role: string | null | undefined): boolean {
  const r = String(role ?? '').trim().toLowerCase();
  return !/entrenador|entrenadora|coach|trainer|profesor/.test(r);
}

export function SalesRows({
  bookings,
  storeCash,
  storeCard,
  emptyLabel,
}: {
  bookings: CashClosingBookingExpected[];
  storeCash: number;
  storeCard: number;
  emptyLabel: string;
}) {
  if (bookings.length === 0 && storeCash <= 0 && storeCard <= 0) {
    return <p className="text-xs text-gray-400 py-4 text-center">{emptyLabel}</p>;
  }
  return (
    <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
      {bookings.map((b) => {
        const time = b.start_at
          ? new Date(b.start_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
          : '—';
        const total = ((b.cash_paid_cents + b.card_paid_cents) / 100).toFixed(2);
        return (
          <div key={b.booking_id} className="flex items-start justify-between gap-3 py-3 px-1">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#1A1A1A] truncate">{b.court_name ?? 'Reserva'}</p>
              <p className="text-[10px] text-gray-400">{time}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-[#1A1A1A]">{total} €</p>
              <p className="text-[10px] text-gray-500">Efectivo: {(b.cash_paid_cents / 100).toFixed(2)} €</p>
              <p className="text-[10px] text-gray-500">Tarjeta: {(b.card_paid_cents / 100).toFixed(2)} €</p>
            </div>
          </div>
        );
      })}
      {(storeCash > 0 || storeCard > 0) && (
        <div className="flex items-start justify-between gap-3 py-3 px-1">
          <div>
            <p className="text-xs font-bold text-[#1A1A1A]">Tienda</p>
            <p className="text-[10px] text-gray-400">Ventas de inventario</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500">Efectivo: {storeCash.toFixed(2)} €</p>
            <p className="text-[10px] text-gray-500">Tarjeta: {storeCard.toFixed(2)} €</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecordList({ records, emptyLabel }: { records: CashLedgerRecord[]; emptyLabel: string }) {
  if (records.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <BarChart3 className="w-10 h-10 text-gray-200 mx-auto mb-2" />
        <p className="text-xs text-gray-400">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {records.map((record) => (
        <div key={record.id} className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-bold text-[#1A1A1A]">{record.date.toLocaleString('es-ES')}</p>
          <p className="text-[10px] text-gray-400 mt-1">{record.employeeName}</p>
          <p className="text-[10px] text-gray-500 mt-2">
            Real: {(record.realCashTotal + record.realCardTotal).toFixed(2)} € • Sistema:{' '}
            {(record.systemCashTotal + record.systemCardTotal).toFixed(2)} € • Dif:{' '}
            {record.totalDifference > 0 ? '+' : ''}
            {record.totalDifference.toFixed(2)} €
            {record.observations ? ` • ${record.observations}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

export function DayNavigator({
  operativeDate,
  isToday,
  onDateChange,
  t,
}: {
  operativeDate: string;
  isToday: boolean;
  onDateChange: (d: string) => void;
  t: TFunction;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onDateChange(shiftDateYmd(operativeDate, -1))}
        className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-[#1A1A1A] hover:bg-gray-50"
      >
        <ChevronLeft className="w-4 h-4" />
        {t('cash_prev_day')}
      </button>
      <input
        type="date"
        value={operativeDate}
        onChange={(e) => onDateChange(e.target.value)}
        className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-[#1A1A1A]"
      />
      <button
        type="button"
        onClick={() => onDateChange(shiftDateYmd(operativeDate, 1))}
        className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-[#1A1A1A] hover:bg-gray-50"
      >
        {t('cash_next_day')}
        <ChevronRight className="w-4 h-4" />
      </button>
      {!isToday && (
        <button
          type="button"
          onClick={() => onDateChange(localDateYmd())}
          className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-semibold text-[#1A1A1A]"
        >
          {t('cash_today')}
        </button>
      )}
    </div>
  );
}

export function SectionTabs({
  section,
  openingPending,
  showOpeningTab,
  onSectionChange,
  t,
}: {
  section: CashSection;
  openingPending: boolean;
  showOpeningTab: boolean;
  onSectionChange: (s: CashSection) => void;
  t: TFunction;
}) {
  const tabs: { id: CashSection; label: string; icon: typeof List }[] = [
    { id: 'listado', label: t('cash_section_list'), icon: List },
    ...(showOpeningTab
      ? [{ id: 'apertura' as const, label: t('cash_section_opening'), icon: DoorOpen }]
      : []),
    { id: 'arqueo', label: t('cash_section_count'), icon: Calculator },
    { id: 'cierre', label: t('cash_section_close'), icon: Lock },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 p-1 bg-gray-100 rounded-2xl">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSectionChange(id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${section === id ? 'bg-[#1A1A1A] text-white' : 'text-gray-500'}`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
          {id === 'apertura' && openingPending && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[9px]">
              {t('cash_opening_required_badge')}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function CashOperatorDelegate({
  delegateMode,
  setDelegateMode,
  delegatedStaffId,
  setDelegatedStaffId,
  staffOptions,
  selfName,
  t,
}: {
  delegateMode: boolean;
  setDelegateMode: (v: boolean) => void;
  delegatedStaffId: string;
  setDelegatedStaffId: (v: string) => void;
  staffOptions: { id: string; name: string }[];
  selfName: string | null;
  t: TFunction;
}) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={delegateMode}
          onChange={(e) => {
            setDelegateMode(e.target.checked);
            if (!e.target.checked) setDelegatedStaffId('');
          }}
          className="mt-0.5 rounded border-gray-300"
        />
        <span className="text-[11px] text-gray-700 leading-snug">{t('cash_delegate_to_staff')}</span>
      </label>
      {delegateMode ? (
        <select
          value={delegatedStaffId}
          onChange={(e) => setDelegatedStaffId(e.target.value)}
          className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-2xl text-xs"
        >
          <option value="">{t('cash_delegate_select')}</option>
          {staffOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : selfName ? (
        <p className="text-[11px] text-gray-600">
          {t('cash_operator_label')}: <span className="font-bold text-[#1A1A1A]">{selfName}</span>
        </p>
      ) : null}
    </div>
  );
}

type CountFormProps = {
  t: TFunction;
  cashBreakdown: CashBreakdown;
  setCashBreakdown: React.Dispatch<React.SetStateAction<CashBreakdown>>;
  employeeId: string;
  setEmployeeId: (v: string) => void;
  cardTotal: string;
  setCardTotal: (v: string) => void;
  observations: string;
  setObservations: (v: string) => void;
  staffOptions: { id: string; name: string }[];
  noStaffWarning: boolean;
  realCashTotal: number;
  realCardTotal: number;
  totalDifference: number;
  systemCashTotal: number;
  systemCardTotal: number;
  storeSalesCashTotal: number;
  storeSalesCardTotal: number;
  expectedBookings: CashClosingBookingExpected[];
  operativeDate: string;
  showSalesDetail: boolean;
  saveLabel: string;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  operatorName?: string | null;
  operatorReady?: boolean;
  canDelegate?: boolean;
};

export function CashCountForm({
  t,
  cashBreakdown,
  setCashBreakdown,
  employeeId,
  setEmployeeId,
  cardTotal,
  setCardTotal,
  observations,
  setObservations,
  staffOptions,
  noStaffWarning,
  realCashTotal,
  realCardTotal,
  totalDifference,
  systemCashTotal,
  systemCardTotal,
  storeSalesCashTotal,
  storeSalesCardTotal,
  expectedBookings,
  operativeDate,
  showSalesDetail,
  saveLabel,
  saving,
  canSave,
  onSave,
  operatorName,
  operatorReady = true,
  canDelegate = false,
}: CountFormProps) {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
        {operatorName && !canDelegate && (
          <p className="text-[10px] text-gray-500 mb-3">
            {t('cash_operator_label')}: <span className="font-bold text-[#1A1A1A]">{operatorName}</span>
          </p>
        )}
        <h3 className="text-xs font-bold text-[#1A1A1A] mb-4">{t('cash_counting')}</h3>
        <div className="grid md:grid-cols-2 gap-2">
          {denominations.map((d) => (
            <div key={d.key} className="flex items-center gap-2 p-2 rounded-xl border border-gray-100">
              <div className="w-20 text-xs font-bold text-[#1A1A1A]">{d.label}</div>
              <input
                type="number"
                min={0}
                value={cashBreakdown[d.key] || ''}
                onChange={(e) =>
                  setCashBreakdown((prev) => ({
                    ...prev,
                    [d.key]: Math.max(0, parseInt(e.target.value || '0', 10) || 0),
                  }))
                }
                className="w-20 px-2 py-1.5 rounded-xl border border-gray-200 text-xs"
                placeholder="0"
              />
              <span className="text-[10px] text-gray-400 ml-auto">{(cashBreakdown[d.key] * d.value).toFixed(2)}€</span>
            </div>
          ))}
        </div>
        {noStaffWarning && (
          <p className="mt-3 text-[11px] text-amber-800 font-medium">{t('cash_no_staff_authorized_for_caja')}</p>
        )}
        <div className="mt-4">
          <input
            type="number"
            min={0}
            step="0.01"
            value={cardTotal}
            onChange={(e) => setCardTotal(e.target.value)}
            placeholder={t('cards')}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
          />
        </div>
        <textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder={t('cash_observations')}
          className="w-full mt-3 px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs resize-none"
          rows={3}
        />
        {showSalesDetail && (
          <div className="mt-4 bg-gray-50 border border-gray-100 rounded-2xl p-4">
            <h4 className="text-[10px] font-bold text-gray-500 mb-2">
              {t('cash_sales_detail')} ({operativeDate})
            </h4>
            <SalesRows
              bookings={expectedBookings}
              storeCash={storeSalesCashTotal}
              storeCard={storeSalesCardTotal}
              emptyLabel={t('cash_sales_empty')}
            />
          </div>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || saving || !operatorReady}
          className="mt-4 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1A1A1A] text-white disabled:opacity-40"
        >
          {saving ? t('loading') : saveLabel}
        </button>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-[10px] text-gray-400">{t('cash_counted')}</p>
            <p className="text-lg font-black">{realCashTotal.toFixed(2)}€</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-[10px] text-gray-400">{t('cards')}</p>
            <p className="text-lg font-black">{realCardTotal.toFixed(2)}€</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] text-gray-400">{t('cash_difference')}</p>
          <p
            className={`text-lg font-black flex items-center gap-1 ${
              Math.abs(totalDifference) < 0.01
                ? 'text-green-600'
                : totalDifference > 0
                  ? 'text-blue-600'
                  : 'text-red-600'
            }`}
          >
            {Math.abs(totalDifference) < 0.01 ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : totalDifference > 0 ? (
              <TrendingUp className="w-5 h-5" />
            ) : (
              <TrendingDown className="w-5 h-5" />
            )}
            {totalDifference > 0 ? '+' : ''}
            {totalDifference.toFixed(2)}€
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] text-gray-400">Sistema (esperado)</p>
          <p className="text-[12px] font-bold">
            Físico: €{systemCashTotal.toFixed(2)} • Tarjeta: €{systemCardTotal.toFixed(2)}
          </p>
          {(storeSalesCashTotal > 0 || storeSalesCardTotal > 0) && (
            <p className="text-[10px] text-gray-500 mt-1">
              Tienda: €{storeSalesCashTotal.toFixed(2)} • €{storeSalesCardTotal.toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function CashMovementsPanel({
  sessionActive,
  movements,
  operatorName,
  operatorReady,
  canDelegate = false,
  movementAmount,
  setMovementAmount,
  movementNotes,
  setMovementNotes,
  activeMovementType,
  setActiveMovementType,
  savingMovement,
  onSubmitMovement,
  t,
}: {
  sessionActive: boolean;
  movements: CashMovementRecord[];
  operatorName: string | null;
  operatorReady: boolean;
  canDelegate?: boolean;
  movementAmount: string;
  setMovementAmount: (v: string) => void;
  movementNotes: string;
  setMovementNotes: (v: string) => void;
  activeMovementType: CashMovementType | null;
  setActiveMovementType: (v: CashMovementType | null) => void;
  savingMovement: boolean;
  onSubmitMovement: () => void;
  t: TFunction;
}) {
  if (!sessionActive) {
    return (
      <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
        {t('cash_movements_requires_opening')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-bold text-[#1A1A1A]">{t('cash_movements_title')}</h4>
        <p className="text-[10px] text-gray-500 mt-1">{t('cash_movements_sub')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveMovementType(activeMovementType === 'withdrawal' ? null : 'withdrawal')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border ${
            activeMovementType === 'withdrawal'
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-white text-red-700 border-red-200 hover:bg-red-50'
          }`}
        >
          <ArrowDownCircle className="w-4 h-4" />
          {t('cash_withdrawal_btn')}
        </button>
        <button
          type="button"
          onClick={() => setActiveMovementType(activeMovementType === 'deposit' ? null : 'deposit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border ${
            activeMovementType === 'deposit'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
          }`}
        >
          <ArrowUpCircle className="w-4 h-4" />
          {t('cash_deposit_btn')}
        </button>
      </div>

      {activeMovementType && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 max-w-md">
          <p className="text-xs font-bold text-[#1A1A1A]">
            {activeMovementType === 'withdrawal' ? t('cash_withdrawal_btn') : t('cash_deposit_btn')}
          </p>
          {operatorName && !canDelegate && (
            <p className="text-[10px] text-gray-500">
              {t('cash_operator_label')}: <span className="font-semibold text-[#1A1A1A]">{operatorName}</span>
            </p>
          )}
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={movementAmount}
            onChange={(e) => setMovementAmount(e.target.value)}
            placeholder={t('cash_movement_amount_placeholder')}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
          />
          <textarea
            value={movementNotes}
            onChange={(e) => setMovementNotes(e.target.value)}
            placeholder={t('cash_observations')}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveMovementType(null)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border border-gray-200 text-gray-600"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={onSubmitMovement}
              disabled={!operatorReady || !movementAmount || savingMovement}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1A1A1A] text-white disabled:opacity-40"
            >
              {savingMovement ? t('loading') : t('cash_movement_save')}
            </button>
          </div>
        </div>
      )}

      {movements.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {movements.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-3 p-4">
              <div>
                <p className="text-xs font-bold text-[#1A1A1A]">
                  {m.movement_type === 'withdrawal' ? t('cash_withdrawal_btn') : t('cash_deposit_btn')}
                </p>
                <p className="text-[10px] text-gray-400">
                  {new Date(m.created_at).toLocaleString('es-ES')} · {m.employee_name}
                </p>
                {m.notes ? <p className="text-[10px] text-gray-500 mt-1">{m.notes}</p> : null}
              </div>
              <p
                className={`text-sm font-black shrink-0 ${
                  m.movement_type === 'withdrawal' ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                {m.movement_type === 'withdrawal' ? '−' : '+'}
                {(m.amount_cents / 100).toFixed(2)} €
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type CashTimelineEntry = {
  id: string;
  at: Date;
  kind: 'opening' | 'cierre' | 'arqueo' | 'withdrawal' | 'deposit' | 'sale';
  title: string;
  subtitle?: string;
  employeeName?: string;
  amountEur?: number;
  tone: 'green' | 'blue' | 'red' | 'emerald' | 'neutral';
  details?: string[];
};

const toneRowClass: Record<CashTimelineEntry['tone'], string> = {
  green: 'bg-emerald-50 border-emerald-100 text-emerald-950',
  blue: 'bg-sky-50 border-sky-100 text-sky-950',
  red: 'bg-red-50 border-red-100 text-red-950',
  emerald: 'bg-teal-50 border-teal-100 text-teal-950',
  neutral: 'bg-white border-gray-100 text-[#1A1A1A]',
};

export function CashDayTimeline({ entries, emptyLabel }: { entries: CashTimelineEntry[]; emptyLabel: string }) {
  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 py-6 text-center">{emptyLabel}</p>;
  }
  const sorted = [...entries].sort((a, b) => a.at.getTime() - b.at.getTime());
  return (
    <div className="space-y-2">
      {sorted.map((e) => (
        <div key={e.id} className={`rounded-2xl border px-4 py-3 ${toneRowClass[e.tone]}`}>
          <p className="text-xs font-bold">
            {e.at.toLocaleString('es-ES')} — {e.employeeName ?? '—'} — {e.title}
          </p>
          {e.subtitle ? <p className="text-[10px] mt-1 opacity-80">{e.subtitle}</p> : null}
          {e.amountEur != null && (
            <p className="text-sm font-black mt-1">
              {e.kind === 'withdrawal' ? '−' : e.kind === 'deposit' ? '+' : ''}
              {e.amountEur.toFixed(2)} €
            </p>
          )}
          {e.details && e.details.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[10px] opacity-90">
              {e.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

