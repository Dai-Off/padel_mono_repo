import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Trash2, Trophy, Users, X } from 'lucide-react';
import { PageSpinner } from '../Layout/PageSpinner';
import { leaguesService, type LeagueDivision, type LeagueEntry, type LeagueMatch, type LeagueSeason } from '../../services/leagues';
import { playerService } from '../../services/player';
import type { Player } from '../../types/api';

type Props = {
  clubId: string | null;
  clubResolved: boolean;
};

function eloLabel(div: LeagueDivision, t: (k: string, o?: Record<string, unknown>) => string) {
  if (div.elo_min != null && div.elo_max != null) return t('leagues_elo_range', { min: div.elo_min, max: div.elo_max });
  if (div.elo_min != null) return `Elo ≥ ${div.elo_min}`;
  if (div.elo_max != null) return `Elo ≤ ${div.elo_max}`;
  return t('leagues_elo_no_limit');
}

function entryDisplayName(entry: LeagueEntry) {
  const p1 = entry.player1;
  const p2 = entry.player2;
  if (p1 && p2) return `${p1.first_name} ${p1.last_name} / ${p2.first_name} ${p2.last_name}`;
  if (p1) return `${p1.first_name} ${p1.last_name}`;
  return entry.name;
}

function entryElo(entry: LeagueEntry) {
  const e1 = entry.player1?.elo_rating ?? 0;
  const e2 = entry.player2?.elo_rating;
  if (e2 != null) return Math.round((e1 + e2) / 2);
  return Math.round(e1);
}

export function ClubLeaguesTab({ clubId, clubResolved }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [seasons, setSeasons] = useState<LeagueSeason[]>([]);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'individual' | 'pairs'>('individual');
  const [matches, setMatches] = useState<LeagueMatch[]>([]);
  const [tab, setTab] = useState<'divisions' | 'matches'>('divisions');

  const [addOpen, setAddOpen] = useState<{ divisionId: string } | null>(null);
  const [playerQ, setPlayerQ] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedP1, setSelectedP1] = useState<Player | null>(null);
  const [selectedP2, setSelectedP2] = useState<Player | null>(null);
  const searchTimerRef = useRef<number | null>(null);

  const [matchOpen, setMatchOpen] = useState(false);
  const [matchDivId, setMatchDivId] = useState('');
  const [matchEntryA, setMatchEntryA] = useState('');
  const [matchEntryB, setMatchEntryB] = useState('');
  const [matchRound, setMatchRound] = useState('1');

  const refresh = useCallback(async () => {
    if (!clubId) {
      setSeasons([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSeasons(await leaguesService.listSeasons(clubId));
    } catch {
      toast.error(t('leagues_load_error'));
    } finally {
      setLoading(false);
    }
  }, [clubId, t]);

  useEffect(() => {
    if (!clubResolved) return;
    void refresh();
  }, [clubId, clubResolved, refresh]);

  const activeSeason = useMemo(
    () => seasons.find((s) => !s.closed) ?? seasons[0] ?? null,
    [seasons]
  );

  useEffect(() => {
    if (!activeSeason) return;
    void leaguesService.listMatches(activeSeason.id).then(setMatches).catch(() => setMatches([]));
  }, [activeSeason?.id]);

  useEffect(() => {
    if (!addOpen) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = playerQ.trim();
    if (!q) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimerRef.current = window.setTimeout(async () => {
      try {
        const results = await playerService.getAll(q);
        setSearchResults(results);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [playerQ, addOpen]);

  const divisions = useMemo(
    () => (activeSeason?.league_divisions ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [activeSeason]
  );

  const handleAddEntry = async () => {
    if (!activeSeason || !addOpen || !selectedP1) return;
    const isPairs = activeSeason.mode === 'pairs';
    if (isPairs && !selectedP2) {
      toast.error('Selecciona al segundo jugador');
      return;
    }
    try {
      await leaguesService.addEntry(activeSeason.id, addOpen.divisionId, selectedP1.id, selectedP2?.id);
      toast.success(t('leagues_entry_added'));
      setAddOpen(null);
      setSelectedP1(null);
      setSelectedP2(null);
      setPlayerQ('');
      await refresh();
    } catch (err: any) {
      toast.error(err?.message ?? t('fetch_error'));
    }
  };

  const handleRemoveEntry = async (entryId: string) => {
    try {
      await leaguesService.removeEntry(entryId);
      toast.success(t('leagues_entry_removed'));
      await refresh();
    } catch {
      toast.error(t('fetch_error'));
    }
  };

  const handleCreateMatch = async () => {
    if (!activeSeason || !matchDivId || !matchEntryA || !matchEntryB) return;
    try {
      await leaguesService.createMatch(activeSeason.id, {
        division_id: matchDivId,
        entry_a_id: matchEntryA,
        entry_b_id: matchEntryB,
        round_number: Number(matchRound) || 1,
      });
      toast.success('Partido creado');
      setMatchOpen(false);
      setMatches(await leaguesService.listMatches(activeSeason.id));
    } catch (err: any) {
      toast.error(err?.message ?? t('fetch_error'));
    }
  };

  if (!clubResolved || loading) return <PageSpinner />;
  if (!clubId) return <div className="text-sm text-gray-500">{t('leagues_need_club')}</div>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-[#1A1A1A]">{t('leagues_title')}</h2>
        <p className="text-xs text-gray-500 mt-1">{t('leagues_intro')}</p>
      </div>

      {/* Create season */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700">{t('leagues_new_season')}</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('leagues_name_ph')}
            className="flex-1 min-w-[160px] h-10 rounded-xl border border-gray-200 px-3 text-sm"
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'individual' | 'pairs')}
            className="h-10 rounded-xl border border-gray-200 px-3 text-sm"
          >
            <option value="individual">{t('leagues_mode_individual')}</option>
            <option value="pairs">{t('leagues_mode_pairs')}</option>
          </select>
          <button
            type="button"
            className="px-4 h-10 rounded-xl bg-[#E31E24] text-white text-xs font-bold"
            onClick={async () => {
              if (!name.trim()) { toast.error(t('leagues_name_required')); return; }
              try {
                await leaguesService.createSeason(clubId, name.trim(), mode);
                setName('');
                toast.success(t('leagues_created'));
                await refresh();
              } catch {
                toast.error(t('fetch_error'));
              }
            }}
          >
            {t('leagues_create')}
          </button>
        </div>
        <p className="text-[11px] text-gray-500">{t('leagues_default_divisions_hint')}</p>
      </div>

      {activeSeason ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs font-bold text-[#1A1A1A]">
                {activeSeason.name} {activeSeason.closed ? `(${t('leagues_closed')})` : ''}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {activeSeason.mode === 'pairs' ? t('leagues_mode_pairs') : t('leagues_mode_individual')}
              </p>
            </div>
            <div className="flex gap-2">
              {!activeSeason.closed && (
                <button
                  type="button"
                  className="px-3 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-semibold"
                  onClick={async () => {
                    if (!window.confirm(t('leagues_apply_confirm'))) return;
                    try {
                      const result = await leaguesService.closeAndPromote(activeSeason.id);
                      toast.success(t('leagues_apply_ok', { n: result.moved }));
                      await refresh();
                    } catch {
                      toast.error(t('fetch_error'));
                    }
                  }}
                >
                  {t('leagues_apply_btn')}
                </button>
              )}
            </div>
          </div>

          {/* Tabs: divisions | matches */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab('divisions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === 'divisions' ? 'bg-[#1A1A1A] text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <Users className="w-3.5 h-3.5 inline mr-1" />
              {t('leagues_title')}
            </button>
            <button
              type="button"
              onClick={() => setTab('matches')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === 'matches' ? 'bg-[#1A1A1A] text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <Trophy className="w-3.5 h-3.5 inline mr-1" />
              {t('leagues_matches')}
            </button>
          </div>

          {tab === 'divisions' && divisions.map((div) => (
            <div key={div.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#1A1A1A]">{div.name}</p>
                  <p className="text-[10px] text-gray-500">{eloLabel(div, t)} · ↑{div.promote_count} / ↓{div.relegate_count}</p>
                </div>
                {!activeSeason.closed && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddOpen({ divisionId: div.id });
                      setSelectedP1(null);
                      setSelectedP2(null);
                      setPlayerQ('');
                      setSearchResults([]);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#E31E24] text-white text-[11px] font-semibold inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {activeSeason.mode === 'pairs' ? t('leagues_add_entry_pair') : t('leagues_add_entry')}
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {(div.league_teams ?? []).length ? (
                  div.league_teams!
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((entry, idx) => (
                      <div key={entry.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold text-gray-400 w-5 text-right">{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-[#1A1A1A] truncate">{entryDisplayName(entry)}</p>
                            <p className="text-[10px] text-gray-500">Elo {entryElo(entry)}</p>
                          </div>
                        </div>
                        {!activeSeason.closed && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEntry(entry.id)}
                            className="text-gray-400 hover:text-red-500 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                ) : (
                  <p className="text-xs text-gray-400 py-2">{t('leagues_no_entries')}</p>
                )}
              </div>
            </div>
          ))}

          {tab === 'matches' && (
            <div className="space-y-3">
              {!activeSeason.closed && (
                <button
                  type="button"
                  onClick={() => setMatchOpen(true)}
                  className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('leagues_new_match')}
                </button>
              )}
              {matches.length === 0 && (
                <p className="text-xs text-gray-400 py-4 text-center">No hay partidos programados.</p>
              )}
              {matches.map((m) => {
                const nameA = m.entry_a?.team_label ?? '?';
                const nameB = m.entry_b?.team_label ?? '?';
                return (
                  <div key={m.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#1A1A1A] truncate">
                        <span className="font-semibold">{nameA}</span>
                        {' '}{t('leagues_match_vs')}{' '}
                        <span className="font-semibold">{nameB}</span>
                      </p>
                      <p className="text-[10px] text-gray-500">
                        Jornada {m.round_number} · {m.status === 'played' ? t('leagues_match_played') : t('leagues_match_scheduled')}
                        {m.sets && m.sets.length > 0 && ` · ${m.sets.map((s) => `${s.games_a}-${s.games_b}`).join(', ')}`}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${m.status === 'played' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                      {m.status === 'played' ? t('leagues_match_played') : t('leagues_match_scheduled')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-500">{t('leagues_empty')}</div>
      )}

      {/* Add player/pair modal */}
      {addOpen && activeSeason && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-100 shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#1A1A1A]">
                {activeSeason.mode === 'pairs' ? t('leagues_add_entry_pair') : t('leagues_add_entry')}
              </p>
              <button type="button" onClick={() => setAddOpen(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={playerQ}
                onChange={(e) => setPlayerQ(e.target.value)}
                placeholder={t('leagues_search_player')}
                className="w-full h-10 rounded-xl border border-gray-200 pl-9 pr-3 text-sm"
              />
            </div>

            <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-100">
              {searching && <p className="text-xs text-gray-500 px-3 py-2">Buscando...</p>}
              {!searching && searchResults.length === 0 && playerQ.trim() && (
                <p className="text-xs text-gray-400 px-3 py-2">Sin resultados.</p>
              )}
              {searchResults.map((p) => {
                const isSelected = selectedP1?.id === p.id || selectedP2?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (activeSeason.mode === 'pairs' && selectedP1 && !selectedP2 && selectedP1.id !== p.id) {
                        setSelectedP2(p);
                      } else {
                        setSelectedP1(p);
                        setSelectedP2(null);
                      }
                    }}
                    className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 ${isSelected ? 'bg-red-50' : ''}`}
                  >
                    <p className="text-xs font-semibold text-[#1A1A1A]">{p.first_name} {p.last_name}</p>
                    <p className="text-[11px] text-gray-500">
                      Elo {Math.round(p.elo_rating)} · {p.phone ?? '—'}
                    </p>
                  </button>
                );
              })}
            </div>

            {selectedP1 && (
              <div className="rounded-xl border border-gray-200 p-2 space-y-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase">Seleccionados</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#1A1A1A]">{selectedP1.first_name} {selectedP1.last_name} (Elo {Math.round(selectedP1.elo_rating)})</span>
                  <button type="button" onClick={() => { setSelectedP1(null); setSelectedP2(null); }} className="text-gray-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {selectedP2 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#1A1A1A]">{selectedP2.first_name} {selectedP2.last_name} (Elo {Math.round(selectedP2.elo_rating)})</span>
                    <button type="button" onClick={() => setSelectedP2(null)} className="text-gray-400 hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(null)}
                className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddEntry}
                disabled={!selectedP1 || (activeSeason.mode === 'pairs' && !selectedP2)}
                className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold disabled:opacity-50"
              >
                Inscribir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create match modal */}
      {matchOpen && activeSeason && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-100 shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#1A1A1A]">{t('leagues_new_match')}</p>
              <button type="button" onClick={() => setMatchOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase">División</label>
              <select
                value={matchDivId}
                onChange={(e) => { setMatchDivId(e.target.value); setMatchEntryA(''); setMatchEntryB(''); }}
                className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm"
              >
                <option value="">Elige división</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {matchDivId && (() => {
              const divEntries = (divisions.find((d) => d.id === matchDivId)?.league_teams ?? [])
                .slice().sort((a, b) => a.sort_order - b.sort_order);
              return (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase">Jugador / Pareja A</label>
                      <select value={matchEntryA} onChange={(e) => setMatchEntryA(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm">
                        <option value="">—</option>
                        {divEntries.filter((e) => e.id !== matchEntryB).map((e) => (
                          <option key={e.id} value={e.id}>{entryDisplayName(e)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase">Jugador / Pareja B</label>
                      <select value={matchEntryB} onChange={(e) => setMatchEntryB(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm">
                        <option value="">—</option>
                        {divEntries.filter((e) => e.id !== matchEntryA).map((e) => (
                          <option key={e.id} value={e.id}>{entryDisplayName(e)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase">Jornada</label>
                    <input
                      type="number"
                      min={1}
                      value={matchRound}
                      onChange={(e) => setMatchRound(e.target.value)}
                      className="mt-1 w-24 h-10 rounded-xl border border-gray-200 px-3 text-sm"
                    />
                  </div>
                </>
              );
            })()}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMatchOpen(false)} className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateMatch}
                disabled={!matchDivId || !matchEntryA || !matchEntryB}
                className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold disabled:opacity-50"
              >
                Crear partido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
