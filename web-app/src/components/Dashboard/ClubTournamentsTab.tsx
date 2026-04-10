import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowDownUp,
  Award,
  Calendar,
  Clock3,
  Copy,
  DollarSign,
  Inbox,
  Loader2,
  MessageCircle,
  MoreVertical,
  Plus,
  Search,
  Shield,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageSpinner } from '../Layout/PageSpinner';
import { ClubLeaguesTab } from '../Leagues/ClubLeaguesTab';
import {
  tournamentsService,
  type CompetitionMatch,
  type CompetitionPodiumRow,
  type CompetitionSet,
  type CompetitionView,
  type TournamentChatMessage,
  type TournamentInscription,
  type TournamentListItem,
  type TournamentPrize,
  type TournamentDivisionRow,
  type TournamentEntryRequest,
} from '../../services/tournaments';
import { HttpError } from '../../services/api';
import { courtService } from '../../services/court';
import type { Court } from '../../types/court';
import { clubClientService } from '../../services/clubClients';
import { playerService } from '../../services/player';
import type { Player } from '../../types/api';

type Props = {
  clubId: string | null;
  clubResolved: boolean;
};

type ManualTeamOption = { id: string; label: string };
type ManualRoundMatch = { id: string; a: string; b: string; courtId: string };
type BracketRound = { title: string; matches: Array<{ id: string; a: string; b: string }> };

function PlayerAvatarThumb({
  avatarUrl,
  firstName,
  lastName,
  sizeClass = 'h-8 w-8',
}: {
  avatarUrl?: string | null;
  firstName: string;
  lastName?: string;
  sizeClass?: string;
}) {
  const [broken, setBroken] = useState(false);
  const initials = `${(firstName || '?').slice(0, 1)}${(lastName || '').slice(0, 1)}`.toUpperCase();
  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`${sizeClass} shrink-0 rounded-full object-cover border border-gray-100 bg-gray-50`}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} shrink-0 rounded-full border border-gray-100 bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600`}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function formatPlayerElo(elo: number | null | undefined): string {
  if (elo == null || Number.isNaN(Number(elo))) return '—';
  return String(Math.round(Number(elo)));
}

/** API guarda `price_cents`; el formulario del club usa euros para evitar confusiones (25 ≠ 25 céntimos). */
function centsToEurosInput(cents: number): string {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n)) return '0';
  const eur = n / 100;
  if (eur === 0) return '0';
  return Number.isInteger(eur) ? String(eur) : eur.toFixed(2);
}

function eurosInputToCents(raw: string): number {
  const n = parseFloat(String(raw).replace(',', '.').trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

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

type PrizeFormRow = { localId: string; label: string; amountEuros: string };

function newPrizeRow(label = ''): PrizeFormRow {
  return { localId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, label, amountEuros: '' };
}

function prizesToFormRows(prizes: TournamentPrize[] | null | undefined): PrizeFormRow[] {
  const arr = Array.isArray(prizes) ? prizes : [];
  if (arr.length === 0) return [newPrizeRow('Campeón')];
  return arr.map((p) => {
    const row = newPrizeRow();
    const cents = Number(p.amount_cents ?? 0);
    const eur = cents / 100;
    return { ...row, label: p.label, amountEuros: Number.isInteger(eur) ? String(eur) : eur.toFixed(2) };
  });
}

function formRowsToPrizePayload(rows: PrizeFormRow[]): { label: string; amount_cents: number }[] {
  return rows
    .map((r) => ({
      label: r.label.trim(),
      amount_cents: Math.max(0, Math.round((parseFloat(String(r.amountEuros).replace(',', '.')) || 0) * 100)),
    }))
    .filter((x) => x.label.length > 0);
}

const HALF_HOUR_TIMES: string[] = [];
for (let h = 0; h < 24; h++) {
  HALF_HOUR_TIMES.push(`${String(h).padStart(2, '0')}:00`);
  HALF_HOUR_TIMES.push(`${String(h).padStart(2, '0')}:30`);
}

function calcDurationMin(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function tournamentGenderLabel(g: string | null | undefined): string {
  if (g === 'male') return 'Masculino';
  if (g === 'female') return 'Femenino';
  if (g === 'mixed') return 'Mixto';
  return 'Sin definir';
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

function isHalfHourLocalDateTime(value: string): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const mins = d.getMinutes();
  return mins === 0 || mins === 30;
}

function normalizeHalfHourLocalDateTime(value: string): string {
  if (!value) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const mins = d.getMinutes();
  const snappedMins = mins < 15 ? 0 : mins < 45 ? 30 : 0;
  if (mins >= 45) d.setHours(d.getHours() + 1);
  d.setMinutes(snappedMins, 0, 0);
  return d.toISOString().slice(0, 16);
}

function isValidDuration30(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 30 && n % 30 === 0;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function buildManualPreview(round1: ManualRoundMatch[]): BracketRound[] {
  const rounds: BracketRound[] = [
    { title: 'Ronda 1', matches: round1.map((m) => ({ id: m.id, a: m.a || 'TBD', b: m.b || 'TBD' })) },
  ];
  let prev = round1.length;
  let round = 2;
  while (prev > 1) {
    const nextCount = Math.ceil(prev / 2);
    rounds.push({
      title: `Ronda ${round}`,
      matches: Array.from({ length: nextCount }, (_, idx) => ({
        id: `r${round}-m${idx + 1}`,
        a: `Ganador R${round - 1}-${idx * 2 + 1}`,
        b: idx * 2 + 2 <= prev ? `Ganador R${round - 1}-${idx * 2 + 2}` : 'BYE',
      })),
    });
    prev = nextCount;
    round += 1;
  }
  if (rounds.length) rounds[rounds.length - 1].title = 'Final';
  return rounds;
}

function validatePairsForManualBracket(
  registrationMode: 'individual' | 'pair',
  inscriptions: TournamentInscription[]
): { ok: true } | { ok: false; message: string } {
  const confirmed = inscriptions.filter((i) => i.status === 'confirmed');
  if (registrationMode === 'pair') {
    if (confirmed.length === 0) {
      return { ok: false, message: 'No hay parejas confirmadas. Revisa invitaciones o confirma inscripciones en Jugadores.' };
    }
    const incomplete = confirmed.filter((i) => !(i.players_1 && i.players_2));
    if (incomplete.length > 0) {
      return {
        ok: false,
        message: `Hay ${incomplete.length} pareja(s) sin completar (falta el segundo jugador). Completa cada pareja antes de armar el cuadro manual.`,
      };
    }
    return { ok: true };
  }
  const withPlayer = confirmed.filter((i) => i.players_1);
  if (withPlayer.length < 2) {
    return { ok: false, message: 'Se necesitan al menos 2 jugadores confirmados para formar parejas y el cuadro.' };
  }
  if (withPlayer.length % 2 !== 0) {
    return {
      ok: false,
      message: `Modo individual: hay ${withPlayer.length} jugadores confirmados (número impar). Añade o quita un jugador para poder emparejarlos de a dos.`,
    };
  }
  return { ok: true };
}

function buildManualTeamOptionsFromDetail(
  registrationMode: 'individual' | 'pair',
  inscriptions: TournamentInscription[]
): ManualTeamOption[] {
  const confirmed = inscriptions.filter((i) => i.status === 'confirmed');
  if (registrationMode === 'pair') {
    return confirmed
      .filter((i) => i.players_1 && i.players_2)
      .map((i) => ({
        id: `pair:${i.id}`,
        label: `${i.players_1!.first_name} ${i.players_1!.last_name} / ${i.players_2!.first_name} ${i.players_2!.last_name}`,
      }));
  }
  const singles = [...confirmed]
    .filter((i) => i.players_1)
    .sort((a, b) => new Date(a.invited_at).getTime() - new Date(b.invited_at).getTime());
  const out: ManualTeamOption[] = [];
  for (let i = 0; i + 1 < singles.length; i += 2) {
    const p1 = singles[i].players_1!;
    const p2 = singles[i + 1].players_1!;
    out.push({
      id: `ind:${singles[i].id}:${singles[i + 1].id}`,
      label: `${p1.first_name} ${p1.last_name} / ${p2.first_name} ${p2.last_name}`,
    });
  }
  return out;
}

function assignPlayerToInscriptionSlot(
  prev: Record<string, string | undefined>,
  inscriptionId: string,
  playerId: string
): Record<string, string | undefined> {
  const next = { ...prev };
  for (const [iid, pid] of Object.entries(next)) {
    if (pid === playerId) delete next[iid];
  }
  next[inscriptionId] = playerId;
  return next;
}

function removePlayerFromSlot(
  prev: Record<string, string | undefined>,
  inscriptionId: string
): Record<string, string | undefined> {
  const next = { ...prev };
  delete next[inscriptionId];
  return next;
}

function ensureOddBestOf(n: number): number {
  const x = Math.max(1, Math.round(Number(n)));
  return x % 2 === 0 ? x + 1 : x;
}

function evalWinnerSideFromSets(sets: CompetitionSet[], bestOf: number): 'A' | 'B' | null {
  const bos = ensureOddBestOf(bestOf);
  let a = 0;
  let b = 0;
  for (const s of sets) {
    if (s.games_a > s.games_b) a += 1;
    else if (s.games_b > s.games_a) b += 1;
  }
  const toWin = Math.floor(bos / 2) + 1;
  if (a >= toWin && a > b) return 'A';
  if (b >= toWin && b > a) return 'B';
  return null;
}

function formatSetsForDisplay(sets: CompetitionSet[] | undefined): string {
  if (!sets?.length) return '';
  return sets.map((s) => `${s.games_a}-${s.games_b}`).join(' · ');
}

function MatchResultEditor({
  tournamentId,
  m,
  teamALabel,
  teamBLabel,
  bestOf,
  onSaved,
}: {
  tournamentId: string;
  m: CompetitionMatch;
  teamALabel: string;
  teamBLabel: string;
  bestOf: number;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const bos = ensureOddBestOf(bestOf);
  const toWinSets = Math.floor(bos / 2) + 1;
  const rowCount = Math.min(bos, 5);

  const [winner, setWinner] = useState<'a' | 'b' | ''>(() => {
    if (!m.result?.winner_team_id || !m.team_a_id || !m.team_b_id) return '';
    return m.result.winner_team_id === m.team_a_id ? 'a' : 'b';
  });

  const [rows, setRows] = useState<{ a: string; b: string }[]>(() => {
    if (m.result?.sets?.length) {
      const r = m.result.sets.map((s) => ({ a: String(s.games_a), b: String(s.games_b) }));
      while (r.length < rowCount) r.push({ a: '', b: '' });
      return r.slice(0, rowCount);
    }
    return Array.from({ length: rowCount }, () => ({ a: '', b: '' }));
  });

  const [saving, setSaving] = useState(false);

  const setsPreview: CompetitionSet[] = [];
  for (const r of rows) {
    if (r.a.trim() === '' && r.b.trim() === '') continue;
    const ga = Number(r.a);
    const gb = Number(r.b);
    if (!Number.isFinite(ga) || !Number.isFinite(gb)) continue;
    setsPreview.push({ games_a: ga, games_b: gb });
  }
  const derivedWinner = setsPreview.length ? evalWinnerSideFromSets(setsPreview, bos) : null;

  const canSave = Boolean(m.team_a_id && m.team_b_id && m.status !== 'bye');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    if (!winner) {
      toast.error(t('tournament_match_pick_winner'));
      return;
    }
    const sets: CompetitionSet[] = [];
    for (const r of rows) {
      if (r.a.trim() === '' && r.b.trim() === '') continue;
      const ga = Number(r.a);
      const gb = Number(r.b);
      if (!Number.isFinite(ga) || !Number.isFinite(gb)) {
        toast.error(t('tournament_match_invalid_games'));
        return;
      }
      sets.push({ games_a: ga, games_b: gb });
    }
    if (sets.length === 0) {
      toast.error(t('tournament_match_need_sets'));
      return;
    }
    const w = evalWinnerSideFromSets(sets, bos);
    if (!w) {
      toast.error(t('tournament_match_sets_no_decision', { need: toWinSets }));
      return;
    }
    if ((w === 'A' && winner !== 'a') || (w === 'B' && winner !== 'b')) {
      toast.error(t('tournament_match_winner_mismatch'));
      return;
    }
    setSaving(true);
    try {
      await tournamentsService.saveMatchResult(tournamentId, m.id, {
        sets,
        override: m.status === 'finished',
      });
      toast.success(t('tournament_match_saved'));
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || t('tournament_match_save_error'));
    } finally {
      setSaving(false);
    }
  }

  const finished = m.status === 'finished' && Boolean(m.result?.sets?.length);

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-100 p-3 space-y-3 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-gray-600">
            {t('tournament_match_round', { r: m.round_number, n: m.match_number })}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold text-[#1A1A1A]">
            <span className="rounded-lg bg-gray-50 px-2 py-1 max-w-[160px] truncate" title={teamALabel}>
              {teamALabel}
            </span>
            <span className="text-gray-400 font-normal">{t('tournament_match_vs')}</span>
            <span className="rounded-lg bg-gray-50 px-2 py-1 max-w-[160px] truncate" title={teamBLabel}>
              {teamBLabel}
            </span>
          </div>
        </div>
        {finished && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md shrink-0">
            {t('tournament_match_finished')}
          </span>
        )}
      </div>

      {m.result?.sets?.length ? (
        <p className="text-xs text-gray-700">
          <span className="font-semibold text-emerald-800">{t('tournament_match_score')}</span>{' '}
          {formatSetsForDisplay(m.result.sets)}
          {m.result.winner_team_id && m.team_a_id && m.team_b_id && (
            <span className="text-gray-600">
              {' '}
              — {t('tournament_match_winner_label')}{' '}
              <span className="font-semibold">
                {m.result.winner_team_id === m.team_a_id ? teamALabel : teamBLabel}
              </span>
            </span>
          )}
        </p>
      ) : null}

      {!canSave ? (
        <p className="text-[11px] text-amber-700">{t('tournament_match_wait_teams')}</p>
      ) : (
        <>
          <p className="text-[11px] text-gray-600">{t('tournament_match_best_of', { n: bos })}</p>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[#1A1A1A]">{t('tournament_match_who_wins')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWinner('a')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition ${
                  winner === 'a' ? 'border-[#E31E24] bg-red-50 text-[#E31E24]' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {teamALabel}
              </button>
              <button
                type="button"
                onClick={() => setWinner('b')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition ${
                  winner === 'b' ? 'border-[#E31E24] bg-red-50 text-[#E31E24]' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {teamBLabel}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[#1A1A1A]">{t('tournament_match_sets_games')}</p>
            {rows.map((row, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] w-14 text-gray-500">{t('tournament_match_set_n', { n: idx + 1 })}</span>
                <input
                  inputMode="numeric"
                  value={row.a}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, a: e.target.value } : r)))
                  }
                  placeholder="0"
                  className="w-14 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-center"
                />
                <span className="text-gray-400">—</span>
                <input
                  inputMode="numeric"
                  value={row.b}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, b: e.target.value } : r)))
                  }
                  placeholder="0"
                  className="w-14 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-center"
                />
              </div>
            ))}
          </div>
          {derivedWinner && (
            <p className="text-[11px] text-gray-600">
              {t('tournament_match_derived')}{' '}
              <span className="font-semibold text-[#1A1A1A]">
                {derivedWinner === 'A' ? teamALabel : teamBLabel}
              </span>
              {winner && (derivedWinner === 'A' ? 'a' : 'b') !== winner && (
                <span className="text-amber-700"> — {t('tournament_match_differs_from_pick')}</span>
              )}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-[#E31E24] text-white text-xs font-semibold disabled:opacity-60"
          >
            {saving ? t('tournament_match_saving') : t('tournament_match_save')}
          </button>
        </>
      )}
    </form>
  );
}

export function ClubTournamentsTab({ clubId, clubResolved }: Props) {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TournamentListItem[]>([]);
  const [selected, setSelected] = useState<TournamentListItem | null>(null);
  const [detail, setDetail] = useState<TournamentInscription[]>([]);
  const [divisionsDetail, setDivisionsDetail] = useState<TournamentDivisionRow[]>([]);
  const [tab, setTab] = useState<'general' | 'jugadores' | 'chat' | 'competicion' | 'ajustes' | 'solicitudes'>('general');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [posterFileCreate, setPosterFileCreate] = useState<File | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const posterInputCreateRef = useRef<HTMLInputElement | null>(null);
  const [posterUploading, setPosterUploading] = useState(false);
  const posterInputSettingsRef = useRef<HTMLInputElement | null>(null);
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
  const [rowMenuOpenId, setRowMenuOpenId] = useState<string | null>(null);
  const [chatUnread, setChatUnread] = useState<Record<string, boolean>>({});
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());
  const [filterSort, setFilterSort] = useState<'newest' | 'oldest'>('newest');
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterHasPlayers, setFilterHasPlayers] = useState(false);
  const [filterEntryRequests, setFilterEntryRequests] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [entryRequests, setEntryRequests] = useState<TournamentEntryRequest[]>([]);
  const [entryRequestsLoading, setEntryRequestsLoading] = useState(false);
  const [entryApproveDivisionId, setEntryApproveDivisionId] = useState('');
  const [entryRejectOpen, setEntryRejectOpen] = useState(false);
  const [entryRejectTargetId, setEntryRejectTargetId] = useState<string | null>(null);
  const [entryRejectMessage, setEntryRejectMessage] = useState('');
  const [entryFullModalRequestId, setEntryFullModalRequestId] = useState<string | null>(null);
  const [entryActionLoadingId, setEntryActionLoadingId] = useState<string | null>(null);
  const [competitionLoading, setCompetitionLoading] = useState(false);
  const [competition, setCompetition] = useState<CompetitionView | null>(null);
  const [competitionFormat, setCompetitionFormat] = useState<'single_elim' | 'group_playoff' | 'round_robin'>('single_elim');
  const [bestOfSets, setBestOfSets] = useState('3');
  const [bracketSeedStrategy, setBracketSeedStrategy] = useState('registration_order');
  const [groupSize, setGroupSize] = useState('4');
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState('2');
  const [podiumDraftByPos, setPodiumDraftByPos] = useState<Record<number, string>>({});
  /** 1 = solo campeón; 2 o 3 = puestos extra opcionales en la UI. */
  const [podiumVisibleSlots, setPodiumVisibleSlots] = useState(1);
  const [generateModeOpen, setGenerateModeOpen] = useState(false);
  const [pairingGateMessage, setPairingGateMessage] = useState<string | null>(null);
  const [pairingManageOpen, setPairingManageOpen] = useState(false);
  const [singlesPairingDraft, setSinglesPairingDraft] = useState<Record<string, string | undefined>>({});
  const [singlesPairingInitial, setSinglesPairingInitial] = useState<Record<string, string>>({});
  const [singlesPairingOrder, setSinglesPairingOrder] = useState<string[]>([]);
  const [pairingPlayerLabels, setPairingPlayerLabels] = useState<Record<string, string>>({});
  const [pairingConfirmOpen, setPairingConfirmOpen] = useState(false);
  const [pairingSaving, setPairingSaving] = useState(false);
  const [assignPartnerOpen, setAssignPartnerOpen] = useState(false);
  const [assignInscriptionId, setAssignInscriptionId] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignResults, setAssignResults] = useState<Player[]>([]);
  const [assignSearching, setAssignSearching] = useState(false);
  const [assignSelectedPlayer, setAssignSelectedPlayer] = useState<Player | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRound1, setManualRound1] = useState<ManualRoundMatch[]>([]);
  const [manualGenerating, setManualGenerating] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createPrizeRows, setCreatePrizeRows] = useState<PrizeFormRow[]>(() => [newPrizeRow('Campeón')]);
  const [form, setForm] = useState({
    name: '',
    start_date: '',
    start_time: '21:30',
    end_time: '23:00',
    start_at: '',
    recurring_enabled: false,
    recurring_end_date: '',
    recurring_weekdays: [1] as number[],
    recurring_registration_close_hours: '12',
    registration_closed_at: '',
    reg_close_unit: 'days' as 'days' | 'hours',
    reg_close_value: '0',
    cancellation_notice_hours: '24',
    cancel_unit: 'days' as 'days' | 'hours',
    cancel_value: '1',
    duration_min: '120',
    price_euros: '0',
    max_players: '12',
    visibility: 'private',
    registration_mode: 'individual',
    gender: '',
    invite_ttl_minutes: '1440',
    elo_min: '',
    elo_max: '',
    description: '',
    normas: '',
  });
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    start_at: '',
    duration_min: '120',
    max_players: '12',
    price_euros: '0',
    prizeRows: [] as PrizeFormRow[],
    court_ids: [] as string[],
    visibility: 'private',
    gender: '',
    elo_min: '',
    elo_max: '',
    registration_closed_at: '',
    normas: '',
    poster_url: '',
  });
  const routeId = location.pathname.startsWith('/torneos/') ? location.pathname.split('/')[2] : null;
  const isDetailRoute = Boolean(routeId);
  const rootTabParam = searchParams.get('tab');
  const topTab: 'torneos' | 'ligas' = !isDetailRoute && rootTabParam === 'ligas' ? 'ligas' : 'torneos';
  const lang = i18n.resolvedLanguage?.startsWith('zh') ? 'zh' : i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'es';
  const tx = {
    pageTitle: lang === 'en' ? 'Tournament and Events Management' : lang === 'zh' ? '锦标赛与活动管理' : 'Gestión de Torneos y Eventos',
    pageSubtitle:
      lang === 'en'
        ? 'Manage tournaments, registrations, slots and statuses in real time.'
        : lang === 'zh'
          ? '实时管理锦标赛、报名、名额与状态。'
          : 'Administra torneos, inscripciones, cupos y estados en tiempo real.',
    createTournament: lang === 'en' ? 'Create tournament' : lang === 'zh' ? '创建锦标赛' : 'Crear torneo',
    totalTournaments: lang === 'en' ? 'Total Tournaments' : lang === 'zh' ? '锦标赛总数' : 'Torneos Totales',
    inProgress: lang === 'en' ? 'In Progress' : lang === 'zh' ? '进行中' : 'En Curso',
    totalTeams: lang === 'en' ? 'Total Teams' : lang === 'zh' ? '队伍总数' : 'Equipos Totales',
    totalPrizes: lang === 'en' ? 'Total Prizes' : lang === 'zh' ? '总奖金' : 'Premios Totales',
    detailTitle: lang === 'en' ? 'Tournament detail' : lang === 'zh' ? '锦标赛详情' : 'Detalle de torneo',
    addParticipant: lang === 'en' ? 'Add participant' : lang === 'zh' ? '添加参赛者' : 'Añadir participante',
    saveConfig: lang === 'en' ? 'Save configuration' : lang === 'zh' ? '保存配置' : 'Guardar configuración',
    generateBrackets: lang === 'en' ? 'Generate brackets' : lang === 'zh' ? '生成对阵' : 'Generar cruces',
  };

  const detailFetchGenRef = useRef(0);
  const competitionFetchGenRef = useRef(0);

  const refreshList = useCallback(
    async (selectId?: string) => {
      if (!clubId) return;
      const list = await tournamentsService.list(clubId);
      setItems(list);
      if (selectId) {
        const target = list.find((x) => x.id === selectId) ?? null;
        setSelected((prev) => {
          if (!target || prev?.id !== selectId) return prev;
          return { ...prev, ...target };
        });
      }
    },
    [clubId]
  );

  const refreshDetail = useCallback(async (id: string) => {
    const gen = ++detailFetchGenRef.current;
    const res = await tournamentsService.detail(id);
    if (gen !== detailFetchGenRef.current) return;
    setDetail(res.inscriptions ?? []);
    setDivisionsDetail(res.divisions ?? []);
    setSelected((prev) => {
      if (prev?.id !== id) return prev;
      const merged = {
        ...res.tournament,
        confirmed_count: res.counts.confirmed,
        pending_count: res.counts.pending,
      };
      return { ...prev, ...merged };
    });
  }, []);

  const loadEntryRequests = useCallback(async (tournamentId: string) => {
    setEntryRequestsLoading(true);
    try {
      const list = await tournamentsService.listEntryRequests(tournamentId);
      setEntryRequests(list);
    } catch (e) {
      toast.error((e as Error).message || 'No se pudieron cargar las solicitudes');
      setEntryRequests([]);
    } finally {
      setEntryRequestsLoading(false);
    }
  }, []);

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
    setDetail([]);
    setDivisionsDetail([]);
    void refreshDetail(selected.id);
  }, [selected?.id, refreshDetail]);

  useEffect(() => {
    if (!isDetailRoute || !selected?.id || tab !== 'solicitudes') return;
    void loadEntryRequests(selected.id);
  }, [isDetailRoute, selected?.id, tab, loadEntryRequests]);

  const lastListPollAtRef = useRef(0);
  useEffect(() => {
    if (!isDetailRoute || !selected?.id) return;
    lastListPollAtRef.current = 0;
    const tournamentId = selected.id;
    const listPollMinMs = 45_000;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshDetail(tournamentId).catch(() => {});
      const now = Date.now();
      if (now - lastListPollAtRef.current >= listPollMinMs) {
        lastListPollAtRef.current = now;
        void refreshList(tournamentId).catch(() => {});
      }
    };
    tick();
    const timer = window.setInterval(tick, 12_000);
    return () => window.clearInterval(timer);
  }, [isDetailRoute, selected?.id, refreshDetail, refreshList]);

  useEffect(() => {
    if (!isDetailRoute || !selected?.id) return;
    const tournamentId = selected.id;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshDetail(tournamentId).catch(() => {});
      const now = Date.now();
      if (now - lastListPollAtRef.current >= 45_000) {
        lastListPollAtRef.current = now;
        void refreshList(tournamentId).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isDetailRoute, selected?.id, refreshDetail, refreshList]);

  useEffect(() => {
    if (createOpen) {
      setCreatePrizeRows([newPrizeRow('Campeón')]);
      setCreateStep(0);
    }
    else {
      setPosterFileCreate(null);
      setCreateStep(0);
      if (posterInputCreateRef.current) posterInputCreateRef.current.value = '';
    }
  }, [createOpen]);

  useEffect(() => {
    if (!posterFileCreate) {
      setPosterPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(posterFileCreate);
    setPosterPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [posterFileCreate]);

  useEffect(() => {
    if (!selected) return;
    setSettingsForm({
      name: String(selected.name ?? ''),
      start_at: selected.start_at ? new Date(selected.start_at).toISOString().slice(0, 16) : '',
      duration_min: String(selected.duration_min ?? 120),
      max_players: String(selected.max_players ?? 12),
      price_euros: centsToEurosInput(selected.price_cents ?? 0),
      prizeRows: prizesToFormRows(selected.prizes),
      court_ids: Array.isArray(selected.tournament_courts) ? selected.tournament_courts.map((x) => String(x.court_id)) : [],
      visibility: String(selected.visibility ?? 'private'),
      gender:
        selected.gender === 'male' || selected.gender === 'female' || selected.gender === 'mixed'
          ? selected.gender
          : '',
      elo_min: selected.elo_min != null ? String(selected.elo_min) : '',
      elo_max: selected.elo_max != null ? String(selected.elo_max) : '',
      registration_closed_at: selected.registration_closed_at ? new Date(selected.registration_closed_at).toISOString().slice(0, 16) : '',
      normas: String(selected.normas ?? ''),
      poster_url: String(selected.poster_url ?? ''),
    });
  }, [selected?.id]);

  useEffect(() => {
    if (!addParticipantOpen || !clubId) return;
    const q = playerSearch.trim();
    if (!q) {
      setSearchResults([]);
      setSearchingPlayers(false);
      return;
    }
    let cancelled = false;
    setSearchingPlayers(true);
    const tmr = window.setTimeout(async () => {
      try {
        const clubList = await clubClientService.list(clubId, q);
        if (cancelled) return;
        if (clubList.length > 0) {
          setSearchResults(clubList.slice(0, 8));
          return;
        }

        const globalList = await playerService.getAll(q);
        if (cancelled) return;
        setSearchResults(globalList.slice(0, 8));
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchingPlayers(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(tmr);
    };
  }, [addParticipantOpen, playerSearch, clubId]);

  useEffect(() => {
    if (tab !== 'chat' || !selected?.id) return;
    const chatTournamentId = selected.id;
    let cancelled = false;
    setChatLoading(true);
    void (async () => {
      try {
        const list = await tournamentsService.listChat(chatTournamentId);
        if (cancelled) return;
        setChatMessages(list);
      } catch {
        if (!cancelled) setChatMessages([]);
      } finally {
        if (!cancelled) setChatLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, selected?.id]);

  useEffect(() => {
    if (tab === 'chat' && selected?.id) {
      const key = `chat_read_${selected.id}`;
      localStorage.setItem(key, new Date().toISOString());
      setChatUnread((prev) => ({ ...prev, [selected.id]: false }));
    }
  }, [tab, selected?.id]);

  useEffect(() => {
    const active = items.filter((t) => t.status === 'open' || t.status === 'closed');
    if (!active.length) return;
    let cancelled = false;
    void (async () => {
      const unread: Record<string, boolean> = {};
      await Promise.allSettled(
        active.map(async (t) => {
          try {
            const msgs = await tournamentsService.listChat(t.id);
            if (cancelled) return;
            if (msgs.length > 0) {
              const lastMsg = msgs[msgs.length - 1];
              const lastRead = localStorage.getItem(`chat_read_${t.id}`);
              unread[t.id] = !lastRead || new Date(lastMsg.created_at) > new Date(lastRead);
            }
          } catch { /* ignore */ }
        })
      );
      if (!cancelled) setChatUnread((prev) => ({ ...prev, ...unread }));
    })();
    return () => { cancelled = true; };
  }, [items]);

  const reloadCompetitionView = useCallback(async (tournamentId: string) => {
    const gen = ++competitionFetchGenRef.current;
    setCompetitionLoading(true);
    try {
      const view = await tournamentsService.competitionAdminView(tournamentId);
      if (gen !== competitionFetchGenRef.current) return;
      setCompetition(view);
      if (view.tournament?.competition_format) setCompetitionFormat(view.tournament.competition_format);
      setBestOfSets(String(view.tournament?.match_rules?.best_of_sets ?? 3));
      setBracketSeedStrategy(String(view.tournament?.match_rules?.bracket_seed_strategy ?? 'registration_order'));
      setGroupSize(String((view.tournament?.standings_rules?.group_size as number | undefined) ?? 4));
      setQualifiersPerGroup(String((view.tournament?.standings_rules?.qualifiers_per_group as number | undefined) ?? 2));
      const maxFromPodium = (view.podium ?? []).reduce((m, r) => Math.max(m, r.position), 0);
      const nextSlots = Math.max(1, Math.min(3, maxFromPodium || 1));
      setPodiumVisibleSlots(nextSlots);
      const next: Record<number, string> = { 1: '', 2: '', 3: '' };
      for (const row of view.podium ?? []) {
        if (row.position >= 1 && row.position <= 3) next[row.position] = row.team_id;
      }
      setPodiumDraftByPos(next);
    } catch {
      if (gen !== competitionFetchGenRef.current) return;
      setCompetition(null);
    } finally {
      if (gen === competitionFetchGenRef.current) setCompetitionLoading(false);
    }
  }, []);

  /** Si ya había cuadro/partidos, los regenera desde inscripciones (p. ej. tras cambiar parejas). */
  const regenerateFixtureIfExists = useCallback(async (tournamentId: string): Promise<boolean> => {
    let viewAfter: CompetitionView | null = null;
    try {
      viewAfter = await tournamentsService.competitionAdminView(tournamentId);
    } catch {
      return false;
    }
    const hadBracket =
      (viewAfter?.teams?.length ?? 0) > 0 || (viewAfter?.matches?.length ?? 0) > 0;
    if (!hadBracket) return false;
    await tournamentsService.generateCompetition(tournamentId);
    return true;
  }, []);

  useEffect(() => {
    if (tab !== 'competicion' || !selected?.id) return;
    setCompetition(null);
    void reloadCompetitionView(selected.id);
  }, [tab, selected?.id, reloadCompetitionView]);

  useEffect(() => {
    if (!assignPartnerOpen || !clubId) return;
    const q = assignSearch.trim();
    if (!q) {
      setAssignResults([]);
      setAssignSearching(false);
      return;
    }
    let cancelled = false;
    setAssignSearching(true);
    const tmr = window.setTimeout(async () => {
      try {
        const clubList = await clubClientService.list(clubId, q);
        if (cancelled) return;
        if (clubList.length > 0) {
          setAssignResults(clubList.slice(0, 8));
          return;
        }
        const globalList = await playerService.getAll(q);
        if (cancelled) return;
        setAssignResults(globalList.slice(0, 8));
      } catch {
        if (!cancelled) setAssignResults([]);
      } finally {
        if (!cancelled) setAssignSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(tmr);
    };
  }, [assignPartnerOpen, assignSearch, clubId]);

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

  const filteredItems = useMemo(() => {
    let result = [...items];
    if (filterStatus.size > 0) {
      result = result.filter((t) => filterStatus.has(t.status));
    }
    if (filterUnread) {
      result = result.filter((t) => chatUnread[t.id]);
    }
    if (filterHasPlayers) {
      result = result.filter((t) => (t.confirmed_count ?? 0) + (t.pending_count ?? 0) > 0);
    }
    if (filterEntryRequests) {
      result = result.filter((t) => (t.pending_entry_requests_count ?? 0) > 0);
    }
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      result = result.filter((t) => {
        const name = (t.name || t.description || '').toLowerCase();
        return name.includes(q);
      });
    }
    result.sort((a, b) => {
      const da = new Date(a.start_at).getTime();
      const db = new Date(b.start_at).getTime();
      return filterSort === 'newest' ? db - da : da - db;
    });
    return result;
  }, [items, filterStatus, filterSort, filterUnread, filterHasPlayers, filterEntryRequests, filterSearch, chatUnread]);

  const manualTeamOptions = useMemo<ManualTeamOption[]>(() => {
    if (competition && Array.isArray(competition.teams) && competition.teams.length > 0) {
      return competition.teams.map((t) => ({ id: t.id, label: t.name }));
    }
    if (!selected || !detail.length) return [];
    const mode = selected.registration_mode === 'pair' ? 'pair' : 'individual';
    return buildManualTeamOptionsFromDetail(mode, detail);
  }, [competition, selected, detail]);

  const manualPreview = useMemo<BracketRound[]>(() => {
    if (!manualRound1.length) return [];
    const nameById = new Map(manualTeamOptions.map((o) => [o.id, o.label]));
    const labeled = manualRound1.map((m) => ({
      ...m,
      a: m.a ? nameById.get(m.a) ?? m.a : '',
      b: m.b ? nameById.get(m.b) ?? m.b : '',
    }));
    return buildManualPreview(labeled);
  }, [manualRound1, manualTeamOptions]);

  const pairIncompleteRows = useMemo(() => {
    if (!selected || (selected.registration_mode !== 'pair' && selected.registration_mode !== 'both')) return [];
    return detail.filter(
      (i) => i.players_1 && !i.players_2 && (i.status === 'pending' || i.status === 'confirmed')
    );
  }, [detail, selected]);

  const openPairingModal = useCallback(() => {
    if (!selected) return;
    if (selected.registration_mode === 'individual' || selected.registration_mode === 'both') {
      const singles = [...detail]
        .filter((i) => i.status === 'confirmed' && i.players_1 && !i.players_2)
        .sort((a, b) => new Date(a.invited_at).getTime() - new Date(b.invited_at).getTime());
      if (singles.length === 0) {
        toast.error(t('tournament_pairing_no_players'));
        return;
      }
      const draft: Record<string, string> = {};
      const labels: Record<string, string> = {};
      for (const ins of singles) {
        if (ins.players_1) {
          draft[ins.id] = ins.players_1.id;
          labels[ins.players_1.id] = `${ins.players_1.first_name} ${ins.players_1.last_name}`.trim();
        }
      }
      setSinglesPairingDraft(draft);
      setSinglesPairingInitial({ ...draft });
      setSinglesPairingOrder(singles.map((s) => s.id));
      setPairingPlayerLabels(labels);
      setPairingConfirmOpen(false);
    } else {
      setSinglesPairingOrder([]);
      setSinglesPairingDraft({});
      setSinglesPairingInitial({});
      setPairingPlayerLabels({});
    }
    setPairingManageOpen(true);
  }, [selected, detail, t]);

  const singlesPairingPool = useMemo(() => {
    const initial = new Set(Object.values(singlesPairingInitial));
    const assigned = new Set(Object.values(singlesPairingDraft).filter(Boolean) as string[]);
    return [...initial].filter((pid) => !assigned.has(pid));
  }, [singlesPairingInitial, singlesPairingDraft]);

  const pairingIsDirty = useMemo(() => {
    const keys = new Set([...Object.keys(singlesPairingInitial), ...Object.keys(singlesPairingDraft)]);
    for (const k of keys) {
      if (singlesPairingInitial[k] !== singlesPairingDraft[k]) return true;
    }
    return false;
  }, [singlesPairingInitial, singlesPairingDraft]);

  const pairingSectionFlags = useMemo(() => {
    let hasDefined = false;
    let hasIncomplete = false;
    const nPairs = Math.ceil(singlesPairingOrder.length / 2);
    for (let pairIdx = 0; pairIdx < nPairs; pairIdx++) {
      const i = pairIdx * 2;
      const idA = singlesPairingOrder[i];
      const idB = singlesPairingOrder[i + 1];
      const pidA = singlesPairingDraft[idA];
      const pidB = idB ? singlesPairingDraft[idB] : undefined;
      const complete = idB != null ? Boolean(pidA && pidB) : Boolean(pidA);
      if (complete) hasDefined = true;
      else hasIncomplete = true;
    }
    return { hasDefined, hasIncomplete };
  }, [singlesPairingOrder, singlesPairingDraft]);

  const recommendedCourtsForSettings = useMemo(() => {
    const maxPlayers = Math.max(2, Number(settingsForm.max_players) || 0);
    return Math.max(1, Math.ceil(maxPlayers / 4));
  }, [settingsForm.max_players]);

  const competitionTypeMeta: Record<'single_elim' | 'group_playoff' | 'round_robin', { title: string; description: string; badges: string[] }> = {
    round_robin: {
      title: 'Americano',
      description:
        'Los jugadores rotan de pareja y de rivales en cada ronda, de modo que todos juegan con todos. Cada punto cuenta para una clasificación individual, lo que equilibra diversión y competición.',
      badges: ['Mezcla social', 'Individual y equipos'],
    },
    group_playoff: {
      title: 'Mexicano',
      description:
        'Después de cada ronda, los emparejamientos se ajustan según la clasificación del momento, de modo que los jugadores se enfrentan a otros con un nivel similar.',
      badges: ['Partidos nivelados', 'Individual y equipos'],
    },
    single_elim: {
      title: 'Pozo',
      description:
        'Las parejas ganadoras avanzan hacia la pista dominante, mientras que las demás rotan hacia la inferior. Es una dinámica intensa para alcanzar y defender el trono.',
      badges: ['Organización automática', 'Equipos fijos'],
    },
  };

  const isGroupPlayoff = competitionFormat === 'group_playoff';
  const competitionFormatHelp = competitionTypeMeta[competitionFormat].description;

  const validateCreateStep = useCallback((step: number): boolean => {
    if (step === 0) {
      if (!form.name.trim()) {
        toast.error('Completa el nombre del torneo');
        return false;
      }
      if (!form.start_date) {
        toast.error('Selecciona una fecha de inicio');
        return false;
      }
      if (calcDurationMin(form.start_time, form.end_time) < 30) {
        toast.error('La duración mínima es 30 minutos');
        return false;
      }
      if (form.recurring_enabled) {
        if (!form.recurring_end_date) {
          toast.error('Indica fecha fin de recurrencia');
          return false;
        }
        if (!form.recurring_weekdays.length) {
          toast.error('Selecciona al menos un día de la semana');
          return false;
        }
        if (form.recurring_end_date < form.start_date) {
          toast.error('La fecha fin no puede ser anterior al inicio');
          return false;
        }
      }
    }
    if (step === 1) {
      const maxPlayers = Number(form.max_players);
      if (!Number.isFinite(maxPlayers) || maxPlayers < 2) {
        toast.error('Indica un máximo de jugadores válido (mínimo 2)');
        return false;
      }
    }
    if (step === 2) {
      if (!selectedCourtIds.length) {
        toast.error('Selecciona al menos una cancha');
        return false;
      }
    }
    return true;
  }, [form, selectedCourtIds]);

  if (!clubResolved || loading) return <PageSpinner />;
  if (!clubId) return <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-5 text-sm text-amber-900">No hay club asociado.</div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">{tx.pageTitle}</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">{tx.pageSubtitle}</p>
        </div>
        {!isDetailRoute && topTab === 'torneos' && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            {tx.createTournament}
          </button>
        )}
      </div>

      {!isDetailRoute && (
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('tab');
              setSearchParams(next, { replace: true });
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${topTab === 'torneos' ? 'bg-[#1A1A1A] text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            {t('menu_torneos')}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set('tab', 'ligas');
              setSearchParams(next, { replace: true });
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${topTab === 'ligas' ? 'bg-[#1A1A1A] text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            {t('menu_ligas')}
          </button>
        </div>
      )}

      {!isDetailRoute && topTab === 'torneos' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label={tx.totalTournaments} value={String(stats.total)} icon={<Award className="w-4 h-4" />} color="#5B8DEE" />
          <StatCard label={tx.inProgress} value={String(stats.inProgress)} icon={<TrendingUp className="w-4 h-4" />} color="#22C55E" />
          <StatCard label={tx.totalTeams} value={String(stats.totalTeams)} icon={<Users className="w-4 h-4" />} color="#8B5CF6" />
          <StatCard label={tx.totalPrizes} value={stats.totalPrizesLabel} icon={<Award className="w-4 h-4" />} color="#F59E0B" />
        </div>
      )}

      {!isDetailRoute && topTab === 'torneos' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Buscar torneo…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#E31E24]"
              />
            </div>
            {(['open', 'closed', 'cancelled'] as const).map((s) => {
              const active = filterStatus.has(s);
              const label = s === 'open' ? 'Próximo' : s === 'closed' ? 'Cerrado' : 'Cancelado';
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilterStatus((prev) => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s); else next.add(s);
                    return next;
                  })}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${active ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {label}{active && ' ×'}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setFilterUnread((p) => !p)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1 ${filterUnread ? 'bg-[#E31E24] text-white border-[#E31E24]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              <MessageCircle className="w-3 h-3" /> No leídos{filterUnread && ' ×'}
            </button>
            <button
              type="button"
              onClick={() => setFilterHasPlayers((p) => !p)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1 ${filterHasPlayers ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              <Users className="w-3 h-3" /> Con jugadores{filterHasPlayers && ' ×'}
            </button>
            <button
              type="button"
              onClick={() => setFilterEntryRequests((p) => !p)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1 ${filterEntryRequests ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              <Inbox className="w-3 h-3" /> Solicitudes{filterEntryRequests && ' ×'}
            </button>
            <button
              type="button"
              onClick={() => setFilterSort((p) => (p === 'newest' ? 'oldest' : 'newest'))}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center gap-1"
            >
              <ArrowDownUp className="w-3 h-3" /> {filterSort === 'newest' ? 'Más recientes' : 'Más antiguos'}
            </button>
            {(filterStatus.size > 0 || filterUnread || filterHasPlayers || filterEntryRequests || filterSearch) && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus(new Set());
                  setFilterUnread(false);
                  setFilterHasPlayers(false);
                  setFilterEntryRequests(false);
                  setFilterSearch('');
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-gray-500 hover:text-gray-700"
              >
                Borrar todo
              </button>
            )}
          </div>
          {filteredItems.length !== items.length && (
            <p className="text-[11px] text-gray-400">{filteredItems.length} de {items.length} torneos</p>
          )}
        </div>
      )}

      {!isDetailRoute && topTab === 'torneos' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filteredItems.map((row) => {
              const confirmed = row.confirmed_count ?? 0;
              const pending = row.pending_count ?? 0;
              const statusLabel = row.status === 'open' ? 'Próximo' : row.status === 'closed' ? 'Cerrado' : 'Cancelado';
              const statusClass =
                row.status === 'open'
                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                  : row.status === 'closed'
                    ? 'bg-green-50 text-green-700 border-green-100'
                    : 'bg-red-50 text-red-600 border-red-100';
              const menuOpen = rowMenuOpenId === row.id;
              return (
                <div key={row.id} className="relative flex items-center px-4 py-3 hover:bg-gray-50 transition">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(row);
                      navigate(`/torneos/${row.id}`);
                    }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1A1A1A] truncate">{row.name || row.description || 'Torneo sin nombre'}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                          <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(row.start_at).toLocaleDateString()}</span>
                          <span className="inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> {new Date(row.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {confirmed + pending}/{row.max_players}</span>
                          {(row.pending_entry_requests_count ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-amber-800 font-semibold">
                              <Inbox className="w-3.5 h-3.5" />
                              {row.pending_entry_requests_count} solicitud{(row.pending_entry_requests_count ?? 0) === 1 ? '' : 'es'}
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium">
                            {tournamentGenderLabel(row.gender)}
                          </span>
                          {(row.price_cents ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1" title="Precio inscripción"><DollarSign className="w-3.5 h-3.5" /> Inscripción €{((row.price_cents ?? 0) / 100).toFixed(0)}</span>
                          )}
                          <span className="inline-flex items-center gap-1" title="Premios totales"><Award className="w-3.5 h-3.5" /> Premios €{(((row.prize_total_cents ?? 0)) / 100).toFixed(0)}</span>
                        </div>
                      </div>
                      <span className={`shrink-0 text-[10px] px-2.5 py-1 rounded-full border font-semibold ${statusClass}`}>{statusLabel}</span>
                    </div>
                  </button>

                  <div className="shrink-0 flex items-center gap-1 ml-2">
                    <button
                      type="button"
                      title="Chat del torneo"
                      onClick={() => {
                        setSelected(row);
                        navigate(`/torneos/${row.id}`);
                        setTimeout(() => setTab('chat'), 50);
                      }}
                      className="relative p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {chatUnread[row.id] && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#E31E24] rounded-full border-2 border-white" />
                      )}
                    </button>

                    <button
                      type="button"
                      title="Solicitudes de ingreso"
                      onClick={() => {
                        setSelected(row);
                        navigate(`/torneos/${row.id}`);
                        setTimeout(() => setTab('solicitudes'), 50);
                      }}
                      className="relative p-1.5 rounded-lg text-gray-400 hover:text-amber-800 hover:bg-amber-50"
                    >
                      <Inbox className="w-4 h-4" />
                      {(row.pending_entry_requests_count ?? 0) > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 bg-amber-600 text-white text-[9px] font-bold rounded-full border-2 border-white flex items-center justify-center">
                          {(row.pending_entry_requests_count ?? 0) > 9 ? '9+' : row.pending_entry_requests_count}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      title="Opciones"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRowMenuOpenId(menuOpen ? null : row.id);
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setRowMenuOpenId(null)} />
                      <div className="absolute right-4 top-10 z-40 w-48 bg-white rounded-xl border border-gray-200 shadow-lg py-1 text-xs">
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
                          onClick={async () => {
                            setRowMenuOpenId(null);
                            try {
                              const payload = {
                                club_id: row.club_id,
                                name: row.name ? `${row.name} (copia)` : null,
                                start_at: row.start_at,
                                duration_min: row.duration_min,
                                price_cents: row.price_cents ?? 0,
                                max_players: row.max_players,
                                registration_mode: row.registration_mode,
                                visibility: row.visibility ?? 'private',
                                gender: row.gender ?? null,
                                elo_min: row.elo_min ?? null,
                                elo_max: row.elo_max ?? null,
                                prizes: row.prizes ?? [],
                                normas: row.normas ?? null,
                              };
                              await tournamentsService.create(payload);
                              toast.success('Torneo copiado');
                              await refreshList();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Error al copiar');
                            }
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" /> Copiar torneo
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
                          onClick={() => {
                            setRowMenuOpenId(null);
                            const url = `${window.location.origin}/torneos/${row.id}`;
                            navigator.clipboard.writeText(url).then(() => toast.success('Enlace copiado'));
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" /> Copiar enlace
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
                          onClick={async () => {
                            setRowMenuOpenId(null);
                            try {
                              const detail = await tournamentsService.detail(row.id);
                              const inscriptions = detail.inscriptions ?? [];
                              const lines = ['Nombre,Email,Estado,Fecha inscripción'];
                              inscriptions.forEach((ins) => {
                                const p1 = ins.players_1;
                                const name1 = p1 ? `${p1.first_name ?? ''} ${p1.last_name ?? ''}`.trim() : ins.invite_email_1 ?? '';
                                const email1 = p1?.email ?? ins.invite_email_1 ?? '';
                                lines.push(`"${name1}","${email1}","${ins.status}","${ins.invited_at}"`);
                                const p2 = ins.players_2;
                                if (p2) {
                                  const name2 = `${p2.first_name ?? ''} ${p2.last_name ?? ''}`.trim();
                                  lines.push(`"${name2}","${p2.email ?? ''}","${ins.status}","${ins.invited_at}"`);
                                }
                              });
                              const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
                              const a = document.createElement('a');
                              a.href = URL.createObjectURL(blob);
                              a.download = `jugadores_${row.name || 'torneo'}.csv`;
                              a.click();
                              URL.revokeObjectURL(a.href);
                              toast.success('Exportación descargada');
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Error al exportar');
                            }
                          }}
                        >
                          <Users className="w-3.5 h-3.5" /> Exportar jugadores
                        </button>
                        <div className="border-t border-gray-100 my-1" />
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"
                          onClick={async () => {
                            setRowMenuOpenId(null);
                            if (!confirm('¿Cancelar este torneo? Esta acción no se puede deshacer.')) return;
                            try {
                              await tournamentsService.cancel(row.id, 'Cancelado por organizador');
                              toast.success('Torneo cancelado');
                              await refreshList();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Error al cancelar');
                            }
                          }}
                        >
                          <X className="w-3.5 h-3.5" /> Cancelar torneo
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {filteredItems.length === 0 && items.length > 0 && (
              <div className="py-10 text-center text-xs text-gray-400">No hay torneos que coincidan con los filtros.</div>
            )}
            {items.length === 0 && (
              <div className="py-10 text-center text-xs text-gray-400">No hay torneos creados todavía.</div>
            )}
          </div>
        </div>
      )}

      {!isDetailRoute && topTab === 'ligas' && (
        <ClubLeaguesTab clubId={clubId} clubResolved={clubResolved} />
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
              <div className="flex items-start gap-3 min-w-0">
                {selected.poster_url ? (
                  <img
                    src={selected.poster_url}
                    alt=""
                    className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover border border-gray-100 shrink-0"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-sm font-black text-[#1A1A1A]">{tx.detailTitle}</p>
                  <p className="text-xs text-gray-500">{selected.name || selected.description || 'Sin nombre'}</p>
                  {selected.level_mode === 'multi_division' ? (
                    <p className="text-[10px] text-amber-800 font-semibold mt-1">Multi-categoría</p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['general', 'General'],
                    ['jugadores', 'Jugadores'],
                    ['chat', 'Chat'],
                    ['solicitudes', 'Solicitudes'],
                    ['competicion', 'Competición'],
                    ['ajustes', 'Ajustes'],
                  ] as const
                ).map(([id, label]) => {
                  const pendingEr = selected.pending_entry_requests_count ?? 0;
                  const showErBadge = id === 'solicitudes' && pendingEr > 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={`relative px-3 py-1.5 text-[11px] rounded-lg font-semibold ${
                        tab === id ? 'bg-[#E31E24] text-white' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {label}
                      {showErBadge && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 bg-amber-500 text-white text-[9px] font-black rounded-full border border-white flex items-center justify-center">
                          {pendingEr > 9 ? '9+' : pendingEr}
                        </span>
                      )}
                    </button>
                  );
                })}
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
                    <p className="text-[10px] text-gray-500 uppercase">Categoría</p>
                    <p className="text-xs font-semibold">{tournamentGenderLabel(selected.gender)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 md:col-span-2">
                    <p className="text-[10px] text-gray-500 uppercase">Premios</p>
                    <p className="text-xs font-semibold">Total: €{((selected.prize_total_cents ?? 0) / 100).toFixed(2)}</p>
                    {Array.isArray(selected.prizes) && selected.prizes.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5 text-[11px] text-gray-600 list-disc list-inside">
                        {selected.prizes.map((p, i) => (
                          <li key={`${p.label}-${i}`}>
                            {p.label}: €{((p.amount_cents ?? 0) / 100).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-gray-500 mt-1">Bolsa única (sin desglose por puesto).</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 md:col-span-3">
                    <p className="text-[10px] text-gray-500 uppercase">Normas</p>
                    <p className="text-xs font-semibold whitespace-pre-wrap">{selected.normas || 'Sin normas cargadas'}</p>
                  </div>
                </div>
                {divisionsDetail.length > 0 && (
                  <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase mb-1">Categorías del torneo</p>
                    <ul className="text-xs text-gray-800 space-y-1">
                      {divisionsDetail.map((d) => (
                        <li key={d.id}>
                          <span className="font-semibold">{d.label}</span>{' '}
                          <span className="text-gray-500">
                            ({d.code})
                            {d.elo_min != null || d.elo_max != null
                              ? ` · Elo ${d.elo_min ?? '—'}–${d.elo_max ?? '—'}`
                              : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                {pairingGateMessage && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold text-amber-900">Completa las parejas para el cuadro</p>
                      <p className="text-[11px] text-amber-800 mt-1">{pairingGateMessage}</p>
                      <p className="text-[11px] text-amber-700/90 mt-2">
                        Modo{' '}
                        <span className="font-semibold">{selected.registration_mode === 'pair' ? 'parejas' : selected.registration_mode === 'both' ? 'ambos' : 'individual'}</span>
                        : en parejas deben estar los dos jugadores confirmados; en individual necesitas un número par de jugadores
                        (el sistema empareja en orden de inscripción).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPairingGateMessage(null)}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-[11px] font-semibold text-amber-900"
                    >
                      Cerrar aviso
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAddParticipantOpen(true)}
                    className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold"
                  >
                    {tx.addParticipant}
                  </button>
                  <button
                    type="button"
                    onClick={openPairingModal}
                    className="px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-800 text-xs font-semibold"
                  >
                    {t('tournament_pairing_manage')}
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
                  const isConfirmed = ins.status === 'confirmed';
                  return (
                    <div key={ins.id} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex justify-between items-start gap-2 text-xs">
                        <div className="flex items-start gap-2 min-w-0">
                          {ins.players_1 ? (
                            <PlayerAvatarThumb
                              avatarUrl={ins.players_1.avatar_url}
                              firstName={ins.players_1.first_name}
                              lastName={ins.players_1.last_name}
                            />
                          ) : (
                            <div className="h-8 w-8 shrink-0 rounded-full bg-gray-100 border border-gray-100" aria-hidden />
                          )}
                          <div className="pt-1 min-w-0">
                            <span className="font-semibold text-[#1A1A1A]">
                              {ins.players_1 ? `${ins.players_1.first_name} ${ins.players_1.last_name}` : ins.invite_email_1 || 'Invitado'}
                            </span>
                            {ins.players_1 ? (
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                {t('tournament_player_elo', { n: formatPlayerElo(ins.players_1.elo_rating) })}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                              isConfirmed
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}
                          >
                            {isConfirmed ? 'confirmado' : 'pendiente'}
                          </span>
                          {selected.level_mode === 'multi_division' && divisionsDetail.length > 0 ? (
                            <select
                              value={ins.division_id ?? ''}
                              onChange={async (e) => {
                                if (!selected) return;
                                const v = e.target.value;
                                const nextId = v === '' ? null : v;
                                try {
                                  await tournamentsService.setInscriptionDivision(selected.id, ins.id, nextId);
                                  setDetail((prev) =>
                                    prev.map((row) => (row.id === ins.id ? { ...row, division_id: nextId } : row))
                                  );
                                  toast.success('Categoría actualizada');
                                } catch (err) {
                                  toast.error((err as Error).message || 'No se pudo actualizar');
                                }
                              }}
                              className="text-[10px] rounded-lg border border-gray-200 px-1.5 py-1 max-w-[140px]"
                            >
                              <option value="">Sin categoría</option>
                              {divisionsDetail.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <button
                            type="button"
                            onClick={async () => {
                              if (!selected) return;
                              const ok = window.confirm('¿Quitar este participante del torneo? Esta acción libera su cupo.');
                              if (!ok) return;
                              const removedId = ins.id;
                              const removedStatus = ins.status;
                              const prevDetail = detail;
                              // Optimistic UI: se quita al instante sin esperar roundtrip.
                              setDetail((prev) => prev.filter((x) => x.id !== removedId));
                              setSelected((prev) => {
                                if (!prev) return prev;
                                const next = { ...prev };
                                if (removedStatus === 'confirmed') {
                                  next.confirmed_count = Math.max(0, Number(next.confirmed_count ?? 0) - 1);
                                } else if (removedStatus === 'pending') {
                                  next.pending_count = Math.max(0, Number(next.pending_count ?? 0) - 1);
                                }
                                return next;
                              });
                              try {
                                await tournamentsService.removeInscription(selected.id, removedId);
                                toast.success('Participante removido');
                                // Refetch para asegurar consistencia con backend.
                                await refreshDetail(selected.id);
                                await refreshList(selected.id);
                              } catch (e) {
                                // Revertir si falla.
                                setDetail(prevDetail);
                                toast.error((e as Error).message || 'No se pudo remover el participante');
                              }
                            }}
                            className="px-2 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold hover:bg-red-100"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                      {ins.invite_email_2 && (
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                          {ins.players_2 ? (
                            <PlayerAvatarThumb
                              sizeClass="h-6 w-6"
                              avatarUrl={ins.players_2.avatar_url}
                              firstName={ins.players_2.first_name}
                              lastName={ins.players_2.last_name}
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-700">
                              {ins.players_2 ? `${ins.players_2.first_name} ${ins.players_2.last_name}` : ins.invite_email_2}
                            </p>
                            {ins.players_2 ? (
                              <p className="text-[10px] text-gray-500">
                                {t('tournament_player_elo', { n: formatPlayerElo(ins.players_2.elo_rating) })}
                              </p>
                            ) : null}
                          </div>
                        </div>
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

            {tab === 'solicitudes' && (
              <div className="p-5 space-y-4">
                <p className="text-xs text-gray-600">
                  Los jugadores pueden pedir ingreso cuando no cumplen el Elo automático (u otras reglas). Aquí aceptas o rechazas; si al aceptar el torneo ya está lleno, podrás rechazar o dejar la solicitud en visto.
                </p>
                {selected.level_mode === 'multi_division' && divisionsDetail.length > 0 && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 space-y-1">
                    <p className="text-[11px] font-semibold text-amber-900">Categoría al aprobar</p>
                    <p className="text-[10px] text-amber-800">
                      Si el Elo del jugador no encaja en ninguna categoría, elige una manualmente antes de aprobar.
                    </p>
                    <select
                      value={entryApproveDivisionId}
                      onChange={(e) => setEntryApproveDivisionId(e.target.value)}
                      className="w-full max-w-md rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs"
                    >
                      <option value="">Automática según Elo del jugador</option>
                      {divisionsDetail.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {entryRequestsLoading && <p className="text-xs text-gray-500">Cargando solicitudes…</p>}
                {!entryRequestsLoading && entryRequests.length === 0 && (
                  <p className="text-xs text-gray-500">No hay solicitudes registradas.</p>
                )}
                {!entryRequestsLoading &&
                  entryRequests.map((er) => {
                    const p = er.request_player;
                    const name = p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : 'Jugador';
                    const isPending = er.status === 'pending';
                    return (
                      <div key={er.id} className="rounded-xl border border-gray-100 p-4 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#1A1A1A]">{name}</p>
                            {p ? (
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                Elo {formatPlayerElo(p.elo_rating)} · {p.email ?? 'sin email'}
                              </p>
                            ) : null}
                            <p className="text-[10px] text-gray-400 mt-1">{new Date(er.created_at).toLocaleString()}</p>
                          </div>
                          <span
                            className={`shrink-0 text-[10px] px-2 py-1 rounded-full font-bold uppercase ${
                              er.status === 'pending'
                                ? 'bg-amber-100 text-amber-900'
                                : er.status === 'approved'
                                  ? 'bg-green-100 text-green-800'
                                  : er.status === 'rejected'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {er.status === 'pending'
                              ? 'Pendiente'
                              : er.status === 'approved'
                                ? 'Aprobada'
                                : er.status === 'rejected'
                                  ? 'Rechazada'
                                  : 'En visto'}
                          </span>
                        </div>
                        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase">Mensaje</p>
                          <p className="text-xs text-gray-800 whitespace-pre-wrap mt-0.5">{er.message}</p>
                        </div>
                        {er.response_message ? (
                          <div className="rounded-lg bg-blue-50/80 border border-blue-100 px-3 py-2">
                            <p className="text-[10px] font-semibold text-blue-800 uppercase">Tu respuesta</p>
                            <p className="text-xs text-blue-900 whitespace-pre-wrap mt-0.5">{er.response_message}</p>
                          </div>
                        ) : null}
                        {isPending && selected && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              disabled={entryActionLoadingId === er.id}
                              onClick={async () => {
                                if (!selected) return;
                                const divPayload =
                                  selected.level_mode === 'multi_division' && entryApproveDivisionId
                                    ? { division_id: entryApproveDivisionId }
                                    : {};
                                setEntryActionLoadingId(er.id);
                                try {
                                  await tournamentsService.approveEntryRequest(selected.id, er.id, divPayload);
                                  toast.success('Solicitud aprobada; el jugador está inscrito');
                                  await loadEntryRequests(selected.id);
                                  await refreshDetail(selected.id);
                                  await refreshList(selected.id);
                                } catch (e) {
                                  if (e instanceof HttpError && e.status === 409 && e.code === 'tournament_full') {
                                    setEntryFullModalRequestId(er.id);
                                    toast.message('Torneo lleno', { description: e.message });
                                  } else {
                                    toast.error((e as Error).message || 'No se pudo aprobar');
                                  }
                                } finally {
                                  setEntryActionLoadingId(null);
                                }
                              }}
                              className="px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
                            >
                              {entryActionLoadingId === er.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Aprobar e inscribir
                            </button>
                            <button
                              type="button"
                              disabled={entryActionLoadingId === er.id}
                              onClick={() => {
                                setEntryRejectTargetId(er.id);
                                setEntryRejectMessage('');
                                setEntryRejectOpen(true);
                              }}
                              className="px-3 py-2 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold"
                            >
                              Rechazar
                            </button>
                            <button
                              type="button"
                              disabled={entryActionLoadingId === er.id}
                              onClick={async () => {
                                if (!selected) return;
                                setEntryActionLoadingId(er.id);
                                try {
                                  await tournamentsService.dismissEntryRequest(selected.id, er.id);
                                  toast.success('Solicitud dejada en visto');
                                  await loadEntryRequests(selected.id);
                                  await refreshList(selected.id);
                                } catch (err) {
                                  toast.error((err as Error).message || 'No se pudo actualizar');
                                } finally {
                                  setEntryActionLoadingId(null);
                                }
                              }}
                              className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold"
                            >
                              Dejar en visto
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {tab === 'competicion' && (
              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                  <p className="text-xs font-semibold text-[#1A1A1A]">Configuración competitiva</p>
                  <p className="text-[11px] font-semibold text-[#E31E24] mt-1">{competitionTypeMeta[competitionFormat].title}</p>
                  <p className="text-[11px] text-gray-600 mt-1">{competitionFormatHelp}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {competitionTypeMeta[competitionFormat].badges.map((badge) => (
                      <span key={badge} className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700">
                        {badge}
                      </span>
                    ))}
                  </div>
                  <div className={`grid grid-cols-1 ${isGroupPlayoff ? 'md:grid-cols-4' : 'md:grid-cols-2'} gap-2 mt-2`}>
                    <select value={competitionFormat} onChange={(e) => setCompetitionFormat(e.target.value as any)} className="rounded-xl border border-gray-200 px-3 py-2 text-xs">
                      <option value="round_robin">Americano</option>
                      <option value="group_playoff">Mexicano</option>
                      <option value="single_elim">Pozo</option>
                    </select>
                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <p className="text-[10px] uppercase text-gray-500 font-semibold">Sets</p>
                      <input
                        value={bestOfSets}
                        onChange={(e) => setBestOfSets(e.target.value)}
                        placeholder="Ej: 3"
                        className="mt-1 w-full text-xs outline-none"
                      />
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 md:col-span-2">
                      <p className="text-[10px] uppercase text-gray-500 font-semibold">Orden al generar cuadro</p>
                      <select
                        value={bracketSeedStrategy}
                        onChange={(e) => setBracketSeedStrategy(e.target.value)}
                        className="mt-1 w-full text-xs outline-none bg-transparent"
                      >
                        <option value="registration_order">Orden de inscripción</option>
                        <option value="random">Aleatorio</option>
                        <option value="elo_snake">Elo — cruces tipo bracket (potencia de 2)</option>
                        <option value="elo_top_vs_bottom">Elo — mejor vs peor (1ª ronda)</option>
                        <option value="elo_tier_mid">Elo — priorizar nivel medio</option>
                      </select>
                    </div>
                    {isGroupPlayoff && (
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <p className="text-[10px] uppercase text-gray-500 font-semibold">Tamaño grupo</p>
                        <input
                          value={groupSize}
                          onChange={(e) => setGroupSize(e.target.value)}
                          placeholder="Ej: 4"
                          className="mt-1 w-full text-xs outline-none"
                        />
                      </div>
                    )}
                    {isGroupPlayoff && (
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <p className="text-[10px] uppercase text-gray-500 font-semibold">Clasificados por grupo</p>
                        <input
                          value={qualifiersPerGroup}
                          onChange={(e) => setQualifiersPerGroup(e.target.value)}
                          placeholder="Ej: 2"
                          className="mt-1 w-full text-xs outline-none"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selected) return;
                        await tournamentsService.setupCompetition(selected.id, {
                          format: competitionFormat,
                          match_rules: {
                            best_of_sets: Number(bestOfSets) || 3,
                            allow_draws: false,
                            bracket_seed_strategy: bracketSeedStrategy,
                          },
                          standings_rules: { group_size: Number(groupSize) || 4, qualifiers_per_group: Number(qualifiersPerGroup) || 2 },
                        });
                        toast.success('Configuración guardada');
                      }}
                      className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold"
                    >
                      {tx.saveConfig}
                    </button>
                    <button
                      type="button"
                      disabled={false}
                      onClick={async () => {
                        setGenerateModeOpen(true);
                      }}
                      className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold"
                    >
                      {tx.generateBrackets}
                    </button>
                    <button
                      type="button"
                      onClick={openPairingModal}
                      className="px-3 py-2 rounded-xl bg-white border border-gray-300 text-gray-800 text-xs font-semibold"
                    >
                      {t('tournament_pairing_manage')}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-xs font-semibold text-[#1A1A1A] mb-2">{t('tournament_matches_results_title')}</p>
                  {competitionLoading && <p className="text-xs text-gray-500">{t('tournament_matches_loading')}</p>}
                  {!competitionLoading && (!competition?.matches || competition.matches.length === 0) && (
                    <p className="text-xs text-gray-500">{t('tournament_matches_empty')}</p>
                  )}
                  <div className="space-y-3">
                    {(competition?.matches ?? []).map((m) => {
                      const teamA = competition?.teams.find((t) => t.id === m.team_a_id)?.name ?? m.seed_label_a ?? 'TBD A';
                      const teamB = competition?.teams.find((t) => t.id === m.team_b_id)?.name ?? m.seed_label_b ?? 'TBD B';
                      const bestOf = Number(competition?.tournament?.match_rules?.best_of_sets ?? 3);
                      return (
                        <MatchResultEditor
                          key={`${m.id}-${m.result?.submitted_at ?? 'open'}`}
                          tournamentId={selected!.id}
                          m={m}
                          teamALabel={teamA}
                          teamBLabel={teamB}
                          bestOf={bestOf}
                          onSaved={() => void reloadCompetitionView(selected!.id)}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-xs font-semibold text-[#1A1A1A] mb-1">{t('tournament_podium_manual_title')}</p>
                  <p className="text-[11px] text-gray-500 mb-2">{t('tournament_podium_manual_hint')}</p>
                  <div className="flex flex-col gap-2">
                    {(() => {
                      const prizeList =
                        competition && Array.isArray(competition.tournament?.prizes) && competition.tournament.prizes.length > 0
                          ? competition.tournament.prizes
                          : Array.isArray(selected?.prizes) && selected.prizes.length > 0
                            ? selected.prizes
                            : null;
                      const placeholders = [
                        prizeList?.[0]?.label?.trim() || t('tournament_podium_placeholder_first'),
                        prizeList?.[1]?.label?.trim() || t('tournament_podium_placeholder_second'),
                        prizeList?.[2]?.label?.trim() || t('tournament_podium_placeholder_third'),
                      ];
                      return Array.from({ length: podiumVisibleSlots }, (_, i) => {
                        const pos = i + 1;
                        return (
                          <select
                            key={pos}
                            value={podiumDraftByPos[pos] ?? ''}
                            onChange={(e) =>
                              setPodiumDraftByPos((prev) => ({
                                ...prev,
                                [pos]: e.target.value,
                              }))
                            }
                            className="rounded-xl border border-gray-200 px-3 py-2 text-xs w-full md:max-w-md"
                          >
                            <option value="">{placeholders[i]}</option>
                            {(competition?.teams ?? []).map((tm) => (
                              <option key={`p${pos}-${tm.id}`} value={tm.id}>
                                {tm.name}
                              </option>
                            ))}
                          </select>
                        );
                      });
                    })()}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {podiumVisibleSlots < 2 && (
                      <button
                        type="button"
                        onClick={() => setPodiumVisibleSlots(2)}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-[#1A1A1A] hover:bg-gray-50"
                      >
                        {t('tournament_podium_add_second')}
                      </button>
                    )}
                    {podiumVisibleSlots === 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPodiumVisibleSlots(3);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-[#1A1A1A] hover:bg-gray-50"
                      >
                        {t('tournament_podium_add_third')}
                      </button>
                    )}
                    {podiumVisibleSlots === 3 && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPodiumDraftByPos((prev) => ({ ...prev, 3: '' }));
                            setPodiumVisibleSlots(2);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          {t('tournament_podium_remove_third')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPodiumDraftByPos((prev) => ({ ...prev, 2: '', 3: '' }));
                            setPodiumVisibleSlots(1);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          {t('tournament_podium_champion_only')}
                        </button>
                      </>
                    )}
                    {podiumVisibleSlots === 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPodiumDraftByPos((prev) => ({ ...prev, 2: '' }));
                          setPodiumVisibleSlots(1);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        {t('tournament_podium_remove_second')}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!selected) return;
                      const payload: CompetitionPodiumRow[] = [];
                      for (let pos = 1; pos <= podiumVisibleSlots; pos++) {
                        const tid = (podiumDraftByPos[pos] ?? '').trim();
                        if (tid) payload.push({ position: pos, team_id: tid });
                      }
                      try {
                        await tournamentsService.savePodium(selected.id, payload);
                        await reloadCompetitionView(selected.id);
                        toast.success(t('tournament_podium_saved'));
                      } catch (e) {
                        toast.error((e as Error).message || t('tournament_podium_save_error'));
                      }
                    }}
                    className="mt-3 px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold"
                  >
                    {t('tournament_podium_save')}
                  </button>
                </div>

                <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                  <p className="text-xs font-semibold text-[#1A1A1A]">{t('tournament_view_player_title')}</p>
                  <p className="text-[11px] text-gray-600 mt-1">{t('tournament_view_player_hint')}</p>
                  {!competition || (!competition.teams?.length && !(competition.matches ?? []).length) ? (
                    <p className="text-[11px] text-gray-500 mt-2">{t('tournament_view_player_empty')}</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">{t('tournament_view_player_teams')}</p>
                        <ul className="text-xs text-[#1A1A1A] space-y-1">
                          {(competition.teams ?? []).map((team) => (
                            <li key={team.id} className="flex justify-between gap-2 border-b border-gray-100 pb-1 last:border-0">
                              <span className="font-medium truncate">{team.name}</span>
                              <span className="text-[10px] text-gray-500 shrink-0">
                                {team.status === 'eliminated' ? t('tournament_view_eliminated') : t('tournament_view_active')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-gray-500 mb-1">{t('tournament_view_player_results')}</p>
                        <ul className="text-[11px] text-gray-700 space-y-1.5 max-h-44 overflow-y-auto">
                          {(competition.matches ?? []).map((m) => {
                            const ta = competition.teams.find((x) => x.id === m.team_a_id)?.name ?? m.seed_label_a ?? '—';
                            const tb = competition.teams.find((x) => x.id === m.team_b_id)?.name ?? m.seed_label_b ?? '—';
                            const score = formatSetsForDisplay(m.result?.sets);
                            const wname =
                              m.result?.winner_team_id && m.team_a_id && m.team_b_id
                                ? m.result.winner_team_id === m.team_a_id
                                  ? ta
                                  : tb
                                : null;
                            return (
                              <li key={m.id} className="border-b border-gray-100 pb-1 last:border-0">
                                {t('tournament_match_round', { r: m.round_number, n: m.match_number })}: {ta} {t('tournament_match_vs')} {tb}
                                {score ? <span className="text-emerald-800 font-medium"> · {score}</span> : null}
                                {wname ? (
                                  <span className="text-gray-600">
                                    {' '}
                                    — {t('tournament_match_winner_short')} {wname}
                                  </span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'ajustes' && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Nombre del torneo</label>
                    <input value={settingsForm.name} onChange={(e) => setSettingsForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej. Copa Primavera 2026" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Fecha y hora de inicio</label>
                    <input type="datetime-local" step={1800} value={settingsForm.start_at} onChange={(e) => setSettingsForm((p) => ({ ...p, start_at: normalizeHalfHourLocalDateTime(e.target.value) }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Duración (minutos)</label>
                    <input type="number" min={30} step={30} value={settingsForm.duration_min} onChange={(e) => setSettingsForm((p) => ({ ...p, duration_min: e.target.value }))} placeholder="120" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Precio inscripción (€)</label>
                    <input value={settingsForm.price_euros} onChange={(e) => setSettingsForm((p) => ({ ...p, price_euros: e.target.value }))} placeholder="Ej. 25 o 25,50" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  </div>
                  <div className="rounded-xl border border-gray-200 px-3 py-2 text-xs md:col-span-2 space-y-2">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">Premios por puesto (€)</p>
                    {settingsForm.prizeRows.map((row) => (
                      <div key={row.localId} className="flex flex-wrap gap-2 items-center">
                        <input
                          value={row.label}
                          onChange={(e) =>
                            setSettingsForm((p) => ({
                              ...p,
                              prizeRows: p.prizeRows.map((r) => (r.localId === row.localId ? { ...r, label: e.target.value } : r)),
                            }))
                          }
                          placeholder="Ej. Subcampeón"
                          className="flex-1 min-w-[120px] rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 font-medium">€</span>
                          <input
                            value={row.amountEuros}
                            onChange={(e) =>
                              setSettingsForm((p) => ({
                                ...p,
                                prizeRows: p.prizeRows.map((r) => (r.localId === row.localId ? { ...r, amountEuros: e.target.value } : r)),
                              }))
                            }
                            placeholder="150"
                            className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSettingsForm((p) => ({
                              ...p,
                              prizeRows: p.prizeRows.length > 1 ? p.prizeRows.filter((r) => r.localId !== row.localId) : p.prizeRows,
                            }))
                          }
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                          aria-label="Quitar premio"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSettingsForm((p) => ({ ...p, prizeRows: [...p.prizeRows, newPrizeRow('')] }))}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E31E24]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Añadir premio
                    </button>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Elo mínimo</label>
                    <input value={settingsForm.elo_min} onChange={(e) => setSettingsForm((p) => ({ ...p, elo_min: e.target.value }))} placeholder="Ej. 800" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Elo máximo</label>
                    <input value={settingsForm.elo_max} onChange={(e) => setSettingsForm((p) => ({ ...p, elo_max: e.target.value }))} placeholder="Ej. 1500" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Visibilidad</label>
                    <select value={settingsForm.visibility} onChange={(e) => setSettingsForm((p) => ({ ...p, visibility: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs">
                      <option value="private">Privado</option>
                      <option value="public">Público</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Género</label>
                    <select
                      value={settingsForm.gender}
                      onChange={(e) => setSettingsForm((p) => ({ ...p, gender: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
                    >
                      <option value="">Sin definir (cualquier género)</option>
                      <option value="mixed">Mixto</option>
                      <option value="male">Masculino</option>
                      <option value="female">Femenino</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Cierre de inscripciones</label>
                    <input type="datetime-local" step={1800} value={settingsForm.registration_closed_at} onChange={(e) => setSettingsForm((p) => ({ ...p, registration_closed_at: normalizeHalfHourLocalDateTime(e.target.value) }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Cupos máximos</label>
                    <input
                      type="number"
                      min={2}
                      value={settingsForm.max_players}
                      onChange={(e) => setSettingsForm((p) => ({ ...p, max_players: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="md:col-span-2 rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase block">Canchas habilitadas</label>
                      <span className="text-[10px] text-gray-500">
                        Recomendadas: {recommendedCourtsForSettings} · Seleccionadas: {settingsForm.court_ids.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {courts.map((court) => {
                        const active = settingsForm.court_ids.includes(court.id);
                        return (
                          <button
                            key={`settings-court-${court.id}`}
                            type="button"
                            onClick={() =>
                              setSettingsForm((p) => ({
                                ...p,
                                court_ids: active ? p.court_ids.filter((x) => x !== court.id) : [...p.court_ids, court.id],
                              }))
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] border font-semibold ${
                              active ? 'bg-[#E31E24] text-white border-[#E31E24]' : 'bg-white text-gray-700 border-gray-300'
                            }`}
                          >
                            {court.name}
                          </button>
                        );
                      })}
                    </div>
                    {settingsForm.court_ids.length < recommendedCourtsForSettings && (
                      <button
                        type="button"
                        onClick={() =>
                          setSettingsForm((p) => {
                            const next = [...p.court_ids];
                            const available = courts.find((c) => !next.includes(c.id));
                            if (available) next.push(available.id);
                            return { ...p, court_ids: next };
                          })
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E31E24]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Agregar 1 cancha más
                      </button>
                    )}
                  </div>
                  <div className="md:col-span-2 rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase block">Imagen del torneo</label>
                        <p className="text-[10px] text-gray-400 mt-0.5">Sube un cartel para mostrarlo en la lista y detalle.</p>
                      </div>
                      {!settingsForm.poster_url && !posterUploading && (
                        <button
                          type="button"
                          onClick={() => posterInputSettingsRef.current?.click()}
                          className="shrink-0 px-3 py-1.5 rounded-lg bg-[#E31E24] text-white text-[11px] font-semibold"
                        >
                          Agregar imagen
                        </button>
                      )}
                    </div>
                    <input
                      ref={posterInputSettingsRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      disabled={posterUploading || !selected || !clubId}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f || !selected || !clubId) return;
                        setPosterUploading(true);
                        try {
                          const url = await tournamentsService.uploadPoster(clubId, selected.id, f);
                          setSettingsForm((p) => ({ ...p, poster_url: url }));
                          await tournamentsService.update(selected.id, { poster_url: url });
                          toast.success('Cartel subido');
                          await refreshList(selected.id);
                          await refreshDetail(selected.id);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'No se pudo subir el cartel');
                        } finally {
                          setPosterUploading(false);
                        }
                      }}
                    />
                    {posterUploading && (
                      <div className="flex items-center gap-2 text-[11px] text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" /> Subiendo imagen…
                      </div>
                    )}
                    {settingsForm.poster_url && !posterUploading && (
                      <div className="relative rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                        <img
                          src={settingsForm.poster_url}
                          alt="Cartel del torneo"
                          className="w-full max-h-48 object-contain bg-white"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!selected) return;
                            setSettingsForm((p) => ({ ...p, poster_url: '' }));
                            await tournamentsService.update(selected.id, { poster_url: null });
                            toast.success('Imagen eliminada');
                            await refreshList(selected.id);
                            await refreshDetail(selected.id);
                          }}
                          className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
                          aria-label="Quitar imagen"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <div className="flex items-center justify-between border-t border-gray-100 bg-white px-2 py-1.5">
                          <p className="text-[10px] text-gray-500 truncate flex-1">Imagen actual</p>
                          <button
                            type="button"
                            onClick={() => posterInputSettingsRef.current?.click()}
                            className="text-[10px] font-semibold text-[#E31E24]"
                          >
                            Cambiar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Normas del torneo</label>
                    <textarea
                      value={settingsForm.normas}
                      onChange={(e) => setSettingsForm((p) => ({ ...p, normas: e.target.value }))}
                      placeholder="Describe las reglas, formato de juego, etc."
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={async () => {
                    if (!selected) return;
                    if (!isHalfHourLocalDateTime(settingsForm.start_at)) {
                      toast.error('El inicio debe ser en punto o y media (ej: 09:00, 09:30)');
                      return;
                    }
                    if (!isValidDuration30(settingsForm.duration_min)) {
                      toast.error('La duración debe ser múltiplo de 30 (30, 60, 90, 120...)');
                      return;
                    }
                    if (!settingsForm.court_ids.length) {
                      toast.error('Selecciona al menos una cancha');
                      return;
                    }
                    setSavingSettings(true);
                    try {
                      const updatedTournament = await tournamentsService.update(selected.id, {
                        name: settingsForm.name || null,
                        start_at: settingsForm.start_at ? new Date(settingsForm.start_at).toISOString() : selected.start_at,
                        duration_min: Number(settingsForm.duration_min),
                        max_players: Math.max(2, Number(settingsForm.max_players) || 2),
                        price_cents: eurosInputToCents(settingsForm.price_euros),
                        prizes: formRowsToPrizePayload(settingsForm.prizeRows),
                        elo_min: settingsForm.elo_min ? Number(settingsForm.elo_min) : null,
                        elo_max: settingsForm.elo_max ? Number(settingsForm.elo_max) : null,
                        visibility: settingsForm.visibility === 'public' ? 'public' : 'private',
                        gender:
                          settingsForm.gender === 'male' ||
                          settingsForm.gender === 'female' ||
                          settingsForm.gender === 'mixed'
                            ? settingsForm.gender
                            : null,
                        normas: settingsForm.normas || null,
                        registration_closed_at: settingsForm.registration_closed_at ? new Date(settingsForm.registration_closed_at).toISOString() : null,
                        poster_url: settingsForm.poster_url.trim() || null,
                        court_ids: settingsForm.court_ids,
                      });
                      setItems((prev) => prev.map((it) => (it.id === selected.id ? { ...it, ...updatedTournament } : it)));
                      setSelected((prev) => (prev?.id === selected.id ? { ...prev, ...updatedTournament } : prev));
                      toast.success('Ajustes guardados');
                      void Promise.allSettled([refreshList(selected.id), refreshDetail(selected.id)]);
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
                  className="ml-2 px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"
                >
                  Cancelar torneo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {entryRejectOpen && selected && entryRejectTargetId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-gray-100 shadow-xl p-4 space-y-3">
            <p className="text-sm font-bold text-[#1A1A1A]">Rechazar solicitud</p>
            <p className="text-xs text-gray-500">Opcional: mensaje para el jugador (por ejemplo, motivo del rechazo).</p>
            <textarea
              value={entryRejectMessage}
              onChange={(e) => setEntryRejectMessage(e.target.value)}
              rows={4}
              placeholder="Mensaje opcional…"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEntryRejectOpen(false);
                  setEntryRejectTargetId(null);
                }}
                className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={entryActionLoadingId === entryRejectTargetId}
                onClick={async () => {
                  if (!selected || !entryRejectTargetId) return;
                  setEntryActionLoadingId(entryRejectTargetId);
                  try {
                    await tournamentsService.rejectEntryRequest(selected.id, entryRejectTargetId, entryRejectMessage.trim() || undefined);
                    toast.success('Solicitud rechazada');
                    setEntryRejectOpen(false);
                    setEntryRejectTargetId(null);
                    setEntryRejectMessage('');
                    await loadEntryRequests(selected.id);
                    await refreshList(selected.id);
                  } catch (e) {
                    toast.error((e as Error).message || 'No se pudo rechazar');
                  } finally {
                    setEntryActionLoadingId(null);
                  }
                }}
                className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {entryActionLoadingId === entryRejectTargetId && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {entryFullModalRequestId && selected && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-amber-100 shadow-xl p-4 space-y-3">
            <p className="text-sm font-bold text-amber-900">Torneo lleno</p>
            <p className="text-xs text-gray-700">
              Mientras aprobabas, el torneo completó los cupos. Puedes rechazar la solicitud con un mensaje o dejarla en visto para archivarla sin inscribir al jugador.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  const id = entryFullModalRequestId;
                  setEntryFullModalRequestId(null);
                  if (id) {
                    setEntryRejectTargetId(id);
                    setEntryRejectMessage('');
                    setEntryRejectOpen(true);
                  }
                }}
                className="px-3 py-2 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold"
              >
                Rechazar con mensaje
              </button>
              <button
                type="button"
                disabled={!entryFullModalRequestId || entryActionLoadingId === entryFullModalRequestId}
                onClick={async () => {
                  const rid = entryFullModalRequestId;
                  if (!selected || !rid) return;
                  setEntryActionLoadingId(rid);
                  try {
                    await tournamentsService.dismissEntryRequest(selected.id, rid);
                    toast.success('Solicitud dejada en visto');
                    setEntryFullModalRequestId(null);
                    await loadEntryRequests(selected.id);
                    await refreshList(selected.id);
                  } catch (e) {
                    toast.error((e as Error).message || 'No se pudo archivar');
                  } finally {
                    setEntryActionLoadingId(null);
                  }
                }}
                className="px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
              >
                {entryActionLoadingId === entryFullModalRequestId && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Dejar en visto
              </button>
            </div>
            <button
              type="button"
              onClick={() => setEntryFullModalRequestId(null)}
              className="w-full px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold text-gray-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center bg-black/40 p-3 md:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-gray-200 shadow-2xl overflow-hidden my-3 md:my-0 max-h-[92vh] flex flex-col">
            <div className="px-6 py-5 border-b border-gray-200 bg-[#ED1C24]">
              <p className="text-base font-black text-white">{tx.createTournament}</p>
              <p className="text-xs text-white/90 mt-1">Configura horarios, cupos, Elo y canchas con un formato visual más claro.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {['Básico', 'Competición', 'Detalle final'].map((label, idx) => (
                  <button
                    key={`create-step-${idx}`}
                    type="button"
                    onClick={() => {
                      if (idx <= createStep) setCreateStep(idx);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                      idx === createStep
                        ? 'bg-white text-[#ED1C24] border-white'
                        : idx < createStep
                          ? 'bg-white/15 text-white border-white/30'
                          : 'bg-transparent text-white/80 border-white/20'
                    }`}
                  >
                    {idx + 1}. {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {createStep === 0 && (
                  <>
                <div className="rounded-2xl border border-gray-200 bg-white p-3 md:col-span-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Imagen del torneo</label>
                      <p className="text-[11px] text-gray-500 mt-1">Sube un cartel para mostrarlo en la lista y detalle.</p>
                    </div>
                    {!posterFileCreate && (
                      <button
                        type="button"
                        onClick={() => posterInputCreateRef.current?.click()}
                        className="shrink-0 px-3 py-2 rounded-lg bg-[#E31E24] text-white text-xs font-semibold"
                      >
                        Agregar imagen
                      </button>
                    )}
                  </div>
                  <input
                    ref={posterInputCreateRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      e.target.value = '';
                      setPosterFileCreate(f);
                    }}
                  />
                  {posterPreviewUrl && posterFileCreate && (
                    <div className="relative mt-3 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                      <img
                        src={posterPreviewUrl}
                        alt="Vista previa del cartel"
                        className="w-full max-h-48 object-contain bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPosterFileCreate(null);
                          if (posterInputCreateRef.current) posterInputCreateRef.current.value = '';
                        }}
                        className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
                        aria-label="Quitar imagen"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <p className="text-[10px] text-gray-500 px-2 py-1.5 truncate border-t border-gray-100 bg-white">{posterFileCreate.name}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3 md:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Nombre del torneo</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ej. Copa Primavera"
                    className="mt-1.5 w-full text-sm outline-none rounded-lg border border-black bg-white px-2 py-1.5"
                  />
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 md:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Fecha y hora del torneo</label>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Fecha de inicio</label>
                      <div className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5">
                        <input
                          type="date"
                          value={form.start_date}
                          onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                          className="w-full text-sm outline-none bg-transparent"
                        />
                        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Fecha de fin</label>
                      <div className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 bg-gray-50">
                        <input
                          type="date"
                          value={form.start_date}
                          disabled
                          className="w-full text-sm outline-none bg-transparent text-gray-500"
                        />
                        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Hora de inicio</label>
                      <div className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5">
                        <select
                          value={form.start_time}
                          onChange={(e) => {
                            const st = e.target.value;
                            setForm((p) => {
                              const dur = calcDurationMin(st, p.end_time);
                              return { ...p, start_time: st, duration_min: String(dur) };
                            });
                          }}
                          className="w-full text-sm outline-none bg-transparent appearance-none"
                        >
                          {HALF_HOUR_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <Clock3 className="w-4 h-4 text-gray-400 shrink-0" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Hora de fin</label>
                      <div className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5">
                        <select
                          value={form.end_time}
                          onChange={(e) => {
                            const et = e.target.value;
                            setForm((p) => {
                              const dur = calcDurationMin(p.start_time, et);
                              return { ...p, end_time: et, duration_min: String(dur) };
                            });
                          }}
                          className="w-full text-sm outline-none bg-transparent appearance-none"
                        >
                          {HALF_HOUR_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <Clock3 className="w-4 h-4 text-gray-400 shrink-0" />
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">Duración: {form.duration_min} min</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 md:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Recurrencia</label>
                  <div className="mt-2">
                    <label className="text-[10px] text-gray-500 mb-1 block">Repetir</label>
                    <select
                      value={form.recurring_enabled ? 'weekly' : 'none'}
                      onChange={(e) => setForm((p) => ({ ...p, recurring_enabled: e.target.value === 'weekly' }))}
                      className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none bg-transparent"
                    >
                      <option value="none">No se repite</option>
                      <option value="weekly">Semanal</option>
                    </select>
                  </div>
                  {form.recurring_enabled && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="text-[10px] text-gray-500 mb-1 block">Fin de la serie semanal</label>
                        <div className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 w-fit">
                          <input
                            type="date"
                            value={form.recurring_end_date}
                            onChange={(e) => setForm((p) => ({ ...p, recurring_end_date: e.target.value }))}
                            className="text-sm outline-none bg-transparent"
                          />
                          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { id: 1, label: 'Lun' },
                          { id: 2, label: 'Mar' },
                          { id: 3, label: 'Mié' },
                          { id: 4, label: 'Jue' },
                          { id: 5, label: 'Vie' },
                          { id: 6, label: 'Sáb' },
                          { id: 0, label: 'Dom' },
                        ].map((d) => {
                          const active = form.recurring_weekdays.includes(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() =>
                                setForm((p) => ({
                                  ...p,
                                  recurring_weekdays: p.recurring_weekdays.includes(d.id)
                                    ? p.recurring_weekdays.filter((x) => x !== d.id)
                                    : [...p.recurring_weekdays, d.id].sort((a, b) => a - b),
                                }))
                              }
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium ${active ? 'bg-[#E31E24] text-white border-[#E31E24]' : 'bg-white text-gray-700 border-gray-300'}`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 md:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Políticas de registro y cancelación</label>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Cierre de registro</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={form.reg_close_unit}
                          onChange={(e) => setForm((p) => ({ ...p, reg_close_unit: e.target.value as 'days' | 'hours' }))}
                          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none"
                        >
                          <option value="days">Días</option>
                          <option value="hours">Horas</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          value={form.reg_close_value}
                          onChange={(e) => setForm((p) => ({ ...p, reg_close_value: e.target.value }))}
                          className="w-16 text-sm outline-none rounded-lg border border-gray-300 px-2 py-1.5 text-center"
                        />
                      </div>
                      {form.start_date && (
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          La inscripción se cerrará el {(() => {
                            const val = Number(form.reg_close_value) || 0;
                            const ms = form.reg_close_unit === 'days' ? val * 86400000 : val * 3600000;
                            const startMs = new Date(`${form.start_date}T${form.start_time}`).getTime();
                            const d = new Date(startMs - ms);
                            return d.toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                          })()}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Plazo de cancelación</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={form.cancel_unit}
                          onChange={(e) => setForm((p) => ({ ...p, cancel_unit: e.target.value as 'days' | 'hours' }))}
                          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none"
                        >
                          <option value="days">Días</option>
                          <option value="hours">Horas</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          value={form.cancel_value}
                          onChange={(e) => setForm((p) => ({ ...p, cancel_value: e.target.value }))}
                          className="w-16 text-sm outline-none rounded-lg border border-gray-300 px-2 py-1.5 text-center"
                        />
                      </div>
                      {form.start_date && (
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          Los participantes pueden cancelar hasta el {(() => {
                            const val = Number(form.cancel_value) || 0;
                            const ms = form.cancel_unit === 'days' ? val * 86400000 : val * 3600000;
                            const startMs = new Date(`${form.start_date}T${form.start_time}`).getTime();
                            const d = new Date(startMs - ms);
                            return d.toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                          })()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                  </>
                )}

                {createStep === 1 && (
                  <>
                <div className="rounded-2xl border border-[#ED1C24]/20 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Precio inscripción (€)</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    <input
                      value={form.price_euros}
                      onChange={(e) => setForm((p) => ({ ...p, price_euros: e.target.value }))}
                      placeholder="0"
                      className="w-28 text-sm outline-none rounded-lg border border-black bg-white px-2 py-1.5 text-center font-semibold"
                    />
                    <span className="text-xs px-2 py-1 rounded-md border border-[#ED1C24] bg-[#ED1C24] text-white">€</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3 md:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                    <Award className="w-4 h-4 text-gray-400" />
                    Premios por puesto (€)
                  </label>
                  <p className="text-[11px] text-gray-500 mt-1 mb-2">
                    Indica el premio en euros para cada puesto (ej. 150 = €150). El total se calcula automáticamente.
                  </p>
                  <div className="space-y-2">
                    {createPrizeRows.map((row) => (
                      <div key={row.localId} className="flex flex-wrap gap-2 items-center">
                        <input
                          value={row.label}
                          onChange={(e) =>
                            setCreatePrizeRows((rows) => rows.map((r) => (r.localId === row.localId ? { ...r, label: e.target.value } : r)))
                          }
                          placeholder="Ej. Campeón"
                          className="flex-1 min-w-[140px] text-sm rounded-lg border border-black bg-white px-2 py-1.5"
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-gray-500 font-medium">€</span>
                          <input
                            value={row.amountEuros}
                            onChange={(e) =>
                              setCreatePrizeRows((rows) => rows.map((r) => (r.localId === row.localId ? { ...r, amountEuros: e.target.value } : r)))
                            }
                            placeholder="150"
                            className="w-24 text-sm rounded-lg border border-black bg-white px-2 py-1.5 text-center font-semibold"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCreatePrizeRows((rows) => (rows.length > 1 ? rows.filter((r) => r.localId !== row.localId) : rows))
                          }
                          className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100"
                          aria-label="Quitar premio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCreatePrizeRows((rows) => [...rows, newPrizeRow('')])}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#ED1C24]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Añadir premio
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Máximo jugadores</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <input
                      value={form.max_players}
                      onChange={(e) => setForm((p) => ({ ...p, max_players: e.target.value }))}
                      placeholder="12"
                      className="w-20 text-sm outline-none rounded-lg border border-black bg-white px-2 py-1.5 text-center font-semibold"
                    />
                    <span className="text-xs px-2 py-1 rounded-md border border-[#ED1C24] bg-[#ED1C24] text-white">jug.</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Elo mínimo</label>
                  <input
                    value={form.elo_min}
                    onChange={(e) => setForm((p) => ({ ...p, elo_min: e.target.value }))}
                    placeholder="Opcional (ej: 1.0)"
                    className="mt-1.5 w-full text-sm outline-none rounded-lg border border-black bg-white px-2 py-1.5"
                  />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Elo máximo</label>
                  <input
                    value={form.elo_max}
                    onChange={(e) => setForm((p) => ({ ...p, elo_max: e.target.value }))}
                    placeholder="Opcional (ej: 3.0)"
                    className="mt-1.5 w-full text-sm outline-none rounded-lg border border-black bg-white px-2 py-1.5"
                  />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Modo inscripción</label>
                  <select
                    value={form.registration_mode}
                    onChange={(e) => setForm((p) => ({ ...p, registration_mode: e.target.value }))}
                    className="mt-1.5 w-full text-sm outline-none rounded-lg border border-black bg-white px-2 py-1.5"
                  >
                    <option value="individual">Individual</option>
                    <option value="pair">Parejas</option>
                    <option value="both">Ambos (individual o parejas)</option>
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">Puedes permitir inscripción individual, por parejas o sin restricción (ambos).</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Visibilidad del torneo</label>
                  <select
                    value={form.visibility}
                    onChange={(e) => setForm((p) => ({ ...p, visibility: e.target.value }))}
                    className="mt-1.5 w-full text-sm outline-none rounded-lg border border-black bg-white px-2 py-1.5"
                  >
                    <option value="private">Privado (solo invitación/enlace)</option>
                    <option value="public">Público (cualquiera puede ver y unirse)</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Categoría (género)</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                    className="mt-1.5 w-full text-sm outline-none rounded-lg border border-black bg-white px-2 py-1.5"
                  >
                    <option value="">Sin definir (cualquier género, con Elo válido)</option>
                    <option value="mixed">Mixto (explícito)</option>
                    <option value="male">Masculino</option>
                    <option value="female">Femenino</option>
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Sin definir: no se filtra por género del jugador. Masculino/femenino exigen el mismo género en el perfil. Mixto explícito tampoco filtra.
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tiempo de reserva de cupo (min)</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gray-400" />
                    <input
                      value={form.invite_ttl_minutes}
                      onChange={(e) => setForm((p) => ({ ...p, invite_ttl_minutes: e.target.value }))}
                      placeholder="1440"
                      className="w-24 text-sm outline-none rounded-lg border border-black bg-white px-2 py-1.5 text-center font-semibold"
                    />
                    <span className="text-xs px-2 py-1 rounded-md border border-[#ED1C24] bg-[#ED1C24] text-white">min</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Si el invitado no acepta en este tiempo, el cupo se libera automáticamente.</p>
                </div>
                  </>
                )}

                {createStep === 2 && (
                  <>
                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Descripción</label>
                  <textarea
                    value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe formato, premio, reglas..."
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-3">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Normas</label>
                <textarea
                  value={form.normas}
                  onChange={(e) => setForm((p) => ({ ...p, normas: e.target.value }))}
                  placeholder="Reglas del torneo, puntualidad, formato, sanciones..."
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-3">
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
                  </>
                )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-end gap-2 shrink-0">
              <button onClick={() => setCreateOpen(false)} className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold">Cerrar</button>
              <button
                type="button"
                onClick={() => setCreateStep((s) => Math.max(0, s - 1))}
                disabled={createStep === 0 || saving}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                disabled={saving}
                onClick={async () => {
                  if (createStep < 2) {
                    if (validateCreateStep(createStep)) {
                      setCreateStep((s) => Math.min(2, s + 1));
                    }
                    return;
                  }
                  if (!clubId) return;
                  if (!form.start_date) {
                    toast.error('Selecciona una fecha de inicio');
                    return;
                  }
                  const composedStartAt = `${form.start_date}T${form.start_time}`;
                  if (form.recurring_enabled) {
                    if (!form.recurring_end_date) {
                      toast.error('Indica fecha fin de recurrencia');
                      return;
                    }
                    if (!form.recurring_weekdays.length) {
                      toast.error('Selecciona al menos un día de la semana');
                      return;
                    }
                    if (form.recurring_end_date < form.start_date) {
                      toast.error('La fecha fin no puede ser anterior al inicio');
                      return;
                    }
                  }
                  const durationMin = calcDurationMin(form.start_time, form.end_time);
                  if (durationMin < 30) {
                    toast.error('La duración mínima es 30 minutos');
                    return;
                  }
                  if (!selectedCourtIds.length) {
                    toast.error('Selecciona al menos una cancha');
                    return;
                  }
                  const startMs = new Date(composedStartAt).getTime();
                  const regCloseVal = Number(form.reg_close_value) || 0;
                  const regCloseMs = form.reg_close_unit === 'days' ? regCloseVal * 86400000 : regCloseVal * 3600000;
                  const cancelVal = Number(form.cancel_value) || 0;
                  const cancelMs = form.cancel_unit === 'days' ? cancelVal * 86400000 : cancelVal * 3600000;
                  const payload = {
                    club_id: clubId,
                    name: form.name || null,
                    start_at: new Date(composedStartAt).toISOString(),
                    registration_closed_at: regCloseVal > 0 ? new Date(startMs - regCloseMs).toISOString() : null,
                    cancellation_cutoff_at: cancelVal > 0 ? new Date(startMs - cancelMs).toISOString() : null,
                    duration_min: durationMin,
                    price_cents: eurosInputToCents(form.price_euros),
                    max_players: Number(form.max_players),
                    registration_mode: form.registration_mode,
                    visibility: form.visibility === 'public' ? 'public' : 'private',
                    gender:
                      form.gender === 'male' || form.gender === 'female' || form.gender === 'mixed'
                        ? form.gender
                        : null,
                    invite_ttl_minutes: Number(form.invite_ttl_minutes),
                    prizes: formRowsToPrizePayload(createPrizeRows),
                    elo_min: form.elo_min ? Number(form.elo_min) : null,
                    elo_max: form.elo_max ? Number(form.elo_max) : null,
                    description: form.description || null,
                    normas: form.normas || null,
                    court_ids: selectedCourtIds,
                  };
                  setSaving(true);
                  const savingToastId = toast.loading('Guardando torneo...');
                  try {
                    if (form.recurring_enabled) {
                      const recurringPayload = {
                        ...payload,
                        start_date: form.start_date,
                        end_date: form.recurring_end_date,
                        start_time: form.start_time,
                        weekdays: form.recurring_weekdays,
                        registration_close_hours_before_start: regCloseVal > 0
                          ? (form.reg_close_unit === 'days' ? regCloseVal * 24 : regCloseVal)
                          : 0,
                        cancellation_hours_before_start: cancelVal > 0
                          ? (form.cancel_unit === 'days' ? cancelVal * 24 : cancelVal)
                          : 0,
                      };
                      const result = await tournamentsService.createRecurring(recurringPayload);
                      setCreateOpen(false);
                      setSelectedCourtIds([]);
                      setPosterFileCreate(null);
                      setForm({
                        name: '',
                        start_date: '',
                        start_time: '21:30',
                        end_time: '23:00',
                        start_at: '',
                        recurring_enabled: false,
                        recurring_end_date: '',
                        recurring_weekdays: [1],
                        recurring_registration_close_hours: '12',
                        registration_closed_at: '',
                        reg_close_unit: 'days',
                        reg_close_value: '0',
                        cancellation_notice_hours: '24',
                        cancel_unit: 'days',
                        cancel_value: '1',
                        duration_min: '120',
                        price_euros: '0',
                        max_players: '12',
                        registration_mode: 'individual',
                        visibility: 'private',
                        gender: '',
                        invite_ttl_minutes: '1440',
                        elo_min: '',
                        elo_max: '',
                        description: '',
                        normas: '',
                      });
                      await refreshList();
                      if (result.skipped_count > 0) {
                        const first = result.skipped[0];
                        toast.error(
                          `Hay conflictos de turnos/canchas. Creados: ${result.created_count}, omitidos: ${result.skipped_count}. ${first ? `Ejemplo: ${new Date(first.start_at).toLocaleString()} - ${first.reason}` : ''}`,
                          { id: savingToastId }
                        );
                      } else {
                        toast.success(`Serie creada: ${result.created_count} torneo(s)`, { id: savingToastId });
                      }
                      return;
                    }
                    const created = await tournamentsService.create(payload);
                    if (posterFileCreate && clubId) {
                      try {
                        const url = await tournamentsService.uploadPoster(clubId, created.id, posterFileCreate);
                        await tournamentsService.update(created.id, { poster_url: url });
                        (created as { poster_url?: string }).poster_url = url;
                      } catch (err) {
                        toast.error(
                          `Torneo creado; cartel no subido: ${err instanceof Error ? err.message : 'error'}`
                        );
                      }
                    }
                    setPosterFileCreate(null);
                    setItems((prev) => {
                      const next = [{ ...created, confirmed_count: 0, pending_count: 0 }, ...prev.filter((x) => x.id !== created.id)];
                      return next;
                    });
                    setSelected({ ...created, confirmed_count: 0, pending_count: 0 });
                    setCreateOpen(false);
                    setSelectedCourtIds([]);
                    setForm({
                      name: '',
                      start_date: '',
                      start_time: '21:30',
                      end_time: '23:00',
                      start_at: '',
                      recurring_enabled: false,
                      recurring_end_date: '',
                      recurring_weekdays: [1],
                      recurring_registration_close_hours: '12',
                      registration_closed_at: '',
                      reg_close_unit: 'days',
                      reg_close_value: '0',
                      cancellation_notice_hours: '24',
                      cancel_unit: 'days',
                      cancel_value: '1',
                      duration_min: '120',
                      price_euros: '0',
                      max_players: '12',
                      registration_mode: 'individual',
                      visibility: 'private',
                      gender: '',
                      invite_ttl_minutes: '1440',
                      elo_min: '',
                      elo_max: '',
                      description: '',
                      normas: '',
                    });
                    navigate(`/torneos/${created.id}`);
                    toast.success('Torneo creado correctamente', { id: savingToastId });
                    await refreshDetail(created.id);
                  } catch (e) {
                    toast.error((e as Error).message || 'No se pudo crear el torneo', { id: savingToastId });
                  } finally {
                    setSaving(false);
                  }
                }}
                className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold shadow-[0_8px_24px_rgba(227,30,36,0.25)] disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {saving && createStep === 2 && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {createStep < 2 ? 'Siguiente' : saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {manualOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-6xl rounded-2xl bg-white border border-gray-100 shadow-xl p-4 md:p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-[#1A1A1A]">Generador manual de cruces</p>
                <p className="text-xs text-gray-500">
                  Solo eliminación directa: define la primera ronda, asigna cancha por partido y confirma para guardar el cuadro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-semibold text-[#1A1A1A] mb-2">Ronda inicial: enfrentamientos y cancha</p>
                <div className="space-y-2">
                  {manualRound1.map((m, idx) => {
                    const usedElsewhere = new Set(
                      manualRound1
                        .filter((x) => x.id !== m.id)
                        .flatMap((x) => [x.a, x.b])
                        .filter(Boolean)
                    );
                    const options = manualTeamOptions.filter((o) => !usedElsewhere.has(o.id) || o.id === m.a || o.id === m.b);
                    return (
                      <div key={m.id} className="rounded-lg border border-gray-100 p-2">
                        <p className="text-[11px] font-semibold text-gray-600 mb-1">Partido {idx + 1}</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <select
                            value={m.a}
                            onChange={(e) => setManualRound1((prev) => prev.map((x) => (x.id === m.id ? { ...x, a: e.target.value } : x)))}
                            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                          >
                            <option value="">Equipo A</option>
                            {options.map((o) => (
                              <option key={`${m.id}-a-${o.id}`} value={o.id}>{o.label}</option>
                            ))}
                          </select>
                          <select
                            value={m.b}
                            onChange={(e) => setManualRound1((prev) => prev.map((x) => (x.id === m.id ? { ...x, b: e.target.value } : x)))}
                            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                          >
                            <option value="">Equipo B</option>
                            {options.map((o) => (
                              <option key={`${m.id}-b-${o.id}`} value={o.id}>{o.label}</option>
                            ))}
                          </select>
                          <select
                            value={m.courtId}
                            onChange={(e) => setManualRound1((prev) => prev.map((x) => (x.id === m.id ? { ...x, courtId: e.target.value } : x)))}
                            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                          >
                            <option value="">Cancha</option>
                            {courts.map((c) => (
                              <option key={`${m.id}-court-${c.id}`} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={manualGenerating}
                  onClick={async () => {
                    if (!selected) return;
                    const incomplete = manualRound1.some((m) => !m.a || !m.b);
                    if (incomplete) {
                      toast.error('Completa los dos equipos en cada partido de la primera ronda.');
                      return;
                    }
                    const missingCourt = manualRound1.some((m) => !m.courtId);
                    if (missingCourt) {
                      toast.error('Selecciona una cancha para cada enfrentamiento.');
                      return;
                    }
                    const used = new Set<string>();
                    for (const m of manualRound1) {
                      if (used.has(m.a) || used.has(m.b)) {
                        toast.error('Cada equipo solo puede aparecer una vez en la primera ronda.');
                        return;
                      }
                      used.add(m.a);
                      used.add(m.b);
                    }
                    const teamKeys: string[] = [];
                    for (const m of manualRound1) {
                      teamKeys.push(m.a, m.b);
                    }
                    setManualGenerating(true);
                    try {
                      await tournamentsService.setupCompetition(selected.id, {
                        format: 'single_elim',
                        match_rules: {
                          best_of_sets: Number(bestOfSets) || 3,
                          allow_draws: false,
                          bracket_seed_strategy: bracketSeedStrategy,
                          manual_round1_courts: manualRound1.map((m, idx) => ({ match_number: idx + 1, court_id: m.courtId })),
                        } as Record<string, unknown>,
                      });
                      const r = await tournamentsService.generateCompetitionManual(selected.id, teamKeys);
                      toast.success(`Cuadro generado: ${r.teams_count} equipos, ${r.matches_count} partidos`);
                      setManualOpen(false);
                      await reloadCompetitionView(selected.id);
                      await refreshDetail(selected.id);
                      await refreshList(selected.id);
                    } catch (e) {
                      toast.error((e as Error).message || 'No se pudo generar el cuadro manual');
                    } finally {
                      setManualGenerating(false);
                    }
                  }}
                  className="mt-3 px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold disabled:opacity-70"
                >
                  {manualGenerating ? 'Generando...' : 'Confirmar cuadro manual'}
                </button>
              </div>

              <div className="rounded-xl border border-gray-200 p-3 bg-gray-50 overflow-x-auto">
                <p className="text-xs font-semibold text-[#1A1A1A] mb-2">Vista previa del cuadro</p>
                {manualPreview.length === 0 ? (
                  <p className="text-xs text-gray-500">Completa los cruces de Ronda 1 para previsualizar la llave.</p>
                ) : (
                  <div className="min-w-[760px] flex gap-4">
                    {manualPreview.map((round) => (
                      <div key={round.title} className="w-56 shrink-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">{round.title}</p>
                        <div className="space-y-3">
                          {round.matches.map((m) => (
                            <div key={m.id} className="rounded-lg border border-gray-200 bg-white p-2">
                              <p className="text-[11px] font-semibold text-[#1A1A1A] truncate">{m.a}</p>
                              <p className="text-[11px] text-gray-500 mt-1 truncate">{m.b}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {generateModeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-gray-100 shadow-xl p-4 space-y-3">
            <p className="text-sm font-bold text-[#1A1A1A]">¿Cómo quieres generar los cruces?</p>
            <p className="text-xs text-gray-500">Puedes elegir generación automática o armar los cruces manualmente.</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!selected) return;
                  setGenerateModeOpen(false);
                  try {
                    const r = await tournamentsService.generateCompetition(selected.id);
                    toast.success(`Fixture generado: ${r.teams_count} equipos, ${r.matches_count} partidos`);
                    await reloadCompetitionView(selected.id);
                    await refreshDetail(selected.id);
                    await refreshList(selected.id);
                  } catch (e) {
                    toast.error((e as Error).message || 'No se pudo generar el fixture');
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold"
              >
                Generar automático
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selected) return;
                  let freshInscriptions: TournamentInscription[];
                  let freshTournament: TournamentListItem;
                  let freshDivisions: TournamentDivisionRow[];
                  try {
                    const fresh = await tournamentsService.detail(selected.id);
                    freshInscriptions = fresh.inscriptions ?? [];
                    freshTournament = fresh.tournament;
                    freshDivisions = fresh.divisions ?? [];
                  } catch {
                    toast.error('No se pudieron cargar las inscripciones. Intenta de nuevo.');
                    setGenerateModeOpen(false);
                    return;
                  }
                  const mode = freshTournament.registration_mode === 'pair' ? 'pair' : 'individual';
                  const check = validatePairsForManualBracket(mode, freshInscriptions);
                  if (!check.ok) {
                    toast.error(check.message);
                    setGenerateModeOpen(false);
                    setPairingGateMessage(check.message);
                    setTab('jugadores');
                    return;
                  }
                  const teams = buildManualTeamOptionsFromDetail(mode, freshInscriptions);
                  if (teams.length < 1) {
                    toast.error('No hay equipos armables con las inscripciones actuales.');
                    setGenerateModeOpen(false);
                    setTab('jugadores');
                    return;
                  }
                  setDetail(freshInscriptions);
                  setDivisionsDetail(freshDivisions);
                  setSelected(freshTournament);
                  setPairingGateMessage(null);
                  setGenerateModeOpen(false);
                  const teamCount = Math.max(2, teams.length);
                  const bracketSize = nextPowerOfTwo(teamCount);
                  const matchCount = Math.max(1, bracketSize / 2);
                  const availableCourtIds = Array.isArray(freshTournament.tournament_courts)
                    ? freshTournament.tournament_courts.map((x) => String(x.court_id))
                    : [];
                  const rows: ManualRoundMatch[] = Array.from({ length: matchCount }, (_, idx) => ({
                    id: `m${idx + 1}`,
                    a: '',
                    b: '',
                    courtId: availableCourtIds[idx % Math.max(1, availableCourtIds.length)] ?? '',
                  }));
                  setManualRound1(rows);
                  setManualOpen(true);
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold"
              >
                Generar manual
              </button>
            </div>
            <button
              type="button"
              onClick={() => setGenerateModeOpen(false)}
              className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {addParticipantOpen && selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-100 shadow-xl p-4 space-y-3">
            <p className="text-sm font-bold text-[#1A1A1A]">{tx.addParticipant}</p>
            <p className="text-xs text-gray-500">{t('tournament_add_participant_hint')}</p>

            <input
              value={playerSearch}
              onChange={(e) => {
                setPlayerSearch(e.target.value);
                setSelectedPlayer(null);
              }}
              placeholder={t('tournament_add_participant_search_placeholder')}
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
                  <p className="text-[11px] text-gray-500">
                    {t('tournament_player_phone_elo_line', {
                      phone: p.phone?.trim() || t('tournament_no_phone'),
                      elo: formatPlayerElo(p.elo_rating),
                    })}
                  </p>
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
                    toast.error('Indica un email para invitar (o elige un jugador que tenga email en su perfil)');
                    return;
                  }
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    toast.error('Email no válido');
                    return;
                  }
                  const res = await tournamentsService.invite(selected.id, [{ email_1: email }]);
                  const link = res.invite_urls?.[0] ?? '';
                  if (link) {
                    setLastInviteLink(link);
                    toast.success('Invitación enviada. Copia el enlace cuando quieras compartirlo.');
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

      {pairingManageOpen && selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-gray-100 shadow-xl p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <p className="text-sm font-bold text-[#1A1A1A]">{t('tournament_pairing_title')}</p>
            <p className="text-xs text-gray-500">
              {selected.registration_mode === 'pair'
                ? t('tournament_pairing_subtitle_pair')
                : t('tournament_pairing_subtitle_individual')}
            </p>
            {(selected.registration_mode === 'individual' || selected.registration_mode === 'both') && singlesPairingOrder.length > 0 && (
              <div className="space-y-4">
                {pairingSectionFlags.hasDefined && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                    {t('tournament_pairing_defined')}
                  </p>
                  <div className="space-y-3">
                    {Array.from({ length: Math.ceil(singlesPairingOrder.length / 2) }, (_, pairIdx) => {
                      const i = pairIdx * 2;
                      const idA = singlesPairingOrder[i];
                      const idB = singlesPairingOrder[i + 1];
                      const pidA = singlesPairingDraft[idA];
                      const pidB = idB ? singlesPairingDraft[idB] : undefined;
                      const complete = idB != null ? Boolean(pidA && pidB) : Boolean(pidA);
                      if (!complete) return null;
                      return (
                        <div
                          key={`def-${pairIdx}`}
                          className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-2"
                        >
                          <p className="text-[11px] font-semibold text-emerald-900">
                            {t('tournament_pairing_pair_number', { n: pairIdx + 1 })}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {[idA, idB].filter(Boolean).map((insId) => {
                              const pid = singlesPairingDraft[insId];
                              return (
                                <div key={insId} className="rounded-lg border border-white bg-white p-2 flex flex-col gap-1.5">
                                  <span className="text-xs font-medium text-[#1A1A1A]">
                                    {pid ? pairingPlayerLabels[pid] ?? pid : t('tournament_pairing_slot_empty')}
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSinglesPairingDraft((p) => removePlayerFromSlot(p, insId))
                                      }
                                      className="px-2 py-1 rounded-md bg-gray-100 text-[11px] font-semibold text-gray-800"
                                    >
                                      {t('tournament_pairing_remove')}
                                    </button>
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (!v) return;
                                        setSinglesPairingDraft((p) =>
                                          assignPlayerToInscriptionSlot(p, insId, v)
                                        );
                                        e.target.value = '';
                                      }}
                                      className="flex-1 min-w-[140px] rounded-md border border-gray-200 px-2 py-1 text-[11px]"
                                    >
                                      <option value="">{t('tournament_pairing_assign_from_pool')}</option>
                                      {singlesPairingPool.map((poolPid) => (
                                        <option key={poolPid} value={poolPid}>
                                          {pairingPlayerLabels[poolPid] ?? poolPid}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}
                {pairingSectionFlags.hasIncomplete && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-2">
                    {t('tournament_pairing_incomplete')}
                  </p>
                  <div className="space-y-3">
                    {Array.from({ length: Math.ceil(singlesPairingOrder.length / 2) }, (_, pairIdx) => {
                      const i = pairIdx * 2;
                      const idA = singlesPairingOrder[i];
                      const idB = singlesPairingOrder[i + 1];
                      const pidA = singlesPairingDraft[idA];
                      const pidB = idB ? singlesPairingDraft[idB] : undefined;
                      const complete = idB != null ? Boolean(pidA && pidB) : Boolean(pidA);
                      if (complete) return null;
                      return (
                        <div
                          key={`inc-${pairIdx}`}
                          className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2"
                        >
                          <p className="text-[11px] font-semibold text-amber-900">
                            {t('tournament_pairing_pair_number', { n: pairIdx + 1 })}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {[idA, idB].filter(Boolean).map((insId) => {
                              const pid = singlesPairingDraft[insId];
                              return (
                                <div key={insId} className="rounded-lg border border-white bg-white p-2 flex flex-col gap-1.5">
                                  <span className="text-xs font-medium text-[#1A1A1A]">
                                    {pid ? pairingPlayerLabels[pid] ?? pid : t('tournament_pairing_slot_empty')}
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      disabled={!pid}
                                      onClick={() =>
                                        setSinglesPairingDraft((p) => removePlayerFromSlot(p, insId))
                                      }
                                      className="px-2 py-1 rounded-md bg-gray-100 text-[11px] font-semibold text-gray-800 disabled:opacity-40"
                                    >
                                      {t('tournament_pairing_remove')}
                                    </button>
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (!v) return;
                                        setSinglesPairingDraft((p) =>
                                          assignPlayerToInscriptionSlot(p, insId, v)
                                        );
                                        e.target.value = '';
                                      }}
                                      className="flex-1 min-w-[140px] rounded-md border border-gray-200 px-2 py-1 text-[11px]"
                                    >
                                      <option value="">{t('tournament_pairing_assign_from_pool')}</option>
                                      {singlesPairingPool.map((poolPid) => (
                                        <option key={poolPid} value={poolPid}>
                                          {pairingPlayerLabels[poolPid] ?? poolPid}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}
                {singlesPairingPool.length > 0 && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[11px] font-semibold text-gray-700 mb-1">{t('tournament_pairing_pool')}</p>
                    <p className="text-xs text-gray-600">
                      {singlesPairingPool.map((pid) => pairingPlayerLabels[pid] ?? pid).join(' · ')}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!pairingIsDirty || pairingSaving}
                    onClick={() => {
                      for (const insId of singlesPairingOrder) {
                        if (!singlesPairingDraft[insId]) {
                          toast.error(t('tournament_pairing_error_incomplete'));
                          return;
                        }
                      }
                      setPairingConfirmOpen(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {t('tournament_pairing_save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pairingIsDirty && !window.confirm(t('tournament_pairing_discard_confirm'))) return;
                      setPairingManageOpen(false);
                    }}
                    className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"
                  >
                    {t('close')}
                  </button>
                </div>
              </div>
            )}
            {(selected.registration_mode === 'pair' || selected.registration_mode === 'both') && (
              <div className="space-y-2">
                {pairIncompleteRows.length === 0 ? (
                  <p className="text-xs text-gray-500">{t('tournament_pairing_pair_none_incomplete')}</p>
                ) : (
                  pairIncompleteRows.map((ins) => (
                    <div
                      key={ins.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 p-2"
                    >
                      <span className="text-xs font-medium text-[#1A1A1A] inline-flex items-center gap-2 min-w-0">
                        {ins.players_1 ? (
                          <PlayerAvatarThumb
                            sizeClass="h-7 w-7"
                            avatarUrl={ins.players_1.avatar_url}
                            firstName={ins.players_1.first_name}
                            lastName={ins.players_1.last_name}
                          />
                        ) : null}
                        <span className="min-w-0">
                          {ins.players_1
                            ? `${ins.players_1.first_name} ${ins.players_1.last_name}`
                            : '—'}{' '}
                          — {t('tournament_pairing_needs_partner')}
                          {ins.players_1 ? (
                            <span className="block text-[10px] text-gray-500 mt-0.5">
                              {t('tournament_player_elo', { n: formatPlayerElo(ins.players_1.elo_rating) })}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAssignInscriptionId(ins.id);
                          setAssignSearch('');
                          setAssignResults([]);
                          setAssignSelectedPlayer(null);
                          setAssignPartnerOpen(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-semibold"
                      >
                        {t('tournament_pairing_assign_partner_btn')}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
            {(selected.registration_mode === 'pair' || selected.registration_mode === 'both') && (
              <button
                type="button"
                onClick={() => setPairingManageOpen(false)}
                className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"
              >
                {t('close')}
              </button>
            )}
          </div>
        </div>
      )}

      {pairingConfirmOpen && selected && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-gray-100 shadow-xl p-4 space-y-3">
            <p className="text-sm font-bold text-[#1A1A1A]">{t('tournament_pairing_confirm_title')}</p>
            <p className="text-xs text-gray-600">{t('tournament_pairing_confirm_hint')}</p>
            <ul className="text-xs text-[#1A1A1A] space-y-1.5 max-h-48 overflow-y-auto list-disc pl-4">
              {Array.from({ length: Math.ceil(singlesPairingOrder.length / 2) }, (_, pairIdx) => {
                const i = pairIdx * 2;
                const idA = singlesPairingOrder[i];
                const idB = singlesPairingOrder[i + 1];
                const pa = singlesPairingDraft[idA];
                const pb = idB ? singlesPairingDraft[idB] : null;
                const la = pa ? pairingPlayerLabels[pa] ?? pa : '—';
                const lb = pb ? pairingPlayerLabels[pb] ?? pb : idB ? '—' : '';
                return (
                  <li key={`cfm-${pairIdx}`}>
                    {t('tournament_pairing_pair_number', { n: pairIdx + 1 })}: {la}
                    {idB ? ` ${t('tournament_pairing_and')} ${lb}` : ''}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPairingConfirmOpen(false)}
                className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={pairingSaving}
                onClick={async () => {
                  if (!selected) return;
                  setPairingSaving(true);
                  try {
                    const assignments = singlesPairingOrder.map((insId) => ({
                      inscription_id: insId,
                      player_id: singlesPairingDraft[insId]!,
                    }));
                    await tournamentsService.applySinglesPairing(selected.id, assignments);
                    let bracketOk = false;
                    try {
                      bracketOk = await regenerateFixtureIfExists(selected.id);
                    } catch (re) {
                      toast.error(
                        (re as Error).message || t('tournament_pairing_bracket_regen_error')
                      );
                    }
                    toast.success(
                      bracketOk ? t('tournament_pairing_success_bracket') : t('tournament_pairing_success')
                    );
                    setPairingConfirmOpen(false);
                    setPairingManageOpen(false);
                    await refreshDetail(selected.id);
                    await refreshList(selected.id);
                    await reloadCompetitionView(selected.id);
                  } catch (e) {
                    toast.error((e as Error).message || t('tournament_pairing_error_save'));
                  } finally {
                    setPairingSaving(false);
                  }
                }}
                className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold disabled:opacity-60"
              >
                {pairingSaving ? t('tournament_pairing_saving') : t('tournament_pairing_confirm_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignPartnerOpen && selected && assignInscriptionId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-100 shadow-xl p-4 space-y-3">
            <p className="text-sm font-bold text-[#1A1A1A]">{t('tournament_pairing_assign_partner_title')}</p>
            <input
              value={assignSearch}
              onChange={(e) => {
                setAssignSearch(e.target.value);
                setAssignSelectedPlayer(null);
              }}
              placeholder={t('tournament_pairing_search_placeholder')}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
            />
            <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-100">
              {assignSearching && (
                <p className="text-xs text-gray-500 px-3 py-2">{t('tournament_pairing_searching')}</p>
              )}
              {!assignSearching && assignResults.length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-2">{t('tournament_pairing_no_results')}</p>
              )}
              {assignResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setAssignSelectedPlayer(p)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 ${assignSelectedPlayer?.id === p.id ? 'bg-red-50' : ''}`}
                >
                  <p className="text-xs font-semibold text-[#1A1A1A]">
                    {p.first_name} {p.last_name}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {t('tournament_player_phone_elo_line', {
                      phone: p.phone?.trim() || t('tournament_no_phone'),
                      elo: formatPlayerElo(p.elo_rating),
                    })}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAssignPartnerOpen(false);
                  setAssignInscriptionId(null);
                }}
                className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!assignSelectedPlayer?.id) {
                    toast.error(t('tournament_pairing_pick_player'));
                    return;
                  }
                  try {
                    await tournamentsService.assignPartner(selected.id, assignInscriptionId, assignSelectedPlayer.id);
                    let bracketOk = false;
                    try {
                      bracketOk = await regenerateFixtureIfExists(selected.id);
                    } catch (re) {
                      toast.error(
                        (re as Error).message || t('tournament_pairing_bracket_regen_error')
                      );
                    }
                    toast.success(
                      bracketOk ? t('tournament_pairing_success_bracket') : t('tournament_pairing_partner_assigned')
                    );
                    setAssignPartnerOpen(false);
                    setAssignInscriptionId(null);
                    await refreshDetail(selected.id);
                    await refreshList(selected.id);
                    await reloadCompetitionView(selected.id);
                  } catch (e) {
                    toast.error((e as Error).message || t('tournament_pairing_assign_error'));
                  }
                }}
                className="px-3 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-semibold"
              >
                {t('tournament_pairing_confirm_assign')}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

