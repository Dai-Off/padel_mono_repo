import React, { useCallback, useEffect, useState } from 'react';
import { X, AlertTriangle, EyeOff, Eye, UserPlus, Users, Trash2, MessageCircle, Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  tournamentsService,
  type TournamentChatMessage,
  type TournamentDivisionRow,
  type TournamentEntryRequest,
  type TournamentInscription,
} from '../../../services/tournaments';
import { HttpError } from '../../../services/api';
import { useGrillaTranslation } from '../i18n/useGrillaTranslation';
import { calendarLocale } from '../i18n/calendarLocale';
export type TournamentGridBookingEditorProps = {
    isOpen: boolean;
    onClose: () => void;
    tournamentId: string;
    bookingId: string;
    courtDisplayName: string;
    editingBookingData: any;
    onGridRefresh?: () => void;
    onMoveToHidden?: (bookingId: string) => Promise<void>;
    onMoveToVisible?: (bookingId: string) => Promise<void>;
    isOnHiddenCourt?: boolean;
    vvStyle: React.CSSProperties;
};

function formatPlayerElo(elo: number | null | undefined): string {
  if (elo == null || Number.isNaN(Number(elo))) return '—';
  return String(Math.round(Number(elo)));
}

function inscriptionLabel(ins: TournamentInscription): string {
    const a = ins.players_1;
    const b = ins.players_2;
    const n1 = a ? `${a.first_name} ${a.last_name || ''}`.trim() : '';
    const n2 = b ? `${b.first_name} ${b.last_name || ''}`.trim() : '';
    if (n1 && n2) return `${n1} / ${n2}`;
    return n1 || n2 || 'Inscripción';
}

export const TournamentGridBookingEditor: React.FC<TournamentGridBookingEditorProps> = ({
    isOpen,
    onClose,
    tournamentId,
    bookingId,
    courtDisplayName,
    editingBookingData,
    onGridRefresh,
    onMoveToHidden,
    onMoveToVisible,
    isOnHiddenCourt,
    vvStyle,
}) => {
    const { t, i18n } = useGrillaTranslation();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inscriptions, setInscriptions] = useState<TournamentInscription[]>([]);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [normas, setNormas] = useState('');
    const [prizeEuros, setPrizeEuros] = useState('');
    const [inscriptionEuros, setInscriptionEuros] = useState('');
    const [maxPlayers, setMaxPlayers] = useState(16);
    const [visibility, setVisibility] = useState<'public' | 'private'>('public');
    const [gender, setGender] = useState<'' | 'male' | 'female' | 'mixed'>('');
    const [eloMin, setEloMin] = useState('');
    const [eloMax, setEloMax] = useState('');
    const [bookingDate, setBookingDate] = useState('');
    const [startHour, setStartHour] = useState('10');
    const [startMinute, setStartMinute] = useState('00');
    const [durationMin, setDurationMin] = useState(90);

    const [inviteEmail1, setInviteEmail1] = useState('');
    const [inviteEmail2, setInviteEmail2] = useState('');
    const [inviteBusy, setInviteBusy] = useState(false);

    const [cancelReason, setCancelReason] = useState('');
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const [moveErr, setMoveErr] = useState<string | null>(null);
    const [movingHidden, setMovingHidden] = useState(false);

    const [rightPanelTab, setRightPanelTab] = useState<'participantes' | 'chat' | 'solicitudes'>('participantes');
    const [divisionsDetail, setDivisionsDetail] = useState<TournamentDivisionRow[]>([]);
    const [levelMode, setLevelMode] = useState<string | undefined>(undefined);
    const [pendingEntryRequestsCount, setPendingEntryRequestsCount] = useState(0);

    const [chatMessages, setChatMessages] = useState<TournamentChatMessage[]>([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [chatDraft, setChatDraft] = useState('');
    const [sendingChat, setSendingChat] = useState(false);

    const [entryRequests, setEntryRequests] = useState<TournamentEntryRequest[]>([]);
    const [entryRequestsLoading, setEntryRequestsLoading] = useState(false);
    const [entryActionLoadingId, setEntryActionLoadingId] = useState<string | null>(null);
    const [entryApproveDivisionId, setEntryApproveDivisionId] = useState('');
    const [entryRejectOpen, setEntryRejectOpen] = useState(false);
    const [entryRejectTargetId, setEntryRejectTargetId] = useState<string | null>(null);
    const [entryRejectMessage, setEntryRejectMessage] = useState('');
    const [entryFullModalRequestId, setEntryFullModalRequestId] = useState<string | null>(null);

    const loadEntryRequests = useCallback(async () => {
        setEntryRequestsLoading(true);
        try {
            const list = await tournamentsService.listEntryRequests(tournamentId);
            setEntryRequests(list);
            setPendingEntryRequestsCount(list.filter((r) => r.status === 'pending').length);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudieron cargar las solicitudes');
            setEntryRequests([]);
        } finally {
            setEntryRequestsLoading(false);
        }
    }, [tournamentId]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const d = await tournamentsService.detail(tournamentId);
            const tr = d.tournament;
            setDivisionsDetail(d.divisions ?? []);
            setLevelMode(tr.level_mode ?? undefined);
            setPendingEntryRequestsCount(Number(tr.pending_entry_requests_count ?? 0));
            setInscriptions(d.inscriptions ?? []);
            setName(tr.name ?? '');
            setDescription(tr.description ?? '');
            setNormas(tr.normas ?? '');
            setPrizeEuros(tr.prize_total_cents != null ? String(tr.prize_total_cents / 100) : '');
            setInscriptionEuros(String((Number(tr.price_cents) || 0) / 100).replace('.', ','));
            setMaxPlayers(tr.max_players ?? 16);
            setVisibility(tr.visibility === 'private' ? 'private' : 'public');
            const g = tr.gender;
            setGender(g === 'male' || g === 'female' || g === 'mixed' ? g : '');
            setEloMin(tr.elo_min != null ? String(tr.elo_min) : '');
            setEloMax(tr.elo_max != null ? String(tr.elo_max) : '');

            const st = new Date(tr.start_at);
            setBookingDate(
                `${st.getUTCFullYear()}-${String(st.getUTCMonth() + 1).padStart(2, '0')}-${String(st.getUTCDate()).padStart(2, '0')}`,
            );
            const totalM = st.getUTCHours() * 60 + st.getUTCMinutes();
            const rounded = Math.round(totalM / 30) * 30;
            const rh = Math.min(23, Math.floor(rounded / 60));
            const rm = rounded % 60;
            setStartHour(String(rh).padStart(2, '0'));
            setStartMinute(rm === 30 ? '30' : '00');
            setDurationMin(tr.duration_min ?? 90);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'No se pudo cargar el torneo');
        } finally {
            setLoading(false);
        }
    }, [tournamentId]);

    useEffect(() => {
        if (!isOpen) return;
        load();
    }, [isOpen, load]);

    useEffect(() => {
        if (isOpen) setRightPanelTab('participantes');
    }, [isOpen, tournamentId]);

    useEffect(() => {
        if (!isOpen || rightPanelTab !== 'chat') return;
        let cancelled = false;
        setChatLoading(true);
        void (async () => {
            try {
                const list = await tournamentsService.listChat(tournamentId);
                if (!cancelled) setChatMessages(list);
            } catch {
                if (!cancelled) setChatMessages([]);
            } finally {
                if (!cancelled) setChatLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, rightPanelTab, tournamentId]);

    useEffect(() => {
        if (!isOpen || rightPanelTab !== 'chat') return;
        const key = `chat_read_${tournamentId}`;
        localStorage.setItem(key, new Date().toISOString());
    }, [isOpen, rightPanelTab, tournamentId]);

    useEffect(() => {
        if (!isOpen || rightPanelTab !== 'solicitudes') return;
        void loadEntryRequests();
    }, [isOpen, rightPanelTab, tournamentId, loadEntryRequests]);

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutes = ['00', '30'];
    const durationOptions = [30, 60, 90, 120, 150, 180];

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const startIso = `${bookingDate}T${startHour}:${startMinute}:00.000Z`;
            const prizeCents = Math.max(0, Math.round((parseFloat(prizeEuros.replace(',', '.')) || 0) * 100));
            const inscriptionCents = Math.max(0, Math.round((parseFloat(inscriptionEuros.replace(',', '.')) || 0) * 100));
            await tournamentsService.update(tournamentId, {
                name: name.trim() || null,
                description: description.trim() || null,
                normas: normas.trim() || null,
                start_at: startIso,
                duration_min: durationMin,
                prize_total_cents: prizeCents,
                price_cents: inscriptionCents,
                max_players: Math.max(2, maxPlayers),
                visibility,
                gender: gender === '' ? null : gender,
                elo_min: eloMin.trim() === '' ? null : Number(eloMin),
                elo_max: eloMax.trim() === '' ? null : Number(eloMax),
            });
            onGridRefresh?.();
            onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const handleInvite = async () => {
        const e1 = inviteEmail1.trim();
        if (!e1) {
            setError('Indica al menos un email');
            return;
        }
        setInviteBusy(true);
        setError(null);
        try {
            await tournamentsService.invite(tournamentId, [
                { email_1: e1, email_2: inviteEmail2.trim() || undefined },
            ]);
            setInviteEmail1('');
            setInviteEmail2('');
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error al invitar');
        } finally {
            setInviteBusy(false);
        }
    };

    const handleRemoveInscription = async (inscriptionId: string) => {
        if (!window.confirm('¿Quitar esta inscripción del torneo?')) return;
        setError(null);
        try {
            await tournamentsService.removeInscription(tournamentId, inscriptionId);
            await load();
            onGridRefresh?.();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error al quitar participante');
        }
    };

    const handleCancelTournament = async () => {
        setCancelling(true);
        setError(null);
        try {
            await tournamentsService.cancel(tournamentId, cancelReason.trim() || undefined);
            onGridRefresh?.();
            onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'No se pudo cancelar el torneo');
        } finally {
            setCancelling(false);
            setShowCancelConfirm(false);
        }
    };

    if (!isOpen) return null;

    const formattedCreated = editingBookingData?.created_at
        ? new Date(editingBookingData.created_at).toLocaleDateString(calendarLocale(i18n.language), {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : null;

    return (
        <div
            style={vvStyle}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 transition-opacity duration-300"
        >
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative flex flex-col w-full h-[90vh] bg-gray-50 rounded-t-3xl shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-[900px] sm:rounded-2xl overflow-hidden">
                <div className="flex items-start justify-between px-6 py-4 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex flex-col gap-2 min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">Torneo en grilla</h2>
                        <p className="text-sm text-gray-600 truncate">{courtDisplayName}</p>
                        {formattedCreated && (
                            <span className="text-[11px] text-gray-400">Reserva creada el {formattedCreated}</span>
                        )}
                        {error && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium">
                                <AlertTriangle size={13} className="shrink-0" />
                                {error}
                            </div>
                        )}
                        {moveErr && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700 font-medium">
                                <AlertTriangle size={13} className="shrink-0" />
                                {moveErr}
                            </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={() => handleSave()}
                                disabled={saving || loading}
                                className="px-4 py-1.5 bg-[#006A6A] text-white text-xs font-bold rounded-md hover:bg-[#005151] disabled:opacity-50 transition-colors"
                            >
                                {saving ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-md hover:bg-gray-300 transition-colors"
                            >
                                {t('reservation.cancel')}
                            </button>
                            {isOnHiddenCourt && onMoveToVisible && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setMoveErr(null);
                                        setMovingHidden(true);
                                        try {
                                            await onMoveToVisible(bookingId);
                                            onClose();
                                        } catch (err: unknown) {
                                            setMoveErr(err instanceof Error ? err.message : 'Error al desocultar');
                                        } finally {
                                            setMovingHidden(false);
                                        }
                                    }}
                                    disabled={movingHidden}
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-[#005bc5] text-white text-xs font-bold rounded-md hover:bg-[#004fa8] disabled:opacity-50"
                                >
                                    <Eye size={14} />
                                    {movingHidden ? '…' : 'Desocultar'}
                                </button>
                            )}
                            {!isOnHiddenCourt && onMoveToHidden && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setMoveErr(null);
                                        setMovingHidden(true);
                                        try {
                                            await onMoveToHidden(bookingId);
                                            onClose();
                                        } catch (err: unknown) {
                                            setMoveErr(err instanceof Error ? err.message : 'Error al ocultar');
                                        } finally {
                                            setMovingHidden(false);
                                        }
                                    }}
                                    disabled={movingHidden}
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-600 text-white text-xs font-bold rounded-md hover:bg-gray-700 disabled:opacity-50"
                                >
                                    <EyeOff size={14} />
                                    {movingHidden ? '…' : 'Ocultar'}
                                </button>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-gray-400 transition-colors bg-gray-100 rounded-full hover:bg-gray-200 hover:text-gray-600 flex-shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-16 text-gray-500 text-sm font-medium">Cargando torneo…</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Datos del torneo</h3>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700">Nombre del torneo</span>
                                    <input
                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700">Descripción</span>
                                    <textarea
                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm h-24 resize-none"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700">Reglas / normas</span>
                                    <textarea
                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm h-24 resize-none"
                                        value={normas}
                                        onChange={(e) => setNormas(e.target.value)}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700">Premio (bolsa total, €)</span>
                                    <input
                                        type="text"
                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm"
                                        value={prizeEuros}
                                        onChange={(e) => setPrizeEuros(e.target.value)}
                                        placeholder="0"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700">Máx. jugadores</span>
                                    <input
                                        type="number"
                                        min={2}
                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm"
                                        value={maxPlayers}
                                        onChange={(e) => setMaxPlayers(Number(e.target.value) || 2)}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700">Precio inscripción (€)</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm"
                                        value={inscriptionEuros}
                                        onChange={(e) => setInscriptionEuros(e.target.value)}
                                        placeholder="0"
                                    />
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="block">
                                        <span className="text-sm font-bold text-gray-700">Elo mín.</span>
                                        <input
                                            type="number"
                                            className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm"
                                            value={eloMin}
                                            onChange={(e) => setEloMin(e.target.value)}
                                            placeholder="—"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-sm font-bold text-gray-700">Elo máx.</span>
                                        <input
                                            type="number"
                                            className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm"
                                            value={eloMax}
                                            onChange={(e) => setEloMax(e.target.value)}
                                            placeholder="—"
                                        />
                                    </label>
                                </div>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700">Visibilidad</span>
                                    <select
                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm"
                                        value={visibility}
                                        onChange={(e) => setVisibility(e.target.value === 'private' ? 'private' : 'public')}
                                    >
                                        <option value="public">Público</option>
                                        <option value="private">Privado</option>
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700">Categoría (género)</span>
                                    <select
                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm"
                                        value={gender}
                                        onChange={(e) => setGender(e.target.value as typeof gender)}
                                    >
                                        <option value="">Sin restricción</option>
                                        <option value="male">Masculino</option>
                                        <option value="female">Femenino</option>
                                        <option value="mixed">Mixto</option>
                                    </select>
                                </label>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Horario en grilla</h3>
                                <p className="text-xs text-gray-500">
                                    Al guardar se actualiza el torneo y las reservas de pista vinculadas (mismo tramo en todas
                                    las pistas del torneo).
                                </p>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700">Fecha</span>
                                    <input
                                        type="date"
                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm"
                                        value={bookingDate}
                                        onChange={(e) => setBookingDate(e.target.value)}
                                    />
                                </label>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-700 w-24">Inicio</span>
                                    <select
                                        className="p-2 border border-gray-300 rounded-md text-sm"
                                        value={startHour}
                                        onChange={(e) => setStartHour(e.target.value)}
                                    >
                                        {hours.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                    <span>:</span>
                                    <select
                                        className="p-2 border border-gray-300 rounded-md text-sm"
                                        value={startMinute}
                                        onChange={(e) => setStartMinute(e.target.value)}
                                    >
                                        {minutes.map((m) => (
                                            <option key={m} value={m}>
                                                {m}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700">Duración (min)</span>
                                    <select
                                        className="mt-1 w-full p-2 border border-gray-300 rounded-md text-sm"
                                        value={durationMin}
                                        onChange={(e) => setDurationMin(Number(e.target.value))}
                                    >
                                        {durationOptions.map((d) => (
                                            <option key={d} value={d}>
                                                {d}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <div className="pt-4 border-t border-gray-200">
                                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center gap-2">
                                        <UserPlus size={16} />
                                        Invitar participantes
                                    </h3>
                                    <input
                                        type="email"
                                        className="mt-2 w-full p-2 border border-gray-300 rounded-md text-sm"
                                        placeholder="Email 1"
                                        value={inviteEmail1}
                                        onChange={(e) => setInviteEmail1(e.target.value)}
                                    />
                                    <input
                                        type="email"
                                        className="mt-2 w-full p-2 border border-gray-300 rounded-md text-sm"
                                        placeholder="Email 2 (pareja, opcional)"
                                        value={inviteEmail2}
                                        onChange={(e) => setInviteEmail2(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleInvite}
                                        disabled={inviteBusy}
                                        className="mt-2 px-4 py-1.5 bg-[#0f766e] text-white text-xs font-bold rounded-md hover:bg-[#0d5c56] disabled:opacity-50"
                                    >
                                        {inviteBusy ? 'Enviando…' : 'Enviar invitación'}
                                    </button>
                                </div>

                                <div className="pt-4 border-t border-gray-200 space-y-2">
                                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                                        Inscritos, chat y solicitudes
                                    </h3>
                                    <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                                        <button
                                            type="button"
                                            onClick={() => setRightPanelTab('participantes')}
                                            className={`flex-1 min-w-[5.5rem] px-2 py-1.5 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1 transition ${
                                                rightPanelTab === 'participantes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            <Users className="w-3.5 h-3.5 shrink-0" />
                                            Inscritos
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRightPanelTab('chat')}
                                            className={`relative flex-1 min-w-[5.5rem] px-2 py-1.5 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1 transition ${
                                                rightPanelTab === 'chat' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                                            Chat
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRightPanelTab('solicitudes')}
                                            className={`relative flex-1 min-w-[5.5rem] px-2 py-1.5 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1 transition ${
                                                rightPanelTab === 'solicitudes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            <Inbox className="w-3.5 h-3.5 shrink-0" />
                                            Solicitudes
                                            {pendingEntryRequestsCount > 0 && (
                                                <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-3.5 px-0.5 bg-amber-500 text-white text-[8px] font-black rounded-full border border-white flex items-center justify-center">
                                                    {pendingEntryRequestsCount > 9 ? '9+' : pendingEntryRequestsCount}
                                                </span>
                                            )}
                                        </button>
                                    </div>

                                    {rightPanelTab === 'participantes' && (
                                        <div className="h-[min(260px,36vh)] min-h-[200px] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-2">
                                            <ul className="space-y-2">
                                                {inscriptions
                                                    .filter((i) => i.status !== 'cancelled' && i.status !== 'rejected')
                                                    .map((ins) => (
                                                        <li
                                                            key={ins.id}
                                                            className="flex items-center justify-between gap-2 text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                                                        >
                                                            <span className="truncate">{inscriptionLabel(ins)}</span>
                                                            <span className="text-[10px] uppercase text-gray-400 shrink-0">{ins.status}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveInscription(ins.id)}
                                                                className="text-red-600 text-xs font-bold shrink-0 hover:underline"
                                                            >
                                                                Quitar
                                                            </button>
                                                        </li>
                                                    ))}
                                                {inscriptions.filter((i) => i.status !== 'cancelled' && i.status !== 'rejected').length === 0 && (
                                                    <li className="text-xs text-gray-500 py-4 text-center">Nadie inscrito todavía.</li>
                                                )}
                                            </ul>
                                        </div>
                                    )}

                                    {rightPanelTab === 'chat' && (
                                        <div className="flex h-[min(260px,36vh)] min-h-[200px] flex-col rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-2">
                                                {chatLoading && <p className="text-xs text-gray-500">Cargando chat…</p>}
                                                {!chatLoading && chatMessages.length === 0 && (
                                                    <p className="text-xs text-gray-500">Aún no hay mensajes.</p>
                                                )}
                                                {chatMessages.map((msg) => (
                                                    <div key={msg.id} className="rounded-lg bg-white border border-gray-100 px-2.5 py-1.5">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-xs font-semibold text-gray-900 truncate">{msg.author_name}</p>
                                                            <p className="text-[10px] text-gray-400 shrink-0">
                                                                {new Date(msg.created_at).toLocaleTimeString([], {
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                })}
                                                            </p>
                                                        </div>
                                                        <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap break-words">{msg.message}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="shrink-0 border-t border-gray-200 bg-white p-2 flex gap-2">
                                                <input
                                                    value={chatDraft}
                                                    onChange={(e) => setChatDraft(e.target.value)}
                                                    placeholder="Escribe un mensaje…"
                                                    className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={sendingChat}
                                                    onClick={async () => {
                                                        if (!chatDraft.trim()) return;
                                                        setSendingChat(true);
                                                        try {
                                                            await tournamentsService.sendChat(tournamentId, chatDraft.trim());
                                                            setChatDraft('');
                                                            setChatMessages(await tournamentsService.listChat(tournamentId));
                                                        } catch (e) {
                                                            toast.error(e instanceof Error ? e.message : 'No se pudo enviar');
                                                        } finally {
                                                            setSendingChat(false);
                                                        }
                                                    }}
                                                    className="shrink-0 px-3 py-1.5 rounded-lg bg-[#006A6A] text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1"
                                                >
                                                    {sendingChat && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                    Enviar
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {rightPanelTab === 'solicitudes' && (
                                        <div className="flex h-[min(260px,36vh)] min-h-[200px] flex-col rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                                            <div className="shrink-0 space-y-2 p-2 border-b border-gray-100 bg-gray-50/95">
                                                <p className="text-[11px] text-gray-600">
                                                    Solicitudes cuando el jugador no cumple el Elo u otras reglas automáticas.
                                                </p>
                                                {levelMode === 'multi_division' && divisionsDetail.length > 0 && (
                                                    <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-2 py-1.5 space-y-1">
                                                        <p className="text-[10px] font-semibold text-amber-900">Categoría al aprobar</p>
                                                        <select
                                                            value={entryApproveDivisionId}
                                                            onChange={(e) => setEntryApproveDivisionId(e.target.value)}
                                                            className="w-full rounded-md border border-amber-200 bg-white px-2 py-1 text-[11px]"
                                                        >
                                                            <option value="">Automática según Elo</option>
                                                            {divisionsDetail.map((d) => (
                                                                <option key={d.id} value={d.id}>
                                                                    {d.label} ({d.code})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-2">
                                                {entryRequestsLoading && <p className="text-xs text-gray-500">Cargando…</p>}
                                                {!entryRequestsLoading && entryRequests.length === 0 && (
                                                    <p className="text-xs text-gray-500">No hay solicitudes.</p>
                                                )}
                                                {!entryRequestsLoading &&
                                                    entryRequests.map((er) => {
                                                        const p = er.request_player;
                                                        const name = p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : 'Jugador';
                                                        const isPending = er.status === 'pending';
                                                        return (
                                                            <div key={er.id} className="rounded-lg bg-white border border-gray-100 p-2.5 space-y-1.5">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0">
                                                                        <p className="text-xs font-bold text-gray-900 truncate">{name}</p>
                                                                        {p ? (
                                                                            <p className="text-[10px] text-gray-500">
                                                                                Elo {formatPlayerElo(p.elo_rating)} · {p.email ?? '—'}
                                                                            </p>
                                                                        ) : null}
                                                                    </div>
                                                                    <span
                                                                        className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
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
                                                                            ? 'Pend.'
                                                                            : er.status === 'approved'
                                                                              ? 'Ok'
                                                                              : er.status === 'rejected'
                                                                                ? 'No'
                                                                                : 'Visto'}
                                                                    </span>
                                                                </div>
                                                                <p className="text-[11px] text-gray-700 whitespace-pre-wrap break-words">{er.message}</p>
                                                                {isPending && (
                                                                    <div className="flex flex-wrap gap-1 pt-0.5">
                                                                        <button
                                                                            type="button"
                                                                            disabled={entryActionLoadingId === er.id}
                                                                            onClick={async () => {
                                                                                const divPayload =
                                                                                    levelMode === 'multi_division' && entryApproveDivisionId
                                                                                        ? { division_id: entryApproveDivisionId }
                                                                                        : {};
                                                                                setEntryActionLoadingId(er.id);
                                                                                try {
                                                                                    await tournamentsService.approveEntryRequest(
                                                                                        tournamentId,
                                                                                        er.id,
                                                                                        divPayload
                                                                                    );
                                                                                    toast.success('Solicitud aprobada');
                                                                                    await loadEntryRequests();
                                                                                    await load();
                                                                                    onGridRefresh?.();
                                                                                } catch (e) {
                                                                                    if (
                                                                                        e instanceof HttpError &&
                                                                                        e.status === 409 &&
                                                                                        e.code === 'tournament_full'
                                                                                    ) {
                                                                                        setEntryFullModalRequestId(er.id);
                                                                                        toast.message('Torneo lleno', { description: e.message });
                                                                                    } else {
                                                                                        toast.error(e instanceof Error ? e.message : 'No se pudo aprobar');
                                                                                    }
                                                                                } finally {
                                                                                    setEntryActionLoadingId(null);
                                                                                }
                                                                            }}
                                                                            className="px-2 py-1 rounded-md bg-green-600 text-white text-[10px] font-bold disabled:opacity-50 inline-flex items-center gap-1"
                                                                        >
                                                                            {entryActionLoadingId === er.id && (
                                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                                            )}
                                                                            Aprobar
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={entryActionLoadingId === er.id}
                                                                            onClick={() => {
                                                                                setEntryRejectTargetId(er.id);
                                                                                setEntryRejectMessage('');
                                                                                setEntryRejectOpen(true);
                                                                            }}
                                                                            className="px-2 py-1 rounded-md border border-red-200 text-red-700 text-[10px] font-bold"
                                                                        >
                                                                            Rechazar
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={entryActionLoadingId === er.id}
                                                                            onClick={async () => {
                                                                                setEntryActionLoadingId(er.id);
                                                                                try {
                                                                                    await tournamentsService.dismissEntryRequest(tournamentId, er.id);
                                                                                    toast.success('Dejada en visto');
                                                                                    await loadEntryRequests();
                                                                                    await load();
                                                                                    onGridRefresh?.();
                                                                                } catch (err) {
                                                                                    toast.error(err instanceof Error ? err.message : 'Error');
                                                                                } finally {
                                                                                    setEntryActionLoadingId(null);
                                                                                }
                                                                            }}
                                                                            className="px-2 py-1 rounded-md bg-gray-100 text-gray-700 text-[10px] font-bold"
                                                                        >
                                                                            En visto
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-white">
                    {!showCancelConfirm ? (
                        <button
                            type="button"
                            onClick={() => setShowCancelConfirm(true)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                        >
                            <Trash2 size={15} />
                            Cancelar torneo
                        </button>
                    ) : (
                        <div className="flex flex-col gap-3 p-4 bg-red-50 border border-red-200 rounded-lg max-w-lg">
                            <p className="text-sm font-bold text-red-700">
                                Se cancelará el torneo, las inscripciones y las reservas de pista vinculadas.
                            </p>
                            <input
                                type="text"
                                className="w-full p-2 border border-red-200 rounded-md text-sm"
                                placeholder="Motivo (opcional)"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                            />
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={handleCancelTournament}
                                    disabled={cancelling}
                                    className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-md hover:bg-red-700 disabled:opacity-50"
                                >
                                    {cancelling ? 'Cancelando…' : 'Confirmar cancelación'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setShowCancelConfirm(false); setCancelReason(''); }}
                                    disabled={cancelling}
                                    className="px-4 py-1.5 bg-white text-gray-700 text-xs font-bold border border-gray-300 rounded-md"
                                >
                                    Volver
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {entryRejectOpen && entryRejectTargetId && (
                    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/40 p-4">
                        <div className="w-full max-w-md rounded-2xl bg-white border border-gray-100 shadow-xl p-4 space-y-3">
                            <p className="text-sm font-bold text-gray-900">Rechazar solicitud</p>
                            <textarea
                                value={entryRejectMessage}
                                onChange={(e) => setEntryRejectMessage(e.target.value)}
                                rows={3}
                                placeholder="Mensaje opcional…"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEntryRejectOpen(false);
                                        setEntryRejectTargetId(null);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-xs font-semibold"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={entryActionLoadingId === entryRejectTargetId}
                                    onClick={async () => {
                                        const rid = entryRejectTargetId;
                                        if (!rid) return;
                                        setEntryActionLoadingId(rid);
                                        try {
                                            await tournamentsService.rejectEntryRequest(tournamentId, rid, entryRejectMessage.trim() || undefined);
                                            toast.success('Solicitud rechazada');
                                            setEntryRejectOpen(false);
                                            setEntryRejectTargetId(null);
                                            setEntryRejectMessage('');
                                            await loadEntryRequests();
                                            await load();
                                            onGridRefresh?.();
                                        } catch (e) {
                                            toast.error(e instanceof Error ? e.message : 'No se pudo rechazar');
                                        } finally {
                                            setEntryActionLoadingId(null);
                                        }
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                    {entryActionLoadingId === entryRejectTargetId && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {entryFullModalRequestId && (
                    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/40 p-4">
                        <div className="w-full max-w-md rounded-2xl bg-white border border-amber-100 shadow-xl p-4 space-y-3">
                            <p className="text-sm font-bold text-amber-900">Torneo lleno</p>
                            <p className="text-xs text-gray-700">
                                El torneo completó cupos mientras aprobabas. Rechaza con mensaje o deja la solicitud en visto.
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
                                        if (!rid) return;
                                        setEntryActionLoadingId(rid);
                                        try {
                                            await tournamentsService.dismissEntryRequest(tournamentId, rid);
                                            toast.success('Solicitud en visto');
                                            setEntryFullModalRequestId(null);
                                            await loadEntryRequests();
                                            await load();
                                            onGridRefresh?.();
                                        } catch (e) {
                                            toast.error(e instanceof Error ? e.message : 'Error');
                                        } finally {
                                            setEntryActionLoadingId(null);
                                        }
                                    }}
                                    className="px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1"
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

                {saving && (
                    <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-[110]">
                        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow border border-gray-100">
                            <div className="w-5 h-5 border-2 border-[#006A6A] border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm font-bold text-gray-900">Guardando…</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
