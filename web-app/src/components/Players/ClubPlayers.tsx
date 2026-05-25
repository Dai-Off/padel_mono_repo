import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Users, TrendingUp, Search, Eye, Mail, Phone, Zap, Plus, Loader2, Wallet, Send, Square, CheckSquare,
} from 'lucide-react';
import { PageSpinner } from '../Layout/PageSpinner';
import { useTranslation } from 'react-i18next';
import { clubClientService } from '../../services/clubClients';
import { apiFetchWithAuth } from '../../services/api';
import type { ClubClientTier } from '../../services/clubClients';
import type { Player } from '../../types/api';
import { toast } from 'sonner';
import { formatPlayerLabel } from '../../lib/playerLabel';

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

function initials(first: string, last: string): string {
  const a = first?.trim().charAt(0)?.toUpperCase() || '';
  const b = last?.trim().charAt(0)?.toUpperCase() || '';
  return (a + b) || '?';
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

const SEGMENT_SLUGS = ['standard', 'staff', 'admin', 'vip', 'sponsor', 'coach'] as const;

function formatBalanceCents(cents: number, currency: string): string {
  const code = (currency || 'EUR').trim() || 'EUR';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

/** Plain text → safe HTML body for the email API (line breaks become <br />). */
function plainMessageToEmailHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6">${escaped
    .split(/\r?\n/)
    .join('<br />')}</div>`;
}

type ClubPlayersTabProps = {
  clubId: string | null;
  currency?: string;
};

export function ClubPlayersTab({ clubId, currency = 'EUR' }: ClubPlayersTabProps) {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoadRef = useRef(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deleted'>('all');
  const [tierFilter, setTierFilter] = useState<'all' | ClubClientTier>('all');
  const [eloMin, setEloMin] = useState('');
  const [eloMax, setEloMax] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [walletFilter, setWalletFilter] = useState<'any' | 'yes' | 'no'>('any');
  const [walletMoneyFilter, setWalletMoneyFilter] = useState<'any' | 'with_money' | 'without_money'>('any');
  const [balanceMinEur, setBalanceMinEur] = useState('');
  const [balanceMaxEur, setBalanceMaxEur] = useState('');
  const [schoolFilter, setSchoolFilter] = useState<'any' | 'yes' | 'no'>('any');
  const [bookingsMin, setBookingsMin] = useState('');
  const [currentBookingFilter, setCurrentBookingFilter] = useState<'any' | 'yes' | 'no'>('any');
  const [tournamentFilter, setTournamentFilter] = useState<'any' | 'yes' | 'no'>('any');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualForm, setManualForm] = useState({ first_name: '', last_name: '', phone: '', email: '', username: '' });
  const [contactForm, setContactForm] = useState({ username: '', phone: '', email: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const [segmentSlug, setSegmentSlug] = useState<string>('standard');
  const [segmentDiscount, setSegmentDiscount] = useState('0');
  const [segmentSaving, setSegmentSaving] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMode, setEmailMode] = useState<'selected' | 'all'>('selected');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const fetchPlayers = useCallback(async () => {
    if (!clubId) {
      setPlayers([]);
      setLoading(false);
      return;
    }
    if (firstLoadRef.current) setLoading(true);
    else setRefreshing(true);
    try {
      const balanceMin = balanceMinEur.trim() ? Math.round(Number(balanceMinEur) * 100) : undefined;
      const balanceMax = balanceMaxEur.trim() ? Math.round(Number(balanceMaxEur) * 100) : undefined;
      const list = await clubClientService.list(clubId, {
        q: searchQuery.trim() || undefined,
        tier: tierFilter === 'all' ? undefined : tierFilter,
        elo_min: eloMin.trim() ? Number(eloMin) : undefined,
        elo_max: eloMax.trim() ? Number(eloMax) : undefined,
        created_from: createdFrom || undefined,
        created_to: createdTo || undefined,
        has_wallet: walletFilter === 'any' ? undefined : walletFilter === 'yes',
        has_wallet_balance: walletMoneyFilter === 'any' ? undefined : walletMoneyFilter === 'with_money',
        balance_min_cents: Number.isFinite(balanceMin as number) ? balanceMin : undefined,
        balance_max_cents: Number.isFinite(balanceMax as number) ? balanceMax : undefined,
        has_school: schoolFilter === 'any' ? undefined : schoolFilter === 'yes',
        bookings_min: bookingsMin.trim() ? Number(bookingsMin) : undefined,
        has_current_booking: currentBookingFilter === 'any' ? undefined : currentBookingFilter === 'yes',
        has_tournament: tournamentFilter === 'any' ? undefined : tournamentFilter === 'yes',
      });
      setPlayers(list ?? []);
    } catch (e) {
      console.error(e);
      toast.error(t('players_fetch_error'));
    } finally {
      firstLoadRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, clubId, searchQuery, tierFilter, eloMin, eloMax, createdFrom, createdTo, walletFilter, walletMoneyFilter, balanceMinEur, balanceMaxEur, schoolFilter, bookingsMin, currentBookingFilter, tournamentFilter]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  useEffect(() => {
    if (!selectedPlayer) return;
    setSegmentSlug(selectedPlayer.segment_slug ?? 'standard');
    setSegmentDiscount(String(selectedPlayer.discount_percent ?? 0));
    setContactForm({
      username: selectedPlayer.username ?? '',
      phone: selectedPlayer.phone ?? '',
      email: selectedPlayer.email ?? '',
    });
  }, [selectedPlayer?.id, selectedPlayer?.segment_slug, selectedPlayer?.discount_percent, selectedPlayer?.username, selectedPlayer?.phone, selectedPlayer?.email]);

  const filteredPlayers = players.filter((p) => statusFilter === 'all' || p.status === statusFilter);

  const totalPlayers = players.length;
  const activePlayers = players.filter((p) => p.status === 'active').length;
  const withAccount = players.filter((p) => p.auth_user_id).length;
  const withEmailCount = filteredPlayers.filter((p) => p.email && p.status !== 'deleted').length;

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
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : t('error_occurred');
      toast.error(msg);
    } finally {
      setEmailSubmitting(false);
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

  const handleSaveSegment = async () => {
    if (!clubId || !selectedPlayer) return;
    const dp = Math.min(100, Math.max(0, Math.trunc(Number(segmentDiscount) || 0)));
    setSegmentSaving(true);
    try {
      await apiFetchWithAuth<{ ok: boolean; segment?: { segment_slug: string; discount_percent: number } }>(
        '/club-player-segments',
        {
          method: 'PUT',
          body: JSON.stringify({
            club_id: clubId,
            player_id: selectedPlayer.id,
            segment_slug: segmentSlug,
            discount_percent: dp,
          }),
        }
      );
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === selectedPlayer.id ? { ...p, segment_slug: segmentSlug, discount_percent: dp } : p
        )
      );
      setSelectedPlayer((p) => (p ? { ...p, segment_slug: segmentSlug, discount_percent: dp } : null));
      toast.success('Tipo de cliente actualizado');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      toast.error(msg);
    } finally {
      setSegmentSaving(false);
    }
  };

  const handleSaveContact = async () => {
    if (!clubId || !selectedPlayer) return;
    setContactSaving(true);
    try {
      const username = contactForm.username.trim().toLowerCase();
      const updated = await clubClientService.update(selectedPlayer.id, {
        club_id: clubId,
        phone: contactForm.phone.trim() || null,
        email: contactForm.email.trim() || null,
        username: username || null,
      });
      setPlayers((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      setSelectedPlayer(updated);
      toast.success('Datos de contacto actualizados');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      toast.error(msg);
    } finally {
      setContactSaving(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubId) return;
    const first = manualForm.first_name.trim();
    const last = manualForm.last_name.trim();
    const phone = manualForm.phone.trim();
    const email = manualForm.email.trim();
    if (!first || !last || !phone) {
      toast.error(t('players_manual_required'));
      return;
    }
    setManualSubmitting(true);
    try {
      const username = manualForm.username.trim().toLowerCase();
      await clubClientService.createManual({
        club_id: clubId,
        first_name: first,
        last_name: last,
        phone,
        email: email || null,
        username: username || null,
      });
      toast.success(t('players_manual_success'));
      setManualOpen(false);
      setManualForm({ first_name: '', last_name: '', phone: '', email: '', username: '' });
      fetchPlayers();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : t('error_occurred');
      toast.error(msg);
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(160deg, #1A1A1A 0%, #2A2A2A 100%)' }}>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-4">
            <PulseDot color="#5B8DEE" />
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">{t('players_club_section')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: t('players_total'), value: String(totalPlayers), icon: <Users className="w-4 h-4" />, color: '#5B8DEE' },
              { label: t('players_active'), value: String(activePlayers), icon: <TrendingUp className="w-4 h-4" />, color: '#22C55E' },
              { label: t('players_with_account'), value: String(withAccount), icon: <Zap className="w-4 h-4" />, color: '#F59E0B' },
            ].map((s, i) => (
              <motion.div
                key={i}
                className="p-3.5 rounded-2xl bg-white/5 border border-white/5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.color}20` }}>
                    <span style={{ color: s.color }}>{s.icon}</span>
                  </div>
                </div>
                <p className="text-xl font-black text-white">{s.value}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="text"
              placeholder={t('players_search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-[#1A1A1A] placeholder-gray-300 focus:ring-2 focus:ring-[#E31E24]/30"
            />
          </div>
          <div className="flex gap-1.5 items-center flex-wrap">
            {(['all', 'active', 'deleted'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all ${statusFilter === s ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}
              >
                {s === 'all' ? t('players_filter_all') : s === 'active' ? t('players_filter_active') : t('players_filter_deleted')}
              </button>
            ))}
            <button
              type="button"
              onClick={() => openEmail('all')}
              className="ml-1 flex items-center gap-1.5 rounded-xl border border-gray-100 bg-white px-3 py-2 text-[10px] font-bold text-[#1A1A1A] hover:bg-gray-50"
            >
              <Send className="w-3 h-3" />
              {t('crm_email_massive')}
            </button>
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => openEmail('selected')}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[10px] font-bold text-[#1A1A1A] hover:bg-gray-100"
              >
                <Mail className="w-3 h-3" />
                {t('crm_email_selection_short')} ({selectedIds.size})
              </button>
            )}
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="ml-1 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold bg-[#E31E24] text-white hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('players_manual_add')}
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={selectAllWithEmail}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-bold text-gray-600 hover:bg-gray-50"
          >
            {t('crm_select_all_email')}
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-bold text-gray-600 hover:bg-gray-50"
            >
              {t('crm_clear_selection')}
            </button>
          )}
          {withEmailCount > 0 && (
            <span className="px-1 text-[10px] text-gray-400">
              {t('crm_stat_with_email')}: {withEmailCount}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          <div className="flex flex-col gap-1">
            <span className="px-1 text-[9px] font-bold uppercase tracking-wide text-gray-400">Nivel</span>
            {/*
              Categorías VIP/Premium/Standard/Basic ocultas a petición del usuario.
              Se mantiene el state `tierFilter` por si se vuelve a habilitar.
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'vip', 'premium', 'standard', 'basic'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTierFilter(k as 'all' | ClubClientTier)}
                  className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-all ${
                    tierFilter === k ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#1A1A1A] ring-1 ring-gray-100'
                  }`}
                >
                  {k === 'all' ? 'Todos' : k === 'vip' ? 'VIP' : k === 'premium' ? 'Premium' : k === 'standard' ? 'Standard' : 'Basic'}
                </button>
              ))}
            </div>
            */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={eloMin}
                onChange={(e) => setEloMin(e.target.value)}
                className="w-24 rounded-xl border border-gray-100 bg-white px-3 py-2 text-[10px] font-bold text-[#1A1A1A]"
                placeholder="Nivel min"
              />
              <input
                type="number"
                min={0}
                value={eloMax}
                onChange={(e) => setEloMax(e.target.value)}
                className="w-24 rounded-xl border border-gray-100 bg-white px-3 py-2 text-[10px] font-bold text-[#1A1A1A]"
                placeholder="Nivel max"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="px-1 text-[9px] font-bold uppercase tracking-wide text-gray-400">Monedero</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['any', 'yes', 'no'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setWalletFilter(k)}
                  className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-all ${
                    walletFilter === k ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#1A1A1A] ring-1 ring-gray-100'
                  }`}
                >
                  {k === 'any' ? 'Todos' : k === 'yes' ? 'Sí' : 'No'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {(['any', 'with_money', 'without_money'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setWalletMoneyFilter(k)}
                  className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-all ${
                    walletMoneyFilter === k ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#1A1A1A] ring-1 ring-gray-100'
                  }`}
                >
                  {k === 'any' ? 'Saldo: todos' : k === 'with_money' ? 'Con dinero' : 'Sin dinero'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                step="0.01"
                value={balanceMinEur}
                onChange={(e) => setBalanceMinEur(e.target.value)}
                className="w-24 rounded-xl border border-gray-100 bg-white px-3 py-2 text-[10px] font-bold text-[#1A1A1A]"
                placeholder={`Saldo min ${currency}`}
                aria-label="Saldo mínimo"
              />
              <input
                type="number"
                step="0.01"
                value={balanceMaxEur}
                onChange={(e) => setBalanceMaxEur(e.target.value)}
                className="w-24 rounded-xl border border-gray-100 bg-white px-3 py-2 text-[10px] font-bold text-[#1A1A1A]"
                placeholder={`Saldo max ${currency}`}
                aria-label="Saldo máximo"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="px-1 text-[9px] font-bold uppercase tracking-wide text-gray-400">Fechas</span>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <span className="px-1 text-[9px] font-bold text-gray-400">Alta desde</span>
                <input
                  type="date"
                  value={createdFrom}
                  onChange={(e) => setCreatedFrom(e.target.value)}
                  className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-[10px] font-bold text-[#1A1A1A]"
                  aria-label="Alta desde"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="px-1 text-[9px] font-bold text-gray-400">Alta hasta</span>
                <input
                  type="date"
                  value={createdTo}
                  onChange={(e) => setCreatedTo(e.target.value)}
                  className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-[10px] font-bold text-[#1A1A1A]"
                  aria-label="Alta hasta"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="px-1 text-[9px] font-bold uppercase tracking-wide text-gray-400">Actividad</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['any', 'yes', 'no'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSchoolFilter(k)}
                  className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-all ${
                    schoolFilter === k ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#1A1A1A] ring-1 ring-gray-100'
                  }`}
                >
                  {k === 'any' ? 'Escuela: todos' : k === 'yes' ? 'Con escuela' : 'Sin escuela'}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              value={bookingsMin}
              onChange={(e) => setBookingsMin(e.target.value)}
              className="w-28 rounded-xl border border-gray-100 bg-white px-3 py-2 text-[10px] font-bold text-[#1A1A1A] mt-1"
              placeholder="Reservas mín."
              aria-label="Reservas mínimo"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="px-1 text-[9px] font-bold uppercase tracking-wide text-gray-400">Reservas y torneos</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['any', 'yes', 'no'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCurrentBookingFilter(k)}
                  className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-all ${
                    currentBookingFilter === k ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#1A1A1A] ring-1 ring-gray-100'
                  }`}
                >
                  {k === 'any' ? 'Reserva: todos' : k === 'yes' ? 'Con reserva actual' : 'Sin reserva actual'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {(['any', 'yes', 'no'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTournamentFilter(k)}
                  className={`rounded-xl px-3 py-2 text-[10px] font-bold transition-all ${
                    tournamentFilter === k ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#1A1A1A] ring-1 ring-gray-100'
                  }`}
                >
                  {k === 'any' ? 'Torneo: todos' : k === 'yes' ? 'En torneo' : 'Sin torneo'}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setTierFilter('all');
              setCreatedFrom('');
              setCreatedTo('');
              setWalletFilter('any');
              setWalletMoneyFilter('any');
              setBalanceMinEur('');
              setBalanceMaxEur('');
              setEloMin('');
              setEloMax('');
              setSchoolFilter('any');
              setBookingsMin('');
              setCurrentBookingFilter('any');
              setTournamentFilter('any');
            }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-bold text-gray-600 hover:bg-gray-50 h-fit self-end"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {loading ? (
        <PageSpinner />
      ) : (
        <div className="space-y-2">
          {refreshing && (
            <p className="text-[10px] text-gray-400 px-1">Actualizando lista...</p>
          )}
          {filteredPlayers.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">{t('players_empty')}</div>
          ) : (
            filteredPlayers.map((player) => {
              const hasEmail = !!(player.email && player.status !== 'deleted');
              const checked = selectedIds.has(player.id);
              return (
              <div
                key={player.id}
                className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => hasEmail && toggleSelect(player.id)}
                    disabled={!hasEmail}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-gray-100 text-gray-400 hover:bg-gray-50 disabled:opacity-30"
                    aria-label="Seleccionar cliente"
                  >
                    {checked ? <CheckSquare className="h-3.5 w-3.5 text-[#E31E24]" /> : <Square className="h-3.5 w-3.5" />}
                  </button>
                  <div className="w-10 h-10 rounded-xl bg-[#1A1A1A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {initials(player.first_name, player.last_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-xs font-bold text-[#1A1A1A] truncate">
                        {player.first_name} {player.last_name}
                      </p>
                      <span className="px-1.5 py-0.5 rounded-lg bg-purple-50 text-purple-600 text-[9px] font-bold border border-purple-100">
                        {t('players_level_badge', { n: player.elo_rating })}
                      </span>
                      <div className="flex items-center gap-1">
                        <PulseDot color={player.status === 'active' ? '#22C55E' : '#9CA3AF'} />
                        <span className="text-[9px] text-gray-400">
                          {player.status === 'active' ? t('players_filter_active') : player.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 shrink-0 text-gray-400" />
                        {player.phone?.trim() ? player.phone : <span className="text-amber-600/90">{t('players_no_phone')}</span>}
                      </span>
                      {player.username ? (
                        <span className="text-[#F18F34]">@{player.username}</span>
                      ) : null}
                      <span>{player.email ? player.email : t('players_no_email')}</span>
                    </div>
                    {clubId && typeof player.wallet_balance_cents === 'number' && (
                      <div className="sm:hidden mt-1 flex items-center gap-1.5 text-[10px]">
                        <Wallet className="w-3 h-3 shrink-0 text-gray-400" />
                        <span className="text-gray-400">{t('players_balance_label')}</span>
                        <span
                          className={`font-bold tabular-nums ${
                            player.wallet_balance_cents < 0 ? 'text-red-600' : 'text-[#1A1A1A]'
                          }`}
                        >
                          {formatBalanceCents(player.wallet_balance_cents, currency)}
                        </span>
                      </div>
                    )}
                  </div>
                  {clubId && typeof player.wallet_balance_cents === 'number' && (
                    <div className="hidden sm:flex flex-col items-end justify-center px-2 min-w-[6.5rem] flex-shrink-0 text-right border-l border-gray-50 pl-3 ml-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{t('players_balance_label')}</span>
                      <span
                        className={`text-xs font-bold tabular-nums ${
                          player.wallet_balance_cents < 0 ? 'text-red-600' : 'text-[#1A1A1A]'
                        }`}
                      >
                        {formatBalanceCents(player.wallet_balance_cents, currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => sendOneEmail(player)}
                      className="w-9 h-9 rounded-xl border border-gray-100 flex items-center justify-center hover:bg-gray-50"
                      title={t('crm_send_one')}
                    >
                      <Mail className="w-4 h-4 text-gray-400" />
                    </button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setSelectedPlayer(player)}
                      className="w-9 h-9 rounded-xl border border-gray-100 flex items-center justify-center hover:bg-gray-50"
                    >
                      <Eye className="w-4 h-4 text-gray-400" />
                    </motion.button>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      )}

      <AnimatePresence>
        {selectedPlayer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPlayer(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white rounded-t-3xl z-10 pt-3 border-b border-gray-50">
                <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />
                <div className="px-5 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#1A1A1A] flex items-center justify-center text-white font-bold">
                        {initials(selectedPlayer.first_name, selectedPlayer.last_name)}
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-[#1A1A1A]">
                          {formatPlayerLabel(selectedPlayer)}
                        </h2>
                        <p className="text-[10px] text-gray-400">
                          {t('players_member_since')} {formatDate(selectedPlayer.created_at)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPlayer(null)}
                      className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10px] text-gray-400">
                    {selectedPlayer.email ? (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {selectedPlayer.email}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400">{t('players_no_email')}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 shrink-0" />
                      {selectedPlayer.phone?.trim() ? (
                        selectedPlayer.phone
                      ) : (
                        <span className="text-amber-700">{t('players_no_phone')}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      {t('players_level_badge', { n: selectedPlayer.elo_rating })}
                    </span>
                    {clubId && typeof selectedPlayer.wallet_balance_cents === 'number' && (
                      <span className="flex items-center gap-1">
                        <Wallet className="w-3 h-3 shrink-0" />
                        {t('players_balance_label')}:{' '}
                        <span
                          className={
                            selectedPlayer.wallet_balance_cents < 0 ? 'text-red-600 font-semibold' : 'text-[#1A1A1A] font-semibold'
                          }
                        >
                          {formatBalanceCents(selectedPlayer.wallet_balance_cents, currency)}
                        </span>
                      </span>
                    )}
                  </div>
                  {clubId && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Contacto</p>
                      <div className="grid grid-cols-1 gap-2">
                        <input
                          type="text"
                          value={contactForm.username}
                          onChange={(e) =>
                            setContactForm((f) => ({
                              ...f,
                              username: e.target.value.replace(/\s/g, '').toLowerCase(),
                            }))
                          }
                          placeholder="usuario (opcional)"
                          className="w-full px-3 py-2 rounded-xl border border-gray-100 text-xs"
                        />
                        <input
                          type="tel"
                          value={contactForm.phone}
                          onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                          placeholder={t('phone')}
                          className="w-full px-3 py-2 rounded-xl border border-gray-100 text-xs"
                        />
                        <input
                          type="email"
                          value={contactForm.email}
                          onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                          placeholder={t('email_placeholder')}
                          className="w-full px-3 py-2 rounded-xl border border-gray-100 text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={contactSaving}
                        onClick={() => void handleSaveContact()}
                        className="w-full py-2.5 rounded-xl border border-gray-200 text-[#1A1A1A] text-xs font-bold disabled:opacity-50"
                      >
                        {contactSaving ? 'Guardando…' : 'Guardar contacto'}
                      </button>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Tipo de cliente y descuento</p>
                      <p className="text-[10px] text-gray-400 leading-snug">
                        Afecta al cálculo de tarifa con jugador indicado (segmento y % de descuento en el club).
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={segmentSlug}
                          onChange={(e) => setSegmentSlug(e.target.value)}
                          className="flex-1 min-w-[140px] rounded-xl border border-gray-100 px-3 py-2 text-xs font-medium text-[#1A1A1A]"
                        >
                          {SEGMENT_SLUGS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={segmentDiscount}
                            onChange={(e) => setSegmentDiscount(e.target.value)}
                            className="w-20 rounded-xl border border-gray-100 px-2 py-2 text-xs tabular-nums"
                          />
                          <span className="text-[10px] text-gray-400">%</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={segmentSaving}
                        onClick={() => void handleSaveSegment()}
                        className="w-full py-2.5 rounded-xl bg-[#1A1A1A] text-white text-xs font-bold disabled:opacity-50"
                      >
                        {segmentSaving ? 'Guardando…' : 'Guardar segmento'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {manualOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !manualSubmitting && setManualOpen(false)}
              className="fixed inset-0 bg-black/40 z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-xl z-50 p-5 mx-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[#1A1A1A]">{t('players_manual_title')}</h3>
                <button
                  type="button"
                  onClick={() => !manualSubmitting && setManualOpen(false)}
                  className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4">{t('players_manual_subtitle')}</p>
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">{t('registration_first_name')} *</label>
                  <input
                    type="text"
                    value={manualForm.first_name}
                    onChange={(e) => setManualForm((f) => ({ ...f, first_name: e.target.value }))}
                    placeholder={t('registration_first_name_placeholder')}
                    className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs focus:ring-2 focus:ring-[#E31E24]/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">{t('registration_last_name')} *</label>
                  <input
                    type="text"
                    value={manualForm.last_name}
                    onChange={(e) => setManualForm((f) => ({ ...f, last_name: e.target.value }))}
                    placeholder={t('registration_last_name_placeholder')}
                    className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs focus:ring-2 focus:ring-[#E31E24]/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">
                    Usuario <span className="font-normal text-gray-400">({t('players_optional')})</span>
                  </label>
                  <input
                    type="text"
                    value={manualForm.username}
                    onChange={(e) =>
                      setManualForm((f) => ({
                        ...f,
                        username: e.target.value.replace(/\s/g, '').toLowerCase(),
                      }))
                    }
                    placeholder="tu_usuario"
                    className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs focus:ring-2 focus:ring-[#E31E24]/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">{t('phone')} *</label>
                  <input
                    type="tel"
                    value={manualForm.phone}
                    onChange={(e) => setManualForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder={t('registration_phone_placeholder')}
                    className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs focus:ring-2 focus:ring-[#E31E24]/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">
                    {t('email_label')} <span className="font-normal text-gray-400">({t('players_optional')})</span>
                  </label>
                  <input
                    type="email"
                    value={manualForm.email}
                    onChange={(e) => setManualForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder={t('email_placeholder')}
                    className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs focus:ring-2 focus:ring-[#E31E24]/30"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setManualOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={manualSubmitting}
                    className="flex-1 py-2.5 rounded-xl bg-[#E31E24] text-white text-xs font-bold flex items-center justify-center gap-2"
                  >
                    {manualSubmitting ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('loading')}</>
                    ) : (
                      t('players_manual_submit')
                    )}
                  </button>
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
                  onClick={() => void submitEmail()}
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
