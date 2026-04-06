import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Users, TrendingUp, Search, Eye, Mail, Phone, Zap, Plus, Loader2,
} from 'lucide-react';
import { PageSpinner } from '../Layout/PageSpinner';
import { useTranslation } from 'react-i18next';
import { playerService } from '../../services/player';
import type { Player } from '../../types/api';
import { toast } from 'sonner';

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

export function ClubPlayersTab() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deleted'>('all');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualForm, setManualForm] = useState({ first_name: '', last_name: '', phone: '', email: '' });

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await playerService.getAll();
      setPlayers(list ?? []);
    } catch (e) {
      console.error(e);
      toast.error(t('players_fetch_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const filteredPlayers = players.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    const name = `${p.first_name} ${p.last_name}`.toLowerCase();
    const email = (p.email ?? '').toLowerCase();
    const phone = (p.phone ?? '').toLowerCase();
    const matchSearch = !q || name.includes(q) || email.includes(q) || phone.includes(q);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPlayers = players.length;
  const activePlayers = players.filter((p) => p.status === 'active').length;
  const withAccount = players.filter((p) => p.auth_user_id).length;

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      await playerService.createManual({
        first_name: first,
        last_name: last,
        phone,
        email: email || undefined,
      });
      toast.success(t('players_manual_success'));
      setManualOpen(false);
      setManualForm({ first_name: '', last_name: '', phone: '', email: '' });
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="flex gap-1.5 items-center">
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
              onClick={() => setManualOpen(true)}
              className="ml-2 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold bg-[#E31E24] text-white hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('players_manual_add')}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <PageSpinner />
      ) : (
        <div className="space-y-2">
          {filteredPlayers.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">{t('players_empty')}</div>
          ) : (
            filteredPlayers.map((player) => (
              <div
                key={player.id}
                className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5"
              >
                <div className="flex items-center gap-3">
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
                      <span>{player.email ? player.email : t('players_no_email')}</span>
                    </div>
                  </div>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setSelectedPlayer(player)}
                    className="w-9 h-9 rounded-xl border border-gray-100 flex items-center justify-center hover:bg-gray-50 flex-shrink-0"
                  >
                    <Eye className="w-4 h-4 text-gray-400" />
                  </motion.button>
                </div>
              </div>
            ))
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
                          {selectedPlayer.first_name} {selectedPlayer.last_name}
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
                  </div>
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
    </motion.div>
  );
}
