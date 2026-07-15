import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  CreditCard,
  DollarSign,
  Download,
  Filter,
  Search,
  Smartphone,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Banknote,
  Wallet,
  HelpCircle,
  X,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { paymentsService, type PaymentTransaction, type PaymentParticipant } from '../../services/payments';
import { inventoryService } from '../../services/inventory';
import { EditCartSaleModal } from '../CashClosing/EditCartSaleModal';
import { useTranslation } from 'react-i18next';
import { PageSpinner } from '../Layout/PageSpinner';
import { localDateYmd, shiftDateYmd } from '../CashClosing/cashRegisterUi';

type PaymentMethod = 'cash' | 'card' | 'wallet' | 'app';
type PaymentStatus = 'completed' | 'pending' | 'failed' | 'refunded' | 'cancelled_admin';
type DateFilterMode = 'day' | 'range' | 'all';
type PaymentSource = 'booking' | 'store';

type Payment = {
  id: string;
  dateIso: string;
  dateLabel: string;
  time: string;
  client: string;
  concept: string;
  method: PaymentMethod;
  source: 'booking' | 'store';
  amount: number;
  status: PaymentStatus;
  courtName?: string;
  bookingId?: string | null;
  payerPlayerId?: string | null;
  saleId?: string | null;
  participants: PaymentParticipant[];
};

function resolveSaleId(tx: PaymentTransaction): string | null {
  if (tx.sale_id) return tx.sale_id;
  if (tx.id.startsWith('store-meta-')) return tx.id.slice('store-meta-'.length);
  return null;
}

function paymentMethodLabel(method: PaymentMethod): string {
  if (method === 'cash') return 'Efectivo';
  if (method === 'card') return 'Tarjeta';
  if (method === 'wallet') return 'Monedero';
  return 'App';
}

function PaymentMethodIcon({ method }: { method: PaymentMethod }) {
  if (method === 'cash') return <Banknote className="w-4 h-4 text-green-600" />;
  if (method === 'card') return <CreditCard className="w-4 h-4 text-[#E31E24]" />;
  if (method === 'wallet') return <Wallet className="w-4 h-4 text-blue-600" />;
  return <Smartphone className="w-4 h-4 text-blue-600" />;
}

function paymentMethodBadgeClass(method: PaymentMethod): string {
  if (method === 'cash') return 'bg-green-50 text-green-700 border-green-100';
  if (method === 'card') return 'bg-red-50 text-[#E31E24] border-red-100';
  if (method === 'wallet') return 'bg-blue-50 text-blue-700 border-blue-100';
  return 'bg-indigo-50 text-indigo-700 border-indigo-100';
}

function participantName(p: PaymentParticipant): string {
  const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return full || p.email || 'Jugador';
}

function methodLabel(method: PaymentParticipant['payment_method']): string {
  if (method === 'cash') return 'Efectivo';
  if (method === 'card') return 'Tarjeta';
  if (method === 'wallet') return 'Monedero';
  return 'Sin pago';
}

function MethodIcon({ method }: { method: PaymentParticipant['payment_method'] }) {
  if (method === 'cash') return <Banknote className="w-3.5 h-3.5 text-green-600" />;
  if (method === 'card') return <CreditCard className="w-3.5 h-3.5 text-[#E31E24]" />;
  if (method === 'wallet') return <Wallet className="w-3.5 h-3.5 text-blue-600" />;
  return <HelpCircle className="w-3.5 h-3.5 text-gray-400" />;
}

function methodBadgeClass(method: PaymentParticipant['payment_method']): string {
  if (method === 'cash') return 'bg-green-50 text-green-700 border-green-100';
  if (method === 'card') return 'bg-red-50 text-[#E31E24] border-red-100';
  if (method === 'wallet') return 'bg-blue-50 text-blue-700 border-blue-100';
  return 'bg-gray-50 text-gray-500 border-gray-100';
}

function AnimSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay }}
    >
      {children}
    </motion.div>
  );
}

function PulseDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <motion.span
        className="absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ backgroundColor: color }}
        animate={{ scale: [1, 1.8, 1], opacity: [0.75, 0, 0.75] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
    </span>
  );
}

function mapStatus(
  status: string,
  bookingStatus?: string | null,
  cancelledBy?: string | null,
): PaymentStatus {
  if (bookingStatus === 'cancelled') {
    // Reserva anulada por el club (fiesta, personalizado, etc.): no etiquetar como Fallido.
    if (status === 'refunded') return 'refunded';
    if (status === 'succeeded') {
      // Cobro OK antes de cancelar; si hay marca de admin lo mostramos como cancelación.
      if (cancelledBy === 'owner' || cancelledBy === 'admin' || cancelledBy === 'staff') {
        return 'cancelled_admin';
      }
      return 'completed';
    }
    return 'cancelled_admin';
  }
  if (status === 'succeeded') return 'completed';
  if (status === 'requires_action') return 'pending';
  if (status === 'failed') return 'failed';
  if (status === 'refunded') return 'refunded';
  return 'pending';
}

function paymentLocalYmd(dateIso: string): string {
  const dt = new Date(dateIso);
  if (Number.isNaN(dt.getTime())) return '';
  return localDateYmd(dt);
}

function formatNavigatorDateLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function shiftDateRange(from: string, to: string, days: number): { from: string; to: string } {
  return { from: shiftDateYmd(from, days), to: shiftDateYmd(to, days) };
}

function paymentMatchesDateFilter(
  payment: Payment,
  mode: DateFilterMode,
  selectedDate: string,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (mode === 'all') return true;
  const payYmd = paymentLocalYmd(payment.dateIso);
  if (!payYmd) return false;
  if (mode === 'day') return payYmd === selectedDate;
  const from = dateFrom <= dateTo ? dateFrom : dateTo;
  const to = dateFrom <= dateTo ? dateTo : dateFrom;
  return payYmd >= from && payYmd <= to;
}

function toPayment(tx: PaymentTransaction): Payment {
  const dt = new Date(tx.created_at);
  const payerName = [tx.payer_first_name, tx.payer_last_name].filter(Boolean).join(' ').trim();
  const clientLabel = payerName || tx.payer_email || tx.club_name || 'Cliente';
  const method = tx.payment_method ?? 'app';
  const concept =
    tx.concept
    ?? (tx.source === 'store'
      ? 'Tienda'
      : tx.court_name
        ? `Turno · ${tx.court_name}`
        : tx.booking_id
          ? `Reserva ${tx.booking_id.slice(0, 8)}`
          : 'Pago');
  return {
    id: tx.id,
    dateIso: tx.created_at,
    dateLabel: Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    client: clientLabel,
    concept,
    method,
    source: tx.source ?? (tx.booking_id ? 'booking' : 'store'),
    amount: Math.round((tx.amount_cents ?? 0) / 100),
    status: mapStatus(tx.status, tx.booking_status, tx.cancelled_by),
    courtName: tx.court_name ?? undefined,
    bookingId: tx.booking_id ?? null,
    payerPlayerId: tx.payer_player_id ?? null,
    saleId: resolveSaleId(tx),
    participants: tx.participants ?? [],
  };
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const config: Record<PaymentStatus, { dot: string; label: string; bg: string }> = {
    completed: { dot: '#22C55E', label: 'OK', bg: 'bg-green-50 text-green-600 border-green-100' },
    pending: { dot: '#EAB308', label: 'Pendiente', bg: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
    failed: { dot: '#E31E24', label: 'Fallido', bg: 'bg-red-50 text-red-500 border-red-100' },
    refunded: { dot: '#9CA3AF', label: 'Reembolso', bg: 'bg-gray-50 text-gray-500 border-gray-100' },
    cancelled_admin: { dot: '#6B7280', label: 'Cancelado por admin', bg: 'bg-gray-50 text-gray-600 border-gray-200' },
  };
  const item = config[status];
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[9px] font-bold flex-shrink-0 ${item.bg}`}>
      <PulseDot color={item.dot} />
      {item.label}
    </span>
  );
}

export function ClubPaymentsTab({
  clubId,
  clubResolved = true,
}: {
  clubId: string | null;
  clubResolved?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const todayYmd = localDateYmd();
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [filterMethod, setFilterMethod] = useState<'all' | PaymentMethod>('all');
  const [filterSource, setFilterSource] = useState<'all' | PaymentSource>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | PaymentStatus>('all');
  const [dateMode, setDateMode] = useState<DateFilterMode>('day');
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [dateFrom, setDateFrom] = useState(todayYmd);
  const [dateTo, setDateTo] = useState(todayYmd);
  const [showFilters, setShowFilters] = useState(false);
  const [editSaleId, setEditSaleId] = useState<string | null>(null);
  const [voidConfirmPayment, setVoidConfirmPayment] = useState<Payment | null>(null);
  const [voidingSaleId, setVoidingSaleId] = useState<string | null>(null);

  const reloadPayments = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const rows = await paymentsService.listClubTransactions(clubId, 300);
      setAllPayments(rows.map(toPayment));
    } catch (e) {
      toast.error((e as Error).message || t('payments_load_error'));
      setAllPayments([]);
    } finally {
      setLoading(false);
    }
  }, [clubId, t]);

  useEffect(() => {
    if (!clubId) return;
    void reloadPayments();
  }, [clubId, reloadPayments]);

  const clientOptions = useMemo(() => {
    const names = new Set<string>();
    for (const p of allPayments) {
      if (p.client.trim()) names.add(p.client.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [allPayments]);

  const periodPayments = useMemo(
    () => allPayments.filter((p) => paymentMatchesDateFilter(p, dateMode, selectedDate, dateFrom, dateTo)),
    [allPayments, dateMode, selectedDate, dateFrom, dateTo],
  );

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return periodPayments.filter((payment) => {
      const matchSearch =
        !q
        || payment.client.toLowerCase().includes(q)
        || payment.concept.toLowerCase().includes(q)
        || payment.id.toLowerCase().includes(q)
        || (payment.courtName?.toLowerCase().includes(q) ?? false);
      const matchClient = !clientFilter || payment.client === clientFilter;
      const matchMethod = filterMethod === 'all' || payment.method === filterMethod;
      const matchSource = filterSource === 'all' || payment.source === filterSource;
      const matchStatus = filterStatus === 'all' || payment.status === filterStatus;
      return matchSearch && matchClient && matchMethod && matchSource && matchStatus;
    });
  }, [periodPayments, searchQuery, clientFilter, filterMethod, filterSource, filterStatus]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filterMethod !== 'all') n += 1;
    if (filterSource !== 'all') n += 1;
    if (filterStatus !== 'all') n += 1;
    if (clientFilter) n += 1;
    if (dateMode === 'range' && (dateFrom !== todayYmd || dateTo !== todayYmd)) n += 1;
    return n;
  }, [filterMethod, filterSource, filterStatus, clientFilter, dateMode, dateFrom, dateTo, todayYmd]);

  const completed = (p: Payment) => p.status === 'completed';
  const cashPeriodTotal = periodPayments.filter((p) => completed(p) && p.method === 'cash').reduce((sum, p) => sum + p.amount, 0);
  const cardPeriodTotal = periodPayments.filter((p) => completed(p) && p.method === 'card').reduce((sum, p) => sum + p.amount, 0);
  const appPeriodTotal = periodPayments.filter((p) => completed(p) && p.method === 'app').reduce((sum, p) => sum + p.amount, 0);
  const walletPeriodTotal = periodPayments.filter((p) => completed(p) && p.method === 'wallet').reduce((sum, p) => sum + p.amount, 0);
  const storePeriodTotal = periodPayments.filter((p) => completed(p) && p.source === 'store').reduce((sum, p) => sum + p.amount, 0);
  const distributionTotal = cashPeriodTotal + cardPeriodTotal + appPeriodTotal + walletPeriodTotal || 1;
  const cashPct = Math.round((cashPeriodTotal / distributionTotal) * 100);
  const cardPct = Math.round((cardPeriodTotal / distributionTotal) * 100);
  const appPct = Math.round((appPeriodTotal / distributionTotal) * 100);
  const walletPct = Math.max(0, 100 - cashPct - cardPct - appPct);

  const periodLabel = useMemo(() => {
    if (dateMode === 'all') return 'Todos los registros';
    if (dateMode === 'range') {
      const from = dateFrom <= dateTo ? dateFrom : dateTo;
      const to = dateFrom <= dateTo ? dateTo : dateFrom;
      if (from === to) return formatNavigatorDateLabel(from);
      return `${formatNavigatorDateLabel(from)} – ${formatNavigatorDateLabel(to)}`;
    }
    return formatNavigatorDateLabel(selectedDate);
  }, [dateMode, selectedDate, dateFrom, dateTo]);

  const isTodaySelected = dateMode === 'day' && selectedDate === todayYmd;

  const openBookingInGrilla = useCallback((bookingId: string) => {
    navigate(`/grilla?booking=${encodeURIComponent(bookingId)}`);
  }, [navigate]);

  const confirmVoidSale = useCallback(async () => {
    if (!clubId || !voidConfirmPayment?.saleId) return;
    const saleId = voidConfirmPayment.saleId;
    setVoidingSaleId(saleId);
    try {
      await inventoryService.voidSale(clubId, saleId);
      toast.success('Venta anulada');
      setVoidConfirmPayment(null);
      await reloadPayments();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo anular la venta');
    } finally {
      setVoidingSaleId(null);
    }
  }, [clubId, voidConfirmPayment, reloadPayments]);
  const isRangeSingleDay = dateMode === 'range' && dateFrom === dateTo;
  const navigatorDateLabel =
    dateMode === 'range' && !isRangeSingleDay
      ? `${formatNavigatorDateLabel(dateFrom <= dateTo ? dateFrom : dateTo)} – ${formatNavigatorDateLabel(dateFrom <= dateTo ? dateTo : dateFrom)}`
      : dateMode === 'day'
        ? formatNavigatorDateLabel(selectedDate)
        : dateMode === 'range'
          ? formatNavigatorDateLabel(dateFrom)
          : '—';

  const clearFilters = () => {
    setFilterMethod('all');
    setFilterSource('all');
    setFilterStatus('all');
    setClientFilter('');
    setSearchQuery('');
  };

  const handlePrevDay = () => {
    if (dateMode === 'day') {
      setSelectedDate((d) => shiftDateYmd(d, -1));
      return;
    }
    if (dateMode === 'range') {
      const next = shiftDateRange(dateFrom, dateTo, -1);
      setDateFrom(next.from);
      setDateTo(next.to);
    }
  };

  const handleNextDay = () => {
    if (dateMode === 'day') {
      setSelectedDate((d) => shiftDateYmd(d, 1));
      return;
    }
    if (dateMode === 'range') {
      const next = shiftDateRange(dateFrom, dateTo, 1);
      setDateFrom(next.from);
      setDateTo(next.to);
    }
  };

  const goToToday = () => {
    setDateMode('day');
    setSelectedDate(todayYmd);
    setDateFrom(todayYmd);
    setDateTo(todayYmd);
  };

  const exportCsv = () => {
    if (!filteredPayments.length) {
      toast.error(t('payments_no_data_export'));
      return;
    }
    const header = ['id', 'fecha', 'hora', 'cliente', 'concepto', 'metodo', 'importe', 'estado', 'pista'];
    const rows = filteredPayments.map((p) => [
      p.id,
      p.dateLabel,
      p.time,
      p.client,
      p.concept,
      p.method,
      String(p.amount),
      p.status,
      p.courtName ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!clubResolved) {
    return <PageSpinner />;
  }
  if (!clubId) {
    return <p className="text-sm text-gray-500 text-center py-12">No se pudo determinar el club.</p>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">{t('payments_title')}</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {filteredPayments.length} / {periodPayments.length}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <button
              type="button"
              onClick={handlePrevDay}
              disabled={dateMode === 'all'}
              className="px-2.5 py-2 text-gray-400 hover:bg-gray-50 border-r border-gray-200 disabled:opacity-30"
              aria-label="Día anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (dateMode === 'all') {
                  setDateMode('day');
                  setSelectedDate(todayYmd);
                }
                try {
                  dateInputRef.current?.showPicker();
                } catch {
                  dateInputRef.current?.focus();
                }
              }}
              className="px-3 py-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700 min-w-[120px] justify-center hover:bg-gray-50"
            >
              {navigatorDateLabel}
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              className="sr-only"
              value={dateMode === 'day' ? selectedDate : dateFrom}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                if (dateMode === 'range') {
                  setDateFrom(value);
                  setDateTo(value);
                  return;
                }
                setDateMode('day');
                setSelectedDate(value);
                setDateFrom(value);
                setDateTo(value);
              }}
            />
            <button
              type="button"
              onClick={handleNextDay}
              disabled={dateMode === 'all'}
              className="px-2.5 py-2 text-gray-400 hover:bg-gray-50 border-l border-gray-200 disabled:opacity-30"
              aria-label="Día siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={goToToday}
            className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all ${
              isTodaySelected
                ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                : 'bg-white text-[#1A1A1A] border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('today')}
          </button>
          <button
            type="button"
            onClick={() => setDateMode((m) => (m === 'all' ? 'day' : 'all'))}
            className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all ${
              dateMode === 'all'
                ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                : 'bg-white text-[#1A1A1A] border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('all')}
          </button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={exportCsv}
            disabled={!filteredPayments.length}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-100 rounded-xl text-[10px] font-bold text-[#1A1A1A] bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3 h-3" />
            {t('export')}
          </motion.button>
        </div>
      </div>

      <AnimSection>
        <div className="relative overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(160deg, #1A1A1A 0%, #2A2A2A 100%)' }}>
          <div className="relative z-10 p-5">
            <div className="flex items-center gap-2 mb-4">
              <PulseDot color="#22C55E" />
              <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">
                {dateMode === 'all' ? t('payments_financial_summary') : `Resumen · ${periodLabel}`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Efectivo', value: `EUR ${cashPeriodTotal}`, icon: <Banknote className="w-4 h-4" />, color: '#22C55E', sub: 'Mostrador' },
                { label: 'Tarjeta', value: `EUR ${cardPeriodTotal}`, icon: <CreditCard className="w-4 h-4" />, color: '#E31E24', sub: 'Mostrador' },
                { label: 'App', value: `EUR ${appPeriodTotal}`, icon: <Smartphone className="w-4 h-4" />, color: '#5B8DEE', sub: t('payments_digital') },
                { label: 'Tienda', value: `EUR ${storePeriodTotal}`, icon: <DollarSign className="w-4 h-4" />, color: '#8B5CF6', sub: 'Carrito' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="p-3.5 rounded-2xl bg-white/5 border border-white/5"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${stat.color}20` }}>
                      <span style={{ color: stat.color }}>{stat.icon}</span>
                    </div>
                    <span className="text-[10px] font-bold text-green-400">{stat.sub}</span>
                  </div>
                  <p className="text-xl font-black text-white">{stat.value}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </AnimSection>

      <AnimSection delay={0.05}>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-xs font-bold text-[#1A1A1A] mb-1">{t('payments_distribution')}</h3>
          <p className="text-[10px] text-gray-400 mb-4">{periodLabel}</p>
          <div className="space-y-3">
            {[
              { label: 'Efectivo', icon: <Banknote className="w-4 h-4 text-green-600" />, total: cashPeriodTotal, pct: cashPct, color: '#22C55E' },
              { label: 'Tarjeta (mostrador)', icon: <CreditCard className="w-4 h-4 text-[#E31E24]" />, total: cardPeriodTotal, pct: cardPct, color: '#E31E24' },
              { label: t('payments_from_app'), icon: <Smartphone className="w-4 h-4 text-blue-600" />, total: appPeriodTotal, pct: appPct, color: '#5B8DEE' },
              { label: 'Monedero', icon: <Wallet className="w-4 h-4 text-blue-600" />, total: walletPeriodTotal, pct: walletPct, color: '#8B5CF6' },
            ].map((method) => (
              <div key={method.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span>{method.icon}</span>
                    <span className="text-xs font-semibold text-[#1A1A1A]">{method.label}</span>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    EUR {method.total} ({method.pct}%)
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <motion.div
                    className="h-1.5 rounded-full"
                    style={{ backgroundColor: method.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${method.pct}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnimSection>

      <AnimSection delay={0.1}>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <input
                type="text"
                placeholder={t('payments_search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-[#1A1A1A] placeholder-gray-300 focus:ring-2 focus:ring-[#E31E24]/30"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 border rounded-2xl text-xs font-bold ${
                showFilters || activeFilterCount > 0
                  ? 'border-[#1A1A1A] text-[#1A1A1A] bg-gray-50'
                  : 'border-gray-100 text-[#1A1A1A]'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#1A1A1A] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pt-3 border-t border-gray-50 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Cliente</label>
                  <select
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-[#1A1A1A]"
                  >
                    <option value="">Todos los clientes</option>
                    {clientOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Origen</label>
                  <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value as 'all' | PaymentSource)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-[#1A1A1A]"
                  >
                    <option value="all">Todos</option>
                    <option value="booking">Turnos / reservas</option>
                    <option value="store">Tienda / carrito</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Estado</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as 'all' | PaymentStatus)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-[#1A1A1A]"
                  >
                    <option value="all">Todos</option>
                    <option value="completed">Completado</option>
                    <option value="pending">Pendiente</option>
                    <option value="refunded">Reembolso</option>
                    <option value="cancelled_admin">Cancelado por admin</option>
                    <option value="failed">Fallido</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">{t('payments_method')}</label>
                  <select
                    value={filterMethod}
                    onChange={(e) => setFilterMethod(e.target.value as 'all' | PaymentMethod)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-[#1A1A1A]"
                  >
                    <option value="all">{t('all')}</option>
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="wallet">Monedero</option>
                    <option value="app">App</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Periodo</label>
                  <select
                    value={dateMode}
                    onChange={(e) => setDateMode(e.target.value as DateFilterMode)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-[#1A1A1A]"
                  >
                    <option value="day">Un día</option>
                    <option value="range">Rango de fechas</option>
                    <option value="all">Todo el historial cargado</option>
                  </select>
                </div>
                {dateMode === 'range' && (
                  <>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Desde</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => e.target.value && setDateFrom(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-[#1A1A1A]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Hasta</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => e.target.value && setDateTo(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-[#1A1A1A]"
                      />
                    </div>
                  </>
                )}
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-[#1A1A1A]"
                >
                  <X className="w-3 h-3" />
                  Limpiar filtros
                </button>
              )}
            </motion.div>
          )}
        </div>
      </AnimSection>

      <AnimSection delay={0.15}>
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-xs text-gray-400">{t('loading')}</p>
            </div>
          ) : filteredPayments.length > 0 ? (
            filteredPayments.map((payment) => {
              const canOpenGrilla = payment.source === 'booking' && Boolean(payment.bookingId);
              const canEditStore = payment.source === 'store' && Boolean(payment.saleId);
              return (
              <div key={payment.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 relative">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${paymentMethodBadgeClass(payment.method)}`}>
                    <PaymentMethodIcon method={payment.method} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5 gap-2">
                      <p className="text-xs font-bold text-[#1A1A1A] truncate">{payment.client}</p>
                      <p className="text-xs font-black text-[#1A1A1A] shrink-0">EUR {payment.amount}</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
                      {canOpenGrilla ? (
                        <button
                          type="button"
                          onClick={() => openBookingInGrilla(payment.bookingId!)}
                          className="font-semibold text-[#006A6A] hover:underline text-left"
                        >
                          {payment.concept}
                        </button>
                      ) : canEditStore ? (
                        <button
                          type="button"
                          onClick={() => setEditSaleId(payment.saleId!)}
                          className="font-semibold text-[#006A6A] hover:underline text-left"
                        >
                          {payment.concept}
                        </button>
                      ) : (
                        <span>{payment.concept}</span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold ${paymentMethodBadgeClass(payment.method)}`}>
                        {paymentMethodLabel(payment.method)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md border border-gray-100 bg-gray-50 text-[9px] font-bold text-gray-500">
                        {payment.source === 'store' ? 'Tienda' : 'Turno'}
                      </span>
                      {payment.courtName && <span>• {payment.courtName}</span>}
                      <span>• {payment.dateLabel} · {payment.time}</span>
                    </div>
                  </div>
                  <PaymentStatusBadge status={payment.status} />
                  {canEditStore && (
                    <button
                      type="button"
                      title="Anular venta"
                      disabled={voidingSaleId === payment.saleId}
                      onClick={() => setVoidConfirmPayment(payment)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {payment.participants.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-50">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">Desglose por jugador</p>
                    <div className="space-y-1.5">
                      {payment.participants.map((participant, idx) => {
                        const paidCents = (participant.paid_amount_cents ?? 0) + (participant.wallet_amount_cents ?? 0);
                        const amountCents = paidCents > 0 ? paidCents : participant.share_amount_cents ?? 0;
                        const amountEur = Math.round(amountCents / 100);
                        const hasWalletSplit =
                          (participant.paid_amount_cents ?? 0) > 0 && (participant.wallet_amount_cents ?? 0) > 0;
                        return (
                          <div
                            key={`${payment.id}-${participant.player_id ?? idx}`}
                            className="flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-[11px] font-semibold text-[#1A1A1A] truncate">
                                {participantName(participant)}
                              </span>
                              {participant.payment_status === 'pending' && (
                                <span className="text-[9px] font-bold text-yellow-600">Pendiente</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[9px] font-bold ${methodBadgeClass(
                                  participant.payment_method,
                                )}`}
                              >
                                <MethodIcon method={participant.payment_method} />
                                {methodLabel(participant.payment_method)}
                                {hasWalletSplit && (
                                  <span className="text-[8px] font-semibold opacity-70">+ Monedero</span>
                                )}
                              </span>
                              <span className="text-[11px] font-black text-[#1A1A1A] tabular-nums">
                                EUR {amountEur}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
            })
          ) : (
            <div className="text-center py-12">
              <DollarSign className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">{t('payments_not_found')}</p>
            </div>
          )}
        </div>
      </AnimSection>

      {clubId && editSaleId && (
        <EditCartSaleModal
          clubId={clubId}
          saleId={editSaleId}
          onClose={() => setEditSaleId(null)}
          onSaved={() => {
            setEditSaleId(null);
            void reloadPayments();
          }}
        />
      )}

      {voidConfirmPayment && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => !voidingSaleId && setVoidConfirmPayment(null)}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-[#1A1A1A]">Anular venta</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{voidConfirmPayment.client}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVoidConfirmPayment(null)}
                disabled={Boolean(voidingSaleId)}
                className="w-9 h-9 rounded-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-50 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">
                ¿Anular esta venta de tienda? Se revertirá el stock y los cobros asociados.
              </p>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Concepto</span>
                  <span className="font-semibold text-gray-800 text-right truncate">{voidConfirmPayment.concept}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Importe</span>
                  <span className="font-black text-[#1A1A1A]">EUR {voidConfirmPayment.amount}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Fecha</span>
                  <span className="text-gray-700">{voidConfirmPayment.dateLabel} · {voidConfirmPayment.time}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end bg-gray-50/80">
              <button
                type="button"
                onClick={() => setVoidConfirmPayment(null)}
                disabled={Boolean(voidingSaleId)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#1A1A1A] bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmVoidSale()}
                disabled={Boolean(voidingSaleId)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {voidingSaleId ? 'Anulando...' : 'Anular venta'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
