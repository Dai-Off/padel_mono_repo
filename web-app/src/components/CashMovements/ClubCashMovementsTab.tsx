import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Banknote, CreditCard, Wallet, RotateCcw, XCircle, ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { paymentsService, type CashMovement, type CashMovementsSummary } from '../../services/payments';

function formatEur(cents: number): string {
  return (cents / 100).toFixed(2) + ' €';
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatBookingSlot(start: string | null, end: string | null): string {
  if (!start) return '—';
  const s = formatTime(start);
  const e = end ? formatTime(end) : '';
  return e ? `${s} - ${e}` : s;
}

function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function displayDate(dateStr: string): string {
  const today = todayLocalStr();
  if (dateStr === today) return 'Hoy';
  const yesterday = addDays(today, -1);
  if (dateStr === yesterday) return 'Ayer';
  const [y, m, dd] = dateStr.split('-');
  return `${dd}/${m}/${y}`;
}

const METHOD_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  cash: { label: 'Efectivo', icon: <Banknote size={14} />, color: 'text-green-700', bg: 'bg-green-50' },
  card: { label: 'Tarjeta', icon: <CreditCard size={14} />, color: 'text-blue-700', bg: 'bg-blue-50' },
  stripe: { label: 'Tarjeta online', icon: <Globe size={14} />, color: 'text-indigo-700', bg: 'bg-indigo-50' },
  wallet: { label: 'Monedero', icon: <Wallet size={14} />, color: 'text-purple-700', bg: 'bg-purple-50' },
};

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  payment: { label: 'Cobro', icon: null, color: 'text-green-600' },
  refund: { label: 'Devolución', icon: <RotateCcw size={13} />, color: 'text-amber-600' },
  cancellation: { label: 'Anulación', icon: <XCircle size={13} />, color: 'text-red-500' },
};

function MethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const cfg = METHOD_CONFIG[method];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col gap-1 shadow-sm">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-base font-bold ${color}`}>{value}</span>
    </div>
  );
}

function MovementRow({ m }: { m: CashMovement }) {
  const typeCfg = TYPE_CONFIG[m.type] ?? { label: m.type, icon: null, color: 'text-gray-600' };
  const isNegative = m.type === 'refund' || m.type === 'cancellation';

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold flex items-center gap-1 ${typeCfg.color}`}>
            {typeCfg.icon}
            {typeCfg.label}
          </span>
          <MethodBadge method={m.method} />
        </div>
        <span className="text-sm text-gray-800 font-medium truncate">{m.concept}</span>
        {m.court_name && (
          <span className="text-xs text-gray-500">
            {m.court_name}
            {m.start_at && ` · ${formatBookingSlot(m.start_at, m.end_at)}`}
          </span>
        )}
        {m.player_name && (
          <span className="text-xs text-gray-400">{m.player_name}</span>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`text-sm font-bold ${isNegative ? 'text-red-500' : 'text-gray-900'}`}>
          {isNegative ? '-' : '+'}{formatEur(m.amount_cents)}
        </span>
        <span className="text-xs text-gray-400">{formatDateLabel(m.created_at)}</span>
      </div>
    </div>
  );
}

export function ClubCashMovementsTab({
  clubId,
  clubResolved = true,
}: {
  clubId: string | null;
  clubResolved?: boolean;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState<string>(todayLocalStr());
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [summary, setSummary] = useState<CashMovementsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'payment' | 'refund' | 'cancellation'>('all');

  useEffect(() => {
    if (!clubId || !clubResolved) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await paymentsService.getCashMovements(clubId, date, tz);
        if (!mounted) return;
        setMovements(res.movements);
        setSummary(res.summary);
      } catch (e) {
        if (!mounted) return;
        toast.error((e as Error).message || t('fetch_error'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [clubId, clubResolved, date, t]);

  const filtered = filter === 'all' ? movements : movements.filter((m) => m.type === filter);
  const today = todayLocalStr();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-gray-900">{t('cash_movements_title')}</h2>
        {/* Date navigator */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setDate(addDays(date, -1))}
            className="p-0.5 rounded hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={16} className="text-gray-500" />
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[60px] text-center">
            {displayDate(date)}
          </span>
          <button
            type="button"
            onClick={() => setDate(addDays(date, 1))}
            disabled={date >= today}
            className="p-0.5 rounded hover:bg-gray-100 transition-colors disabled:opacity-30"
          >
            <ChevronRight size={16} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <SummaryCard label="Efectivo" value={formatEur(summary.cash_total_cents)} color="text-green-700" />
          <SummaryCard label="Tarjeta (TPV)" value={formatEur(summary.card_total_cents)} color="text-blue-700" />
          <SummaryCard label="Tarjeta (online)" value={formatEur(summary.stripe_total_cents)} color="text-indigo-700" />
          <SummaryCard label="Monedero" value={formatEur(summary.wallet_payments_cents)} color="text-purple-700" />
          <SummaryCard label="Devoluciones" value={formatEur(summary.refunds_total_cents)} color="text-amber-600" />
          <SummaryCard label="Anulaciones" value={String(summary.cancellations_count)} color="text-red-500" />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'payment', 'refund', 'cancellation'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              filter === f
                ? 'bg-[rgb(16,185,129)] text-white border-[rgb(16,185,129)]'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'Todos' : TYPE_CONFIG[f]?.label ?? f}
            {f !== 'all' && (
              <span className="ml-1 opacity-70">
                ({movements.filter((m) => m.type === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            {t('loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <Banknote size={32} className="opacity-30" />
            <span className="text-sm">{t('cash_movements_empty')}</span>
          </div>
        ) : (
          <div className="px-4">
            {filtered.map((m) => (
              <MovementRow key={m.id} m={m} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
