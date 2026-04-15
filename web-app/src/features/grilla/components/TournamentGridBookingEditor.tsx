import React, { useCallback, useEffect, useState } from 'react';
import { X, AlertTriangle, EyeOff, Eye, UserPlus, Trash2 } from 'lucide-react';
import { tournamentsService, type TournamentInscription } from '../../../services/tournaments';
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

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const d = await tournamentsService.detail(tournamentId);
            const tr = d.tournament;
            setInscriptions(d.inscriptions ?? []);
            setName(tr.name ?? '');
            setDescription(tr.description ?? '');
            setNormas(tr.normas ?? '');
            setPrizeEuros(tr.prize_total_cents != null ? String(tr.prize_total_cents / 100) : '');
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

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutes = ['00', '30'];
    const durationOptions = [30, 60, 90, 120, 150, 180];

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const startIso = `${bookingDate}T${startHour}:${startMinute}:00.000Z`;
            const prizeCents = Math.max(0, Math.round((parseFloat(prizeEuros.replace(',', '.')) || 0) * 100));
            await tournamentsService.update(tournamentId, {
                name: name.trim() || null,
                description: description.trim() || null,
                normas: normas.trim() || null,
                start_at: startIso,
                duration_min: durationMin,
                prize_total_cents: prizeCents,
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

                                <div className="pt-4 border-t border-gray-200">
                                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Participantes</h3>
                                    <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                                        {inscriptions
                                            .filter((i) => i.status !== 'cancelled' && i.status !== 'rejected')
                                            .map((ins) => (
                                                <li
                                                    key={ins.id}
                                                    className="flex items-center justify-between gap-2 text-sm bg-white border border-gray-200 rounded-md px-3 py-2"
                                                >
                                                    <span className="truncate">{inscriptionLabel(ins)}</span>
                                                    <span className="text-[10px] uppercase text-gray-400 shrink-0">
                                                        {ins.status}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveInscription(ins.id)}
                                                        className="text-red-600 text-xs font-bold shrink-0 hover:underline"
                                                    >
                                                        Quitar
                                                    </button>
                                                </li>
                                            ))}
                                        {inscriptions.filter((i) => i.status !== 'cancelled' && i.status !== 'rejected')
                                            .length === 0 && (
                                            <li className="text-xs text-gray-500">Nadie inscrito todavía.</li>
                                        )}
                                    </ul>
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
                        <div className="flex flex-col gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
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
                            <div className="flex gap-2">
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
