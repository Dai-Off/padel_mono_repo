import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  CreditCard,
  DollarSign,
  Download,
  Filter,
  Search,
  Smartphone,
  TrendingUp,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { paymentsService, type PaymentTransaction } from '../../services/payments';
import { useTranslation } from 'react-i18next';
import { PageSpinner } from '../Layout/PageSpinner';

type PaymentMethod = 'TPV' | 'App';
type PaymentStatus = 'completed' | 'pending' | 'failed' | 'refunded';

type Payment = {
  id: string;
  dateIso: string;
  dateLabel: string;
  time: string;
  client: string;
  concept: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  courtName?: string;
};

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

function mapStatus(status: string): PaymentStatus {
  if (status === 'succeeded') return 'completed';
  if (status === 'requires_action') return 'pending';
  if (status === 'failed') return 'failed';
  if (status === 'refunded') return 'refunded';
  return 'pending';
}

function toPayment(tx: PaymentTransaction): Payment {
  const dt = new Date(tx.created_at);
  const bookingLabel = tx.booking_id ? `Reserva ${tx.booking_id.slice(0, 8)}` : 'Pago';
  const payerName = [tx.payer_first_name, tx.payer_last_name].filter(Boolean).join(' ').trim();
  const clientLabel = payerName || tx.payer_email || tx.club_name || 'Cliente';
  return {
    id: tx.id,
    dateIso: tx.created_at,
    dateLabel: Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    client: clientLabel,
    concept: bookingLabel,
    method: tx.booking_id ? 'App' : 'TPV',
    amount: Math.round((tx.amount_cents ?? 0) / 100),
    status: mapStatus(tx.status),
    courtName: tx.court_name ?? undefined,
  };
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const config: Record<PaymentStatus, { dot: string; label: string; bg: string }> = {
    completed: { dot: '#22C55E', label: 'OK', bg: 'bg-green-50 text-green-600 border-green-100' },
    pending: { dot: '#EAB308', label: 'Pendiente', bg: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
    failed: { dot: '#E31E24', label: 'Fallido', bg: 'bg-red-50 text-red-500 border-red-100' },
    refunded: { dot: '#9CA3AF', label: 'Reembolso', bg: 'bg-gray-50 text-gray-500 border-gray-100' },
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
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<'all' | PaymentMethod>('all');
  const [filterDate, setFilterDate] = useState<'today' | 'all'>('today');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!clubId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const rows = await paymentsService.listClubTransactions(clubId, 100);
        if (!mounted) return;
        setAllPayments(rows.map(toPayment));
      } catch (e) {
        if (!mounted) return;
        toast.error((e as Error).message || t('payments_load_error'));
        setAllPayments([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [clubId]);
  const todayKey = new Date().toDateString();

  const filteredPayments = allPayments.filter((payment) => {
    const matchSearch =
      payment.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.concept.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchMethod = filterMethod === 'all' || payment.method === filterMethod;
    const matchDate = filterDate === 'all' || new Date(payment.dateIso).toDateString() === todayKey;
    return matchSearch && matchMethod && matchDate;
  });

  const todayPayments = allPayments.filter((p) => new Date(p.dateIso).toDateString() === todayKey);
  const tpvTodayTotal = todayPayments.filter((p) => p.method === 'TPV' && p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
  const appTodayTotal = todayPayments.filter((p) => p.method === 'App' && p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
  const tpvMonthTotal = allPayments.filter((p) => p.method === 'TPV' && p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
  const appMonthTotal = allPayments.filter((p) => p.method === 'App' && p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
  const denominator = tpvMonthTotal + appMonthTotal || 1;
  const tpvPct = Math.round((tpvMonthTotal / denominator) * 100);
  const appPct = 100 - tpvPct;

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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1A1A1A]">{t('payments_title')}</h2>
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

      <AnimSection>
        <div className="relative overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(160deg, #1A1A1A 0%, #2A2A2A 100%)' }}>
          <div className="relative z-10 p-5">
            <div className="flex items-center gap-2 mb-4">
              <PulseDot color="#22C55E" />
              <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">{t('payments_financial_summary')}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: t('payments_tpv_today'), value: `EUR ${tpvTodayTotal}`, icon: <CreditCard className="w-4 h-4" />, color: '#E31E24', sub: t('payments_physical') },
                { label: t('payments_app_today'), value: `EUR ${appTodayTotal}`, icon: <Smartphone className="w-4 h-4" />, color: '#5B8DEE', sub: t('payments_digital') },
                { label: t('payments_tpv_month'), value: `EUR ${tpvMonthTotal}`, icon: <TrendingUp className="w-4 h-4" />, color: '#22C55E', sub: '+12%' },
                { label: t('payments_app_month'), value: `EUR ${appMonthTotal}`, icon: <TrendingUp className="w-4 h-4" />, color: '#8B5CF6', sub: '+18%' },
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
          <h3 className="text-xs font-bold text-[#1A1A1A] mb-4">{t('payments_distribution')}</h3>
          <div className="space-y-3">
            {[
              { label: t('payments_tpv_physical'), icon: <CreditCard className="w-4 h-4 text-[#E31E24]" />, total: tpvMonthTotal, pct: tpvPct, color: '#E31E24' },
              { label: t('payments_from_app'), icon: <Smartphone className="w-4 h-4 text-blue-600" />, total: appMonthTotal, pct: appPct, color: '#5B8DEE' },
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
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
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
            <button onClick={() => setShowFilters((v) => !v)} className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-100 rounded-2xl text-xs font-bold text-[#1A1A1A]">
              <Filter className="w-3.5 h-3.5" />
              <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 pt-3 border-t border-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">{t('payments_method')}</label>
                  <div className="flex gap-1.5">
                    {(['all', 'TPV', 'App'] as const).map((method) => (
                      <button
                        key={method}
                        onClick={() => setFilterMethod(method)}
                        className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-bold transition-all ${filterMethod === method ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}
                      >
                        {method === 'all' ? t('all') : method}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">{t('date')}</label>
                  <select
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value as 'today' | 'all')}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-[#1A1A1A]"
                  >
                    <option value="today">{t('today')}</option>
                    <option value="all">{t('all')}</option>
                  </select>
                </div>
              </div>
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
            filteredPayments.map((payment) => (
              <div key={payment.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${payment.method === 'TPV' ? 'bg-[#E31E24]/10' : 'bg-blue-50'}`}>
                  {payment.method === 'TPV' ? <CreditCard className="w-4 h-4 text-[#E31E24]" /> : <Smartphone className="w-4 h-4 text-blue-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-xs font-bold text-[#1A1A1A] truncate">{payment.client}</p>
                    <p className="text-xs font-black text-[#1A1A1A]">EUR {payment.amount}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span>{payment.concept}</span>
                    {payment.courtName && <span>• {payment.courtName}</span>}
                    <span>• {payment.time}</span>
                  </div>
                </div>
                <PaymentStatusBadge status={payment.status} />
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <DollarSign className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">{t('payments_not_found')}</p>
            </div>
          )}
        </div>
      </AnimSection>
    </motion.div>
  );
}
