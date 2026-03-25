import { useMemo, useRef, useState, useEffect } from 'react';
import { CheckCircle, QrCode, TrendingUp, UserCheck, XCircle } from 'lucide-react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import QRCode from 'react-qr-code';
import { useTranslation } from 'react-i18next';
import {
  X,
  Users,
  Search,
  Mail,
  Phone,
  Plus,
  Loader2,
  Download,
  Send,
  Edit,
  Square,
  CheckSquare,
  Award,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageSpinner } from '../Layout/PageSpinner';
import { clubClientService } from '../../services/clubClients';
import type { Player } from '../../types/api';

function AnimSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
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

function StatCard({
  label,
  value,
  icon,
  color,
  delay = 0,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  delay?: number;
}) {
  return (
    <AnimSection delay={delay}>
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
            <span style={{ color }}>{icon}</span>
          </div>
          <div>
            <p className="text-lg font-black text-[#1A1A1A]">{value}</p>
            <p className="text-[10px] text-gray-400">{label}</p>
          </div>
        </div>
      </div>
    </AnimSection>
  );
}

export function ClubCheckinTab() {
  const { t } = useTranslation();
  const [checkins] = useState<
    { id: number; player: string; court: string; checkIn: string; checkOut: string | null; status: 'active' | 'completed' | 'no-show'; initials: string }[]
  >([]);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const qrValue = useMemo(() => (qrToken ? `padel://checkin/${qrToken}` : ''), [qrToken]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1A1A1A]">{t('checkin_title')}</h2>
        <motion.button
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={() => setQrToken(`CHK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold"
        >
          <QrCode className="w-3.5 h-3.5" />
          {t('checkin_generate_qr')}
        </motion.button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('checkin_active_now')} value="0" icon={<CheckCircle className="w-4 h-4" />} color="#22C55E" delay={0} />
        <StatCard label={t('checkin_today')} value="0" icon={<UserCheck className="w-4 h-4" />} color="#5B8DEE" delay={0.05} />
        <StatCard label={t('checkin_no_shows')} value="0" icon={<XCircle className="w-4 h-4" />} color="#E31E24" delay={0.1} />
        <StatCard label={t('checkin_attendance_rate')} value="0%" icon={<TrendingUp className="w-4 h-4" />} color="#8B5CF6" delay={0.15} />
      </div>

      <AnimSection delay={0.2}>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-xs font-bold text-[#1A1A1A]">{t('checkin_history_today')}</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {checkins.length === 0 && (
              <div className="text-center py-10">
                <p className="text-xs text-gray-400">{t('checkin_empty')}</p>
              </div>
            )}
            {checkins.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">{item.initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#1A1A1A] truncate">{item.player}</p>
                  <p className="text-[10px] text-gray-400">
                    {item.court} • {item.checkIn} - {item.checkOut || '...'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-100 bg-gray-50">
                    <PulseDot color={item.status === 'active' ? '#22C55E' : item.status === 'completed' ? '#5B8DEE' : '#E31E24'} />
                    <span className="text-[10px] font-semibold text-[#1A1A1A]">
                      {item.status === 'active' ? 'En pista' : item.status === 'completed' ? 'OK' : 'No-show'}
                    </span>
                  </div>
                  {item.status === 'active' && (
                    <motion.button whileTap={{ scale: 0.95 }} className="px-2.5 py-1 bg-[#1A1A1A] text-white rounded-lg text-[10px] font-bold">
                      Finalizar
                    </motion.button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnimSection>

      {qrToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 p-5 shadow-xl">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-3">{t('checkin_qr_generated')}</h3>
            <div className="bg-white p-4 rounded-xl border border-gray-100 flex justify-center">
              <QRCode value={qrValue} size={180} />
            </div>
            <p className="text-[10px] text-gray-400 mt-3 break-all">{qrToken}</p>
            <p className="text-[10px] text-gray-400 mt-1">{t('checkin_qr_placeholder')}</p>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setQrToken(null)}
                className="px-3.5 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-semibold"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

type EloTier = 'vip' | 'premium' | 'standard' | 'basic';

function eloTier(elo: number): EloTier {
  if (elo >= 1750) return 'vip';
  if (elo >= 1550) return 'premium';
  if (elo >= 1300) return 'standard';
  return 'basic';
}

const MEMBERSHIP_COLORS: Record<EloTier, string> = {
  vip: 'bg-purple-50 text-purple-600 border-purple-100',
  premium: 'bg-blue-50 text-blue-600 border-blue-100',
  standard: 'bg-green-50 text-green-600 border-green-100',
  basic: 'border-gray-100 bg-gray-50 text-gray-500',
};

function initials(first: string, last: string): string {
  const a = first?.trim().charAt(0)?.toUpperCase() || '';
  const b = last?.trim().charAt(0)?.toUpperCase() || '';
  return a + b || '?';
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

/** Texto del modal → HTML seguro para la API (saltos de línea = párrafos visibles). */
function plainMessageToEmailHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const withBreaks = escaped.split(/\r?\n/).join('<br />');
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6">${withBreaks}</div>`;
}

type Props = {
  clubId: string | null;
  clubResolved: boolean;
};

export function ClubDashboardExtensions({ clubId, clubResolved }: Props) {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deleted'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({ first_name: '', last_name: '', phone: '', email: '' });

  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', phone: '', email: '', elo_rating: '' });

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMode, setEmailMode] = useState<'selected' | 'all'>('selected');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const [detailPlayer, setDetailPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!clubResolved) return;
    if (!clubId) {
      setPlayers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const tmr = window.setTimeout(async () => {
      try {
        const list = await clubClientService.list(clubId, searchQuery.trim() || undefined);
        setPlayers(list ?? []);
      } catch {
        toast.error(t('crm_fetch_error'));
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    }, 320);
    return () => window.clearTimeout(tmr);
  }, [clubResolved, clubId, searchQuery, t]);

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => statusFilter === 'all' || p.status === statusFilter);
  }, [players, statusFilter]);

  const withEmailCount = useMemo(
    () => filteredPlayers.filter((p) => p.email && p.status !== 'deleted').length,
    [filteredPlayers]
  );

  const statVip = useMemo(() => players.filter((p) => p.elo_rating >= 1750 && p.status !== 'deleted').length, [players]);
  const statActive = useMemo(() => players.filter((p) => p.status === 'active').length, [players]);
  const statNewMonth = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return players.filter((p) => new Date(p.created_at) >= start).length;
  }, [players]);

  const tierLabel = useMemo(
    () => ({
      vip: t('crm_badge_vip'),
      premium: t('crm_badge_premium'),
      standard: t('crm_badge_standard'),
      basic: t('crm_badge_basic'),
    }),
    [t]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllWithEmail = () => {
    const next = new Set<string>();
    for (const p of filteredPlayers) {
      if (p.email && p.status !== 'deleted') next.add(p.id);
    }
    setSelectedIds(next);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const refreshList = () => {
    void (async () => {
      if (!clubId) return;
      try {
        const list = await clubClientService.list(clubId, searchQuery.trim() || undefined);
        setPlayers(list ?? []);
      } catch {
        toast.error(t('crm_fetch_error'));
      }
    })();
  };

  const handleExport = async () => {
    if (!clubId) return;
    try {
      const blob = await clubClientService.exportCsv(clubId, searchQuery.trim() || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clientes-club.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('crm_export_ok'));
    } catch {
      toast.error(t('crm_export_error'));
    }
  };

  const openEmail = (mode: 'selected' | 'all') => {
    setEmailMode(mode);
    setEmailSubject('');
    setEmailBody(`${t('crm_email_greeting')}\n\n`);
    setEmailOpen(true);
  };

  const submitEmail = async () => {
    if (!clubId || !emailSubject.trim() || !emailBody.trim()) {
      toast.error(t('crm_email_required'));
      return;
    }
    if (emailMode === 'selected' && selectedIds.size === 0) {
      toast.error(t('crm_select_at_least_one'));
      return;
    }
    setEmailSubmitting(true);
    try {
      const res = await clubClientService.sendEmail({
        club_id: clubId,
        subject: emailSubject.trim(),
        body_html: plainMessageToEmailHtml(emailBody),
        mode: emailMode,
        player_ids: emailMode === 'selected' ? [...selectedIds] : undefined,
      });
      if (res.failed_count === 0) {
        toast.success(t('crm_email_ok', { n: res.sent_count }));
      } else {
        toast.warning(t('crm_email_partial', { ok: res.sent_count, fail: res.failed_count }));
      }
      setEmailOpen(false);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : t('error_occurred');
      toast.error(msg);
    } finally {
      setEmailSubmitting(false);
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubId) return;
    const first = createForm.first_name.trim();
    const last = createForm.last_name.trim();
    const phone = createForm.phone.trim();
    const email = createForm.email.trim();
    if (!first || !last || !phone) {
      toast.error(t('crm_create_required'));
      return;
    }
    setCreateSubmitting(true);
    try {
      await clubClientService.createManual({
        club_id: clubId,
        first_name: first,
        last_name: last,
        phone,
        email: email || null,
      });
      toast.success(t('crm_create_ok'));
      setCreateOpen(false);
      setCreateForm({ first_name: '', last_name: '', phone: '', email: '' });
      refreshList();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : t('error_occurred');
      toast.error(msg);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openEdit = (p: Player) => {
    setEditPlayer(p);
    setEditForm({
      first_name: p.first_name,
      last_name: p.last_name,
      phone: p.phone ?? '',
      email: p.email ?? '',
      elo_rating: String(p.elo_rating ?? 1200),
    });
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubId || !editPlayer) return;
    const elo = Number(editForm.elo_rating);
    setEditSubmitting(true);
    try {
      await clubClientService.update(editPlayer.id, {
        club_id: clubId,
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() ? editForm.email.trim().toLowerCase() : null,
        elo_rating: Number.isFinite(elo) ? elo : undefined,
      });
      toast.success(t('crm_edit_ok'));
      setEditPlayer(null);
      refreshList();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : t('error_occurred');
      toast.error(msg);
    } finally {
      setEditSubmitting(false);
    }
  };

  const sendOneEmail = (p: Player) => {
    if (!p.email) {
      toast.error(t('crm_no_email'));
      return;
    }
    setSelectedIds(new Set([p.id]));
    openEmail('selected');
  };

  if (!clubResolved) {
    return <PageSpinner />;
  }

  if (!clubId) {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-5 text-sm text-amber-900">
        {t('crm_no_club')}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-sm font-bold text-[#1A1A1A]">{t('crm_page_title')}</h2>
        <div className="flex flex-wrap gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => openEmail('all')}
            className="flex items-center gap-1.5 rounded-xl border border-gray-100 bg-white px-3 py-2 text-[10px] font-bold text-[#1A1A1A]"
          >
            <Send className="h-3 w-3" />
            {t('crm_email_massive')}
          </motion.button>
          {selectedIds.size > 0 ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => openEmail('selected')}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[10px] font-bold text-[#1A1A1A]"
            >
              <Mail className="h-3 w-3" />
              {t('crm_email_selection_short')} ({selectedIds.size})
            </motion.button>
          ) : null}
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[#E31E24] px-3 py-2 text-[10px] font-bold text-white"
          >
            <Plus className="h-3 w-3" />
            {t('crm_new_client')}
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t('crm_stat_total')} value={String(players.length)} icon={<Users className="h-4 w-4" />} color="#5B8DEE" delay={0} />
        <StatCard label={t('crm_stat_vip')} value={String(statVip)} icon={<Award className="h-4 w-4" />} color="#8B5CF6" delay={0.05} />
        <StatCard label={t('crm_stat_active_month')} value={String(statActive)} icon={<CheckCircle className="h-4 w-4" />} color="#22C55E" delay={0.1} />
        <StatCard label={t('crm_stat_new_month')} value={String(statNewMonth)} icon={<TrendingUp className="h-4 w-4" />} color="#F59E0B" delay={0.15} />
      </div>

      <AnimSection delay={0.2}>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <div className="flex flex-col gap-3 border-b border-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-xs font-bold text-[#1A1A1A]">{t('crm_database_title')}</h3>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={handleExport}
              className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-[#1A1A1A]"
            >
              <Download className="h-3 w-3" />
              {t('crm_export_link')}
            </motion.button>
          </div>

          <div className="border-b border-gray-50 bg-gray-50/40 px-5 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
                <input
                  type="text"
                  placeholder={t('crm_search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-2xl border border-gray-100 bg-white py-2.5 pl-10 pr-4 text-xs text-[#1A1A1A] placeholder-gray-300 focus:ring-2 focus:ring-[#E31E24]/20"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['all', 'active', 'deleted'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-all ${
                      statusFilter === s ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#1A1A1A] ring-1 ring-gray-100'
                    }`}
                  >
                    {s === 'all' ? t('players_filter_all') : s === 'active' ? t('players_filter_active') : t('players_filter_deleted')}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={selectAllWithEmail}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-bold text-gray-600 hover:bg-gray-50"
                >
                  {t('crm_select_all_email')}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-bold text-gray-600 hover:bg-gray-50"
                >
                  {t('crm_clear_selection')}
                </button>
              </div>
            </div>
            {withEmailCount > 0 ? (
              <p className="mt-2 text-[10px] text-gray-400">
                {t('crm_stat_with_email')}: {withEmailCount}
              </p>
            ) : null}
          </div>

          {loading ? (
            <div className="py-16">
              <PageSpinner />
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">{t('crm_empty')}</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredPlayers.map((player) => {
                const hasEmail = !!(player.email && player.status !== 'deleted');
                const checked = selectedIds.has(player.id);
                const tier = eloTier(player.elo_rating);
                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50/50"
                  >
                    <button
                      type="button"
                      onClick={() => hasEmail && toggleSelect(player.id)}
                      disabled={!hasEmail}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-gray-100 text-gray-400 hover:bg-gray-50 disabled:opacity-30"
                      aria-label={t('crm_toggle_select')}
                    >
                      {checked ? <CheckSquare className="h-3.5 w-3.5 text-[#E31E24]" /> : <Square className="h-3.5 w-3.5" />}
                    </button>
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1A1A1A]">
                      <span className="text-[10px] font-bold text-white">{initials(player.first_name, player.last_name)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold text-[#1A1A1A]">
                          {player.first_name} {player.last_name}
                        </p>
                        <span className={`rounded-lg border px-2 py-0.5 text-[9px] font-bold ${MEMBERSHIP_COLORS[tier]}`}>
                          {tierLabel[tier]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[10px] text-gray-400">
                        <span>
                          {t('crm_row_elo')} {player.elo_rating}
                        </span>
                        <span>
                          {t('players_member_since')} {formatDate(player.created_at)}
                        </span>
                        {player.email ? <span className="truncate">{player.email}</span> : null}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <PulseDot color={player.status === 'active' ? '#22C55E' : '#9CA3AF'} />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => sendOneEmail(player)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 hover:bg-gray-50"
                          title={t('crm_send_one')}
                        >
                          <Mail className="h-3 w-3 text-gray-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(player)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 hover:bg-gray-50"
                          title={t('crm_edit')}
                        >
                          <Edit className="h-3 w-3 text-gray-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailPlayer(player)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 hover:bg-gray-50"
                          title={t('crm_detail')}
                        >
                          <Eye className="h-3 w-3 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AnimSection>

      <AnimatePresence>
        {detailPlayer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetailPlayer(null)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl"
            >
              <div className="sticky top-0 z-10 rounded-t-3xl border-b border-gray-50 bg-white pt-3">
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
                <div className="flex items-start justify-between px-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1A1A1A] font-bold text-white">
                      {initials(detailPlayer.first_name, detailPlayer.last_name)}
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-[#1A1A1A]">
                        {detailPlayer.first_name} {detailPlayer.last_name}
                      </h2>
                      <p className="text-[10px] text-gray-400">
                        {t('players_member_since')} {formatDate(detailPlayer.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailPlayer(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 px-5 py-4 text-[10px] text-gray-500">
                {detailPlayer.email ? (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {detailPlayer.email}
                  </span>
                ) : null}
                {detailPlayer.phone ? (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {detailPlayer.phone}
                  </span>
                ) : null}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !createSubmitting && setCreateOpen(false)}
              className="fixed inset-0 z-50 bg-black/40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 z-50 mx-4 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1A1A1A]">{t('crm_create_title')}</h3>
                <button
                  type="button"
                  onClick={() => !createSubmitting && setCreateOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              <p className="mb-4 text-xs text-gray-500">{t('crm_create_hint')}</p>
              <form onSubmit={submitCreate} className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">{t('registration_first_name')} *</label>
                  <input
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, first_name: e.target.value }))}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs focus:ring-2 focus:ring-[#E31E24]/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">{t('registration_last_name')} *</label>
                  <input
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, last_name: e.target.value }))}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs focus:ring-2 focus:ring-[#E31E24]/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">{t('phone')} *</label>
                  <input
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs focus:ring-2 focus:ring-[#E31E24]/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">{t('email_label')}</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs focus:ring-2 focus:ring-[#E31E24]/30"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-gray-600"
                  >
                    {t('cancel')}
                  </button>
                  <motion.button
                    type="submit"
                    disabled={createSubmitting}
                    whileTap={{ scale: 0.98 }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#E31E24] py-2.5 text-xs font-bold text-white"
                  >
                    {createSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {t('save')}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editPlayer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !editSubmitting && setEditPlayer(null)}
              className="fixed inset-0 z-50 bg-black/40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 z-50 mx-4 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1A1A1A]">{t('crm_edit_title')}</h3>
                <button
                  type="button"
                  onClick={() => !editSubmitting && setEditPlayer(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              <form onSubmit={submitEdit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">{t('registration_first_name')}</label>
                  <input
                    value={editForm.first_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">{t('registration_last_name')}</label>
                  <input
                    value={editForm.last_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">{t('phone')}</label>
                  <input
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">{t('email_label')}</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">ELO</label>
                  <input
                    value={editForm.elo_rating}
                    onChange={(e) => setEditForm((f) => ({ ...f, elo_rating: e.target.value }))}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditPlayer(null)}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-gray-600"
                  >
                    {t('cancel')}
                  </button>
                  <motion.button
                    type="submit"
                    disabled={editSubmitting}
                    whileTap={{ scale: 0.98 }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] py-2.5 text-xs font-bold text-white"
                  >
                    {editSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {t('save')}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {emailOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !emailSubmitting && setEmailOpen(false)}
              className="fixed inset-0 z-50 bg-black/40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 z-50 mx-4 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-5 shadow-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1A1A1A]">{t('crm_email_modal_title')}</h3>
                <button
                  type="button"
                  onClick={() => !emailSubmitting && setEmailOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              <p className="mb-2 text-[10px] text-gray-500">
                {emailMode === 'all' ? t('crm_email_mode_all') : t('crm_email_mode_selected', { n: selectedIds.size })}
              </p>
              <p className="mb-3 text-[10px] leading-relaxed text-gray-400">{t('crm_email_message_tip')}</p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">{t('crm_subject')}</label>
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-500">{t('crm_email_message')}</label>
                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={8}
                    placeholder={t('crm_email_message_placeholder')}
                    className="w-full rounded-xl border border-gray-100 px-3 py-2.5 text-xs placeholder:text-gray-300"
                  />
                </div>
                <motion.button
                  type="button"
                  disabled={emailSubmitting}
                  whileTap={{ scale: 0.98 }}
                  onClick={submitEmail}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-100 bg-[#1A1A1A] py-2.5 text-xs font-bold text-white"
                >
                  {emailSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {t('crm_send')}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
