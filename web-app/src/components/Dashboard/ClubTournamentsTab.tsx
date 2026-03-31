import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Award, Calendar, Clock3, Copy, DollarSign, Loader2, Plus, Shield, TrendingUp, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageSpinner } from '../Layout/PageSpinner';
import { tournamentsService, type TournamentChatMessage, type TournamentInscription, type TournamentListItem } from '../../services/tournaments';
import { courtService } from '../../services/court';
import type { Court } from '../../types/court';
import { clubClientService } from '../../services/clubClients';
import type { Player } from '../../types/api';

type Props = {
  clubId: string | null;
  clubResolved: boolean;
};

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
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
  );
}

function timeAgoLabel(invitedAt: string): string {
  const diffMs = Date.now() - new Date(invitedAt).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 60) return `Invitado hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Invitado hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Invitado hace ${days} d`;
}

export function ClubTournamentsTab({ clubId, clubResolved }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TournamentListItem[]>([]);
  const [selected, setSelected] = useState<TournamentListItem | null>(null);
  const [detail, setDetail] = useState<TournamentInscription[]>([]);
  const [tab, setTab] = useState<'general' | 'jugadores' | 'chat' | 'ajustes'>('general');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<TournamentChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [form, setForm] = useState({
    start_at: '',
    registration_closed_at: '',
    cancellation_notice_hours: '24',
    duration_min: '120',
    price_cents: '0',
    prize_total_cents: '0',
    max_players: '12',
    visibility: 'private',
    registration_mode: 'individual',
    invite_ttl_minutes: '1440',
    elo_min: '',
    elo_max: '',
    description: '',
  });
  const [settingsForm, setSettingsForm] = useState({
    start_at: '',
    duration_min: '120',
    price_cents: '0',
    prize_total_cents: '0',
    visibility: 'private',
    elo_min: '',
    elo_max: '',
    registration_closed_at: '',
  });
  const routeId = location.pathname.startsWith('/torneos/') ? location.pathname.split('/')[2] : null;
  const isDetailRoute = Boolean(routeId);

  const refreshList = async (selectId?: string) => {
    if (!clubId) return;
    const list = await tournamentsService.list(clubId);
    setItems(list);
    if (selectId) {
      const target = list.find((x) => x.id === selectId) ?? null;
      setSelected(target);
    }
  };

  const refreshDetail = async (id: string) => {
    const res = await tournamentsService.detail(id);
    setDetail(res.inscriptions ?? []);
    setSelected(res.tournament);
  };

  useEffect(() => {
    if (!clubResolved) return;
    if (!clubId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const list = await tournamentsService.list(clubId);
        setItems(list);
      } catch (e) {
        toast.error((e as Error).message || 'No se pudo cargar torneos');
      } finally {
        setLoading(false);
      }
    })();
  }, [clubResolved, clubId]);

  useEffect(() => {
    if (!routeId || !items.length) return;
    const found = items.find((x) => x.id === routeId) ?? null;
    if (found) setSelected(found);
  }, [routeId, items]);

  useEffect(() => {
    if (!clubId) return;
    void (async () => {
      try {
        const list = await courtService.getAll(clubId);
        setCourts(list ?? []);
      } catch {
        setCourts([]);
      }
    })();
  }, [clubId]);

  useEffect(() => {
    if (!selected?.id) return;
    void refreshDetail(selected.id);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    setSettingsForm({
      start_at: selected.start_at ? new Date(selected.start_at).toISOString().slice(0, 16) : '',
      duration_min: String(selected.duration_min ?? 120),
      price_cents: String(selected.price_cents ?? 0),
      prize_total_cents: String(selected.prize_total_cents ?? 0),
      visibility: String(selected.visibility ?? 'private'),
      elo_min: selected.elo_min != null ? String(selected.elo_min) : '',
      elo_max: selected.elo_max != null ? String(selected.elo_max) : '',
      registration_closed_at: selected.registration_closed_at ? new Date(selected.registration_closed_at).toISOString().slice(0, 16) : '',
    });
  }, [selected?.id]);

  useEffect(() => {
    if (!addParticipantOpen || !clubId) return;
    const q = playerSearch.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearchingPlayers(true);
    const tmr = window.setTimeout(async () => {
      try {
        const list = await clubClientService.list(clubId, q);
        setSearchResults(list.slice(0, 8));
      } catch {
        setSearchResults([]);
      } finally {
        setSearchingPlayers(false);
      }
    }, 250);
    return () => window.clearTimeout(tmr);
  }, [addParticipantOpen, playerSearch, clubId]);

  useEffect(() => {
    if (tab !== 'chat' || !selected?.id) return;
    setChatLoading(true);
    void (async () => {
      try {
        const list = await tournamentsService.listChat(selected.id);
        setChatMessages(list);
      } catch {
        setChatMessages([]);
      } finally {
        setChatLoading(false);
      }
    })();
  }, [tab, selected?.id]);

  const playersOrdered = useMemo(() => {
    return [...detail].sort((a, b) => {
      const pa = a.status === 'confirmed' ? 0 : 1;
      const pb = b.status === 'confirmed' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.invited_at).getTime() - new Date(b.invited_at).getTime();
    });
  }, [detail]);

  const stats = useMemo(() => {
    const total = items.length;
    const inProgress = items.filter((x) => x.status === 'open').length;
    const totalTeams = items.reduce((acc, x) => acc + Math.max(0, Math.floor((x.max_players ?? 0) / 2)), 0);
    const totalPrizes = items.reduce((acc, x) => acc + Math.max(0, Number(x.price_cents ?? 0)), 0);
    const totalPrizesEur = totalPrizes / 100;
    const totalPrizesLabel =
      totalPrizesEur >= 1000
        ? `€${(totalPrizesEur / 1000).toFixed(1)}K`
        : `€${Math.round(totalPrizesEur)}`;
    return { total, inProgress, totalTeams, totalPrizesLabel };
  }, [items]);

  if (!clubResolved || loading) return <PageSpinner />;
  if (!clubId) return <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-5 text-sm text-amber-900">No hay club asociado.</div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">Gestión de Torneos y Eventos</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">Administra torneos, inscripciones, cupos y estados en tiempo real.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          Crear torneo
        </button>
      </div>

      {!isDetailRoute && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Torneos Totales" value={String(stats.total)} icon={<Award className="w-4 h-4" />} color="#5B8DEE" />
          <StatCard label="En Curso" value={String(stats.inProgress)} icon={<TrendingUp className="w-4 h-4" />} color="#22C55E" />
          <StatCard label="Equipos Totales" value={String(stats.totalTeams)} icon={<Users className="w-4 h-4" />} color="#8B5CF6" />
          <StatCard label="Premios Totales" value={stats.totalPrizesLabel} icon={<Award className="w-4 h-4" />} color="#F59E0B" />
        </div>
      )}

      {!isDetailRoute && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {items.map((row) => {
              const confirmed = row.confirmed_count ?? 0;
              const pending = row.pending_count ?? 0;
              const statusLabel = row.status === 'open' ? 'Próximo' : row.status === 'closed' ? 'Cerrado' : 'Finalizado';
              const statusClass =
                row.status === 'open'
                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                  : row.status === 'closed'
                    ? 'bg-green-50 text-green-700 border-green-100'
                    : 'bg-gray-100 text-gray-600 border-gray-200';
              return (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => {
                    setSelected(row);
                    navigate(`/torneos/${row.id}`);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1A1A1A] truncate">{row.description || 'Torneo sin descripción'}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(row.start_at).toLocaleDateString()}</span>
                        <span className="inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> {new Date(row.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {confirmed + pending}/{row.max_players}</span>
                        <span className="inline-flex items-center gap-1"><Award className="w-3.5 h-3.5" /> €{(((row.prize_total_cents ?? 0)) / 100).toFixed(0)}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] px-2.5 py-1 rounded-full border font-semibold ${statusClass}`}>{statusLabel}</span>
                  </div>
                </button>
              );
            })}
            {items.length === 0 && (
              <div className="py-10 text-center text-xs text-gray-400">No hay torneos creados todavía.</div>
            )}
          </div>
        </div>
      )}

      {isDetailRoute && selected && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/torneos')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a torneos
            </button>
            <p className="text-xs text-gray-500">{new Date(selected.start_at).toLocaleString()}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-[#1A1A1A]">Detalle de torneo</p>
                <p className="text-xs text-gray-500">{selected.description || 'Sin descripción'}</p>
              </div>
              <div className="flex items-center gap-2">
                {(['general', 'jugadores', 'chat', 'ajustes'] as const).map((x) => (
                  <button key={x} onClick={() => setTab(x)} className={`px-3 py-1.5 text-[11px] rounded-lg capitalize font-semibold ${tab === x ? 'bg-[#E31E24] text-white' : 'bg-gray-100 text-gray-700'}`}>{x}</button>
                ))}
              </div>
            </div>

            {tab === 'general' && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase">Estado</p>
                    <p className="text-xs font-semibold">{selected.status === 'open' ? 'Abierto' : selected.status === 'closed' ? 'Cerrado' : 'Cancelado'}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase">Cupos</p>
                    <p className="text-xs font-semibold">{(selected.confirmed_count ?? 0) + (selected.pending_count ?? 0)}/{selected.max_players}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase">Duración</p>
                    <p className="text-xs font-semibold">{selected.duration_min} min</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase">Premio total</p>
                    <p className="text-xs font-semibold">€{((selected.prize_total_cents ?? 0) / 100).toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const txt = `Torneo ${new Date(selected.start_at).toLocaleString()} - ${selected.confirmed_count ?? 0}/${selected.max_players}`;
                      void navigator.clipboard.writeText(txt);
                      toast.success('Detalles copiados');
                    }}
                    className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"
                  >
                    <Copy className="w-3.5 h-3.5 inline mr-1" />
                    Copiar detalles
                  </button>
                </div>
              </div>
            )}

            {tab === 'jugadores' && (
              <div className="p-5 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAddParticipantOpen(true)}
                    className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold"
                  >
                    Añadir participante
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!selected) return;
                      await tournamentsService.joinOwner(selected.id);
                      toast.success('Te uniste al torneo');
                      await refreshDetail(selected.id);
                      await refreshList(selected.id);
                    }}
                    className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold text-gray-700"
                  >
                    Participar como organizador
                  </button>
                </div>
                {playersOrdered.map((ins) => {
                  const over24h = ins.status === 'pending' && (Date.now() - new Date(ins.invited_at).getTime() > 24 * 60 * 60 * 1000);
                  return (
                    <div key={ins.id} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-[#1A1A1A]">{ins.players_1 ? `${ins.players_1.first_name} ${ins.players_1.last_name}` : ins.invite_email_1 || 'Invitado'}</span>
                        <span className={ins.status === 'confirmed' ? 'text-green-700' : 'text-amber-700'}>{ins.status === 'confirmed' ? 'confirmado' : 'pendiente'}</span>
                      </div>
                      {ins.invite_email_2 && (
                        <p className="text-[11px] text-gray-500 mt-1">{ins.players_2 ? `${ins.players_2.first_name} ${ins.players_2.last_name}` : ins.invite_email_2}</p>
                      )}
                      {ins.status === 'pending' && (
                        <p className={`text-[11px] mt-1 ${over24h ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{timeAgoLabel(ins.invited_at)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'chat' && (
              <div className="p-5 space-y-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 max-h-72 overflow-y-auto space-y-2">
                  {chatLoading && <p className="text-xs text-gray-500">Cargando chat...</p>}
                  {!chatLoading && chatMessages.length === 0 && <p className="text-xs text-gray-500">Aún no hay mensajes.</p>}
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#1A1A1A]">{msg.author_name}</p>
                        <p className="text-[10px] text-gray-400">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <p className="text-xs text-gray-700 mt-1">{msg.message}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={sendingChat}
                    onClick={async () => {
                      if (!selected || !chatDraft.trim()) return;
                      setSendingChat(true);
                      try {
                        await tournamentsService.sendChat(selected.id, chatDraft.trim());
                        setChatDraft('');
                        const list = await tournamentsService.listChat(selected.id);
                        setChatMessages(list);
                      } finally {
                        setSendingChat(false);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold disabled:opacity-70 inline-flex items-center gap-1.5"
                  >
                    {sendingChat && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {sendingChat ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </div>
            )}

            {tab === 'ajustes' && (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input type="datetime-local" value={settingsForm.start_at} onChange={(e) => setSettingsForm((p) => ({ ...p, start_at: e.target.value }))} className="rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  <input value={settingsForm.duration_min} onChange={(e) => setSettingsForm((p) => ({ ...p, duration_min: e.target.value }))} placeholder="Duración (min)" className="rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  <input value={settingsForm.price_cents} onChange={(e) => setSettingsForm((p) => ({ ...p, price_cents: e.target.value }))} placeholder="Precio (céntimos)" className="rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  <input value={settingsForm.prize_total_cents} onChange={(e) => setSettingsForm((p) => ({ ...p, prize_total_cents: e.target.value }))} placeholder="Premio total (céntimos)" className="rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  <input value={settingsForm.elo_min} onChange={(e) => setSettingsForm((p) => ({ ...p, elo_min: e.target.value }))} placeholder="Elo mínimo" className="rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  <input value={settingsForm.elo_max} onChange={(e) => setSettingsForm((p) => ({ ...p, elo_max: e.target.value }))} placeholder="Elo máximo" className="rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  <select value={settingsForm.visibility} onChange={(e) => setSettingsForm((p) => ({ ...p, visibility: e.target.value }))} className="rounded-xl border border-gray-200 px-3 py-2 text-xs">
                    <option value="private">Privado</option>
                    <option value="public">Público</option>
                  </select>
                  <input type="datetime-local" value={settingsForm.registration_closed_at} onChange={(e) => setSettingsForm((p) => ({ ...p, registration_closed_at: e.target.value }))} className="rounded-xl border border-gray-200 px-3 py-2 text-xs md:col-span-2" />
                </div>
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={async () => {
                    if (!selected) return;
                    setSavingSettings(true);
                    try {
                      await tournamentsService.update(selected.id, {
                        start_at: settingsForm.start_at ? new Date(settingsForm.start_at).toISOString() : selected.start_at,
                        duration_min: Number(settingsForm.duration_min),
                        price_cents: Number(settingsForm.price_cents),
                        prize_total_cents: Number(settingsForm.prize_total_cents),
                        elo_min: settingsForm.elo_min ? Number(settingsForm.elo_min) : null,
                        elo_max: settingsForm.elo_max ? Number(settingsForm.elo_max) : null,
                        visibility: settingsForm.visibility === 'public' ? 'public' : 'private',
                        registration_closed_at: settingsForm.registration_closed_at ? new Date(settingsForm.registration_closed_at).toISOString() : null,
                      });
                      toast.success('Ajustes guardados');
                      await refreshList(selected.id);
                      await refreshDetail(selected.id);
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold disabled:opacity-70"
                >
                  {savingSettings ? 'Guardando...' : 'Guardar ajustes'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!selected) return;
                    await tournamentsService.cancel(selected.id, 'Cancelado por organizador');
                    toast.success('Torneo cancelado');
                    await refreshList(selected.id);
                    await refreshDetail(selected.id);
                  }}
                  className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"
                >
                  Cancelar torneo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/40 p-3 md:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-gradient-to-b from-[#FFF7F7] to-white rounded-3xl border border-red-100 shadow-2xl overflow-hidden my-3 md:my-0 max-h-[92vh] flex flex-col">
            <div className="px-6 py-5 border-b border-red-100 bg-gradient-to-r from-[#FFE8EA] to-white">
              <p className="text-base font-black text-[#1A1A1A]">Crear torneo</p>
              <p className="text-xs text-gray-600 mt-1">Configura horarios, cupos, Elo y canchas con un formato visual más claro.</p>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Inicio</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <input
                      type="datetime-local"
                      value={form.start_at}
                      onChange={(e) => setForm((p) => ({ ...p, start_at: e.target.value }))}
                      className="w-full text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Cierre de inscripción</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <input
                      type="datetime-local"
                      value={form.registration_closed_at}
                      onChange={(e) => setForm((p) => ({ ...p, registration_closed_at: e.target.value }))}
                      className="w-full text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">El torneo se cierra por cupo completo o por esta fecha/hora.</p>
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Política de cancelación</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gray-400" />
                    <input
                      value={form.cancellation_notice_hours}
                      onChange={(e) => setForm((p) => ({ ...p, cancellation_notice_hours: e.target.value }))}
                      placeholder="24"
                      className="w-16 text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5 text-center font-semibold"
                    />
                    <span className="text-xs px-2 py-1 rounded-md border border-red-100 bg-red-50 text-red-700">hs antes del inicio</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Ejemplo: 24 hs antes del partido se puede cancelar la inscripción.</p>
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Duración (min)</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Clock3 className="w-4 h-4 text-gray-400" />
                    <input
                      value={form.duration_min}
                      onChange={(e) => setForm((p) => ({ ...p, duration_min: e.target.value }))}
                      placeholder="120"
                      className="w-24 text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5 text-center font-semibold"
                    />
                    <span className="text-xs px-2 py-1 rounded-md border border-red-100 bg-red-50 text-red-700">min</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Precio (céntimos)</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    <input
                      value={form.price_cents}
                      onChange={(e) => setForm((p) => ({ ...p, price_cents: e.target.value }))}
                      placeholder="0"
                      className="w-28 text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5 text-center font-semibold"
                    />
                    <span className="text-xs px-2 py-1 rounded-md border border-red-100 bg-red-50 text-red-700">céntimos</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Premio total (céntimos)</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Award className="w-4 h-4 text-gray-400" />
                    <input
                      value={form.prize_total_cents}
                      onChange={(e) => setForm((p) => ({ ...p, prize_total_cents: e.target.value }))}
                      placeholder="0"
                      className="w-28 text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5 text-center font-semibold"
                    />
                    <span className="text-xs px-2 py-1 rounded-md border border-red-100 bg-red-50 text-red-700">céntimos</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Máximo jugadores</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <input
                      value={form.max_players}
                      onChange={(e) => setForm((p) => ({ ...p, max_players: e.target.value }))}
                      placeholder="12"
                      className="w-20 text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5 text-center font-semibold"
                    />
                    <span className="text-xs px-2 py-1 rounded-md border border-red-100 bg-red-50 text-red-700">jug.</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Elo mínimo</label>
                  <input
                    value={form.elo_min}
                    onChange={(e) => setForm((p) => ({ ...p, elo_min: e.target.value }))}
                    placeholder="Opcional (ej: 1.0)"
                    className="mt-1.5 w-full text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5"
                  />
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Elo máximo</label>
                  <input
                    value={form.elo_max}
                    onChange={(e) => setForm((p) => ({ ...p, elo_max: e.target.value }))}
                    placeholder="Opcional (ej: 3.0)"
                    className="mt-1.5 w-full text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5"
                  />
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Modo inscripción (elige uno)</label>
                  <select
                    value={form.registration_mode}
                    onChange={(e) => setForm((p) => ({ ...p, registration_mode: e.target.value }))}
                    className="mt-1.5 w-full text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5"
                  >
                    <option value="individual">Individual</option>
                    <option value="pair">Parejas</option>
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">Puedes configurar el torneo para inscripción individual o por parejas.</p>
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Visibilidad del torneo</label>
                  <select
                    value={form.visibility}
                    onChange={(e) => setForm((p) => ({ ...p, visibility: e.target.value }))}
                    className="mt-1.5 w-full text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5"
                  >
                    <option value="private">Privado (solo invitación/enlace)</option>
                    <option value="public">Público (cualquiera puede ver y unirse)</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-red-100 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tiempo de reserva de cupo (min)</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gray-400" />
                    <input
                      value={form.invite_ttl_minutes}
                      onChange={(e) => setForm((p) => ({ ...p, invite_ttl_minutes: e.target.value }))}
                      placeholder="1440"
                      className="w-24 text-sm outline-none rounded-lg border border-red-200 bg-red-50/50 px-2 py-1.5 text-center font-semibold"
                    />
                    <span className="text-xs px-2 py-1 rounded-md border border-red-100 bg-red-50 text-red-700">min</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Si el invitado no acepta en este tiempo, el cupo se libera automáticamente.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-red-100 bg-white p-3">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe formato, premio, reglas..."
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-2xl border border-red-100 bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Canchas</p>
                  <p className="text-[11px] text-gray-500">{selectedCourtIds.length} seleccionada(s)</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {courts.map((court) => (
                    <button
                      type="button"
                      key={court.id}
                      onClick={() =>
                        setSelectedCourtIds((prev) =>
                          prev.includes(court.id) ? prev.filter((x) => x !== court.id) : [...prev, court.id]
                        )
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs border transition ${
                        selectedCourtIds.includes(court.id)
                          ? 'bg-[#E31E24] text-white border-[#E31E24]'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {court.name}
                    </button>
                  ))}
                </div>
                {courts.length === 0 && <p className="text-xs text-gray-400">No hay canchas disponibles para este club.</p>}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-red-100 bg-white flex justify-end gap-2 shrink-0">
              <button onClick={() => setCreateOpen(false)} className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold">Cerrar</button>
              <button
                disabled={saving}
                onClick={async () => {
                  if (!clubId) return;
                  if (!form.start_at) {
                    toast.error('Selecciona fecha y hora de inicio');
                    return;
                  }
                  if (!selectedCourtIds.length) {
                    toast.error('Selecciona al menos una cancha');
                    return;
                  }
                  const payload = {
                    club_id: clubId,
                    start_at: new Date(form.start_at).toISOString(),
                    registration_closed_at: form.registration_closed_at ? new Date(form.registration_closed_at).toISOString() : null,
                    cancellation_cutoff_at: (() => {
                      const h = Number(form.cancellation_notice_hours);
                      if (!Number.isFinite(h) || h < 0) return null;
                      const startMs = new Date(form.start_at).getTime();
                      return new Date(startMs - h * 60 * 60 * 1000).toISOString();
                    })(),
                    duration_min: Number(form.duration_min),
                    price_cents: Number(form.price_cents),
                    max_players: Number(form.max_players),
                    registration_mode: form.registration_mode,
                    visibility: form.visibility === 'public' ? 'public' : 'private',
                    invite_ttl_minutes: Number(form.invite_ttl_minutes),
                    prize_total_cents: Number(form.prize_total_cents),
                    elo_min: form.elo_min ? Number(form.elo_min) : null,
                    elo_max: form.elo_max ? Number(form.elo_max) : null,
                    description: form.description || null,
                    court_ids: selectedCourtIds,
                  };
                  setSaving(true);
                  try {
                    const creatingToast = toast.loading('Guardando torneo...');
                    const created = await tournamentsService.create(payload);
                    setItems((prev) => {
                      const next = [{ ...created, confirmed_count: 0, pending_count: 0 }, ...prev.filter((x) => x.id !== created.id)];
                      return next;
                    });
                    setSelected({ ...created, confirmed_count: 0, pending_count: 0 });
                    setCreateOpen(false);
                    setSelectedCourtIds([]);
                    setForm({
                      start_at: '',
                      registration_closed_at: '',
                      cancellation_notice_hours: '24',
                      duration_min: '120',
                      price_cents: '0',
                    prize_total_cents: '0',
                      max_players: '12',
                      registration_mode: 'individual',
                    visibility: 'private',
                      invite_ttl_minutes: '1440',
                      elo_min: '',
                      elo_max: '',
                      description: '',
                    });
                    navigate(`/torneos/${created.id}`);
                    toast.success('Torneo creado correctamente', { id: creatingToast });
                    await refreshDetail(created.id);
                  } catch (e) {
                    toast.error((e as Error).message || 'No se pudo crear el torneo');
                  } finally {
                    setSaving(false);
                  }
                }}
                className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold shadow-[0_8px_24px_rgba(227,30,36,0.25)] disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addParticipantOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-100 shadow-xl p-4 space-y-3">
            <p className="text-sm font-bold text-[#1A1A1A]">Añadir participante</p>
            <p className="text-xs text-gray-500">Busca un jugador del club. Si no existe, invita como guest por email.</p>

            <input
              value={playerSearch}
              onChange={(e) => {
                setPlayerSearch(e.target.value);
                setSelectedPlayer(null);
              }}
              placeholder="Buscar jugador por nombre o email"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
            />
            <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-100">
              {searchingPlayers && <p className="text-xs text-gray-500 px-3 py-2">Buscando...</p>}
              {!searchingPlayers && searchResults.length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-2">Sin resultados.</p>
              )}
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlayer(p);
                    setGuestEmail(p.email ?? '');
                  }}
                  className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 ${selectedPlayer?.id === p.id ? 'bg-red-50' : ''}`}
                >
                  <p className="text-xs font-semibold text-[#1A1A1A]">{p.first_name} {p.last_name}</p>
                  <p className="text-[11px] text-gray-500">{p.email ?? 'Sin email'}</p>
                </button>
              ))}
            </div>

            <div>
              <label className="text-[11px] text-gray-500">Email invitación (guest o jugador)</label>
              <input
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="invitado@correo.com"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddParticipantOpen(false);
                  setPlayerSearch('');
                  setSearchResults([]);
                  setSelectedPlayer(null);
                  setGuestEmail('');
                  setLastInviteLink('');
                }}
                className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const email = guestEmail.trim().toLowerCase();
                  if (!email) {
                    toast.error('Indica un email para invitar');
                    return;
                  }
                  const res = await tournamentsService.invite(selected.id, [{ email_1: email }]);
                  const link = res.invite_urls?.[0] ?? '';
                  if (link) {
                    setLastInviteLink(link);
                    await navigator.clipboard.writeText(link);
                    toast.success('Invitación enviada. Link copiado.');
                  } else {
                    toast.success('Invitación enviada');
                  }
                  setPlayerSearch('');
                  setSearchResults([]);
                  setSelectedPlayer(null);
                  setGuestEmail('');
                  await refreshDetail(selected.id);
                  await refreshList(selected.id);
                }}
                className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold"
              >
                Invitar
              </button>
            </div>
            {lastInviteLink ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2">
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Link para compartir por WhatsApp</p>
                <div className="mt-1.5 flex gap-2">
                  <input value={lastInviteLink} readOnly className="w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs text-emerald-900" />
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(lastInviteLink);
                      toast.success('Link copiado');
                    }}
                    className="rounded-lg border border-emerald-300 bg-white px-2.5 text-xs font-semibold text-emerald-700"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </motion.div>
  );
}

