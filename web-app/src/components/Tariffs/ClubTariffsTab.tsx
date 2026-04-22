import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Tag,
    Plus,
    Pencil,
    Trash2,
    Loader2,
    ChevronLeft,
    ChevronRight,
    CalendarDays,
    Check,
    Ban,
    X,
    Clock,
    Undo2,
    Redo2,
    RotateCcw,
    AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageSpinner } from '../Layout/PageSpinner';
import { courtService } from '../../services/court';
import type { Court } from '../../types/court';
import { reservationTypePricesService } from '../../services/reservationTypePrices';
import {
    listTariffs,
    createTariff,
    updateTariff,
    deleteTariff,
    getTariffCalendar,
    getDaySchedule,
    saveDaySchedule,
    repeatDaySchedule,
    resetMonthSchedule,
    type Tariff,
    type CalendarDay,
    type DaySlotEntry,
} from '../../services/tariffs';

type Props = { clubId: string | null; clubResolved: boolean };

type ActiveSection = 'tarifas' | 'calendario';

const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// ---------- Grid constants ----------

// 1-hour slots from 07:00 to 23:00
const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 23; h++) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
}

const CELL_COLORS = [
    { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
    { bg: 'bg-blue-100',    text: 'text-blue-800',    border: 'border-blue-300'    },
    { bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-300'   },
    { bg: 'bg-purple-100',  text: 'text-purple-800',  border: 'border-purple-300'  },
    { bg: 'bg-pink-100',    text: 'text-pink-800',    border: 'border-pink-300'    },
    { bg: 'bg-cyan-100',    text: 'text-cyan-800',    border: 'border-cyan-300'    },
    { bg: 'bg-orange-100',  text: 'text-orange-800',  border: 'border-orange-300'  },
    { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-300'     },
] as const;

type CellColor = (typeof CELL_COLORS)[number];

function fmtPrice(cents: number) {
    return (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

// ---------- Tariff form (inline card) ----------

function TariffForm({
    initial,
    onSave,
    onCancel,
}: {
    initial?: Tariff;
    onSave: (name: string, priceCents: number, isBlocking: boolean) => Promise<void>;
    onCancel: () => void;
}) {
    const [name, setName] = useState(initial?.name ?? '');
    const [priceEur, setPriceEur] = useState(initial ? String((initial.price_cents / 100).toFixed(2)) : '0.00');
    const [isBlocking, setIsBlocking] = useState(initial?.is_blocking ?? false);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        const cents = Math.round(parseFloat(priceEur.replace(',', '.')) * 100);
        if (!Number.isFinite(cents) || cents < 0) {
            toast.error('Precio inválido');
            return;
        }
        setSaving(true);
        try {
            await onSave(name.trim(), cents, isBlocking);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Nombre
                    </label>
                    <input
                        autoFocus
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ej: Tarifa normal, Festivo..."
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Precio (€/hora)
                    </label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={priceEur}
                        onChange={(e) => setPriceEur(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                    />
                </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                    onClick={() => setIsBlocking((v) => !v)}
                    className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                        isBlocking ? 'bg-red-500' : 'bg-gray-300'
                    }`}
                >
                    <div
                        className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                            isBlocking ? 'translate-x-4' : 'translate-x-0'
                        }`}
                    />
                </div>
                <span className="text-xs font-semibold text-gray-700">
                    Bloquea reservas{' '}
                    <span className="font-normal text-gray-400">(los días asignados a esta tarifa no admiten reservas)</span>
                </span>
            </label>

            <div className="flex gap-2 justify-end pt-1">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={!name.trim() || saving}
                    className="px-4 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-bold hover:bg-[#333] disabled:opacity-40 flex items-center gap-1.5"
                >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {initial ? 'Guardar cambios' : 'Crear tarifa'}
                </button>
            </div>
        </form>
    );
}

// ---------- Main tab ----------

export const ClubTariffsTab: React.FC<Props> = ({ clubId, clubResolved }) => {
    const [section, setSection] = useState<ActiveSection>('tarifas');

    if (!clubResolved) return <PageSpinner />;
    if (!clubId) return <p className="text-sm text-gray-500 text-center py-12">No se encontró el club</p>;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <Tag className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[#1A1A1A]">Tarifas del club</h2>
                        <p className="text-xs text-gray-400">Define tarifas y asígnalas al calendario</p>
                    </div>
                </div>

                {/* Section switcher */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                    {(['tarifas', 'calendario'] as ActiveSection[]).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setSection(s)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all capitalize ${
                                section === s
                                    ? 'bg-white text-[#1A1A1A] shadow-sm'
                                    : 'text-gray-500 hover:text-[#1A1A1A]'
                            }`}
                        >
                            {s === 'tarifas' ? 'Tarifas' : 'Calendario'}
                        </button>
                    ))}
                </div>
            </div>

            {section === 'tarifas' ? (
                <TarifasSection clubId={clubId} />
            ) : (
                <CalendarioSection clubId={clubId} />
            )}
        </div>
    );
};

// ---------- Tarifas section ----------

function TarifasSection({ clubId }: { clubId: string }) {
    const [tariffs, setTariffs] = useState<Tariff[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { tariffs: ts } = await listTariffs(clubId);
            setTariffs(ts);
        } catch {
            toast.error('Error al cargar tarifas');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async (name: string, priceCents: number, isBlocking: boolean) => {
        const res = await createTariff({ club_id: clubId, name, price_cents: priceCents, is_blocking: isBlocking });
        setTariffs((prev) => [...prev, res.tariff].sort((a, b) => a.name.localeCompare(b.name)));
        setShowCreate(false);
        toast.success('Tarifa creada');
    };

    const handleUpdate = async (id: string, name: string, priceCents: number, isBlocking: boolean) => {
        const res = await updateTariff(id, { name, price_cents: priceCents, is_blocking: isBlocking });
        setTariffs((prev) =>
            prev.map((t) => (t.id === id ? res.tariff : t)).sort((a, b) => a.name.localeCompare(b.name)),
        );
        setEditingId(null);
        toast.success('Tarifa actualizada');
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteTariff(id);
            setTariffs((prev) => prev.filter((t) => t.id !== id));
            toast.success('Tarifa eliminada');
        } catch {
            toast.error('Error al eliminar la tarifa. Puede que esté en uso.');
        } finally {
            setDeletingId(null);
        }
    };



    if (loading) return <PageSpinner />;

    return (
        <div className="space-y-6">
            {/* Tariff list */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#1A1A1A]">Tarifas definidas</h3>
                    {!showCreate && (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#E31E24] text-white hover:opacity-90 active:scale-95"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Nueva tarifa
                        </button>
                    )}
                </div>

                {showCreate && (
                    <TariffForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />
                )}

                {tariffs.length === 0 && !showCreate ? (
                    <div className="text-center py-12">
                        <Tag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">No hay tarifas definidas</p>
                        <p className="text-xs text-gray-300 mt-1">Crea una tarifa para empezar</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {tariffs.map((t) =>
                            editingId === t.id ? (
                                <TariffForm
                                    key={t.id}
                                    initial={t}
                                    onSave={(name, cents, blocking) => handleUpdate(t.id, name, cents, blocking)}
                                    onCancel={() => setEditingId(null)}
                                />
                            ) : (
                                <TariffRow
                                    key={t.id}
                                    tariff={t}
                                    onEdit={() => setEditingId(t.id)}
                                    onDelete={() => setDeletingId(t.id)}
                                />
                            ),
                        )}
                    </div>
                )}
            </div>



            {/* Delete confirm */}
            {deletingId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 p-5 shadow-xl">
                        <p className="text-sm font-semibold text-[#1A1A1A] mb-1">¿Eliminar tarifa?</p>
                        <p className="text-xs text-gray-500 mb-4">
                            {tariffs.find((t) => t.id === deletingId)?.name}
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setDeletingId(null)}
                                className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDelete(deletingId)}
                                className="px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function TariffRow({
    tariff,
    onEdit,
    onDelete,
}: {
    tariff: Tariff;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-100 bg-white hover:bg-gray-50 group">
            <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    tariff.is_blocking ? 'bg-red-50' : 'bg-emerald-50'
                }`}
            >
                {tariff.is_blocking ? (
                    <Ban className="w-4 h-4 text-red-500" />
                ) : (
                    <Tag className="w-4 h-4 text-emerald-500" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1A1A1A] truncate">{tariff.name}</p>
                <p className="text-xs text-gray-400">
                    {fmtPrice(tariff.price_cents)}
                    {tariff.is_blocking && (
                        <span className="ml-2 text-red-500 font-semibold">· Bloquea reservas</span>
                    )}
                </p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={onEdit}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                    title="Editar"
                >
                    <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={onDelete}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    title="Eliminar"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}

// ---------- Day tariff grid modal ----------

function DayTariffModal({
    day,
    clubId,
    tariffs,
    cellColorMap,
    monthDays,
    flatRateCents,
    onRepeat,
    onClose,
}: {
    day: CalendarDay;
    clubId: string;
    tariffs: Tariff[];
    cellColorMap: Record<string, CellColor>;
    monthDays: CalendarDay[];
    flatRateCents: number | null;
    onRepeat: (targetDates: string[]) => Promise<void>;
    onClose: () => void;
}) {
    const [courts, setCourts] = useState<Court[]>([]);
    const [loadingCourts, setLoadingCourts] = useState(true);
    // key = "courtId:HH:MM" → tariff_id
    const [painted, setPainted] = useState<Record<string, string>>({});
    // undo / redo stacks
    const [history, setHistory] = useState<Record<string, string>[]>([]);
    const [future, setFuture] = useState<Record<string, string>[]>([]);
    const [activePaint, setActivePaint] = useState<string>(tariffs[0]?.id ?? '');
    const [saving, setSaving] = useState(false);
    const [cloneActiveId, setCloneActiveId] = useState<string | null>(null);
    const [activeRepeat, setActiveRepeat] = useState<string | null>(null);
    // savedDate: the date that has been successfully persisted this session
    const [savedDate, setSavedDate] = useState<string | null>(null);
    const [loadingSchedule, setLoadingSchedule] = useState(true);
    // edit mode & dirty tracking
    const [editMode, setEditMode] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);

    // A day is "blank" when it has never been saved in this session AND has no painted cells
    const isBlank = savedDate !== day.date && Object.keys(painted).length === 0;

    // Past date check
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const isPast = day.date < todayStr;

    useEffect(() => {
        courtService.getAll(clubId)
            .then((cs) => setCourts(cs.filter((c) => c.status !== 'closed')))
            .catch(() => toast.error('Error al cargar pistas'))
            .finally(() => setLoadingCourts(false));
    }, [clubId]);

    // Load existing schedule for this day
    useEffect(() => {
        setLoadingSchedule(true);
        getDaySchedule(clubId, day.date)
            .then(({ slots }) => {
                if (slots.length > 0) {
                    const initial: Record<string, string> = {};
                    slots.forEach((s: DaySlotEntry) => {
                        // PostgreSQL 'time' type returns "HH:MM:SS" — normalize to "HH:MM"
                        const slot = s.slot.substring(0, 5);
                        initial[cellKey(s.court_id, slot)] = s.tariff_id;
                    });
                    setPainted(initial);
                    // Mark as already persisted so Repetir buttons are immediately available
                    setSavedDate(day.date);
                }
            })
            .catch(() => toast.error('Error al cargar franjas existentes'))
            .finally(() => setLoadingSchedule(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clubId, day.date]);

    // Keyboard shortcuts: Ctrl+Z (undo) / Ctrl+Y or Ctrl+Shift+Z (redo)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
            if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const commit = (next: Record<string, string>, prev: Record<string, string>) => {
        setHistory((h) => [...h.slice(-49), prev]); // max 50 entries
        setFuture([]);
        setPainted(next);
        setIsDirty(true);
    };

    const handleUndo = () => {
        setHistory((h) => {
            if (h.length === 0) return h;
            const prev = h[h.length - 1];
            setFuture((f) => [...f, painted]);
            setPainted(prev);
            return h.slice(0, -1);
        });
    };

    const handleRedo = () => {
        setFuture((f) => {
            if (f.length === 0) return f;
            const next = f[f.length - 1];
            setHistory((h) => [...h, painted]);
            setPainted(next);
            return f.slice(0, -1);
        });
    };

    const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('es-ES', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });

    const cellKey = (courtId: string, slot: string) => `${courtId}:${slot}`;

    const handleCellClick = (courtId: string, slot: string) => {
        // Prevent changes to past dates
        if (isPast) return;
        // Allow painting in editMode, on a blank day (first-time setup), or while there are unsaved changes
        if (!editMode && !isBlank && !isDirty) return;
        const key = cellKey(courtId, slot);
        const next = { ...painted };
        if (!activePaint) { delete next[key]; } else { next[key] = activePaint; }
        commit(next, painted);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // cellKey format: "courtId:HH:MM" → slot = last 5 chars, courtId = slice(0, -6)
            const slots: DaySlotEntry[] = Object.entries(painted).map(([key, tariffId]) => ({
                court_id: key.slice(0, -6),  // remove ":HH:MM" (6 chars)
                slot: key.slice(-5),          // "HH:MM"
                tariff_id: tariffId,
            }));
            await saveDaySchedule(clubId, day.date, slots);
            setSavedDate(day.date);
            setIsDirty(false);
            toast.success(`Franjas de ${new Date(day.date + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} guardadas — ahora puedes usar los botones Repetir`);
            // Do NOT close the modal so the user can use the Repeat buttons
        } catch {
            toast.error('Error al guardar las franjas');
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        if (isDirty) { setShowCloseConfirm(true); }
        else { onClose(); }
    };

    const handleClone = (sourceCourtId: string) => {
        if (isPast) return;
        // Build new painted state: copy all slots of source court → every other court
        // Clone is always allowed (even in read-only mode) so the user can load data and
        // propagate it to other courts before hitting Save for the first time.
        const next = { ...painted };
        courts.forEach((court) => {
            if (court.id === sourceCourtId) return;
            TIME_SLOTS.forEach((slot) => {
                const sourceKey = cellKey(sourceCourtId, slot);
                const targetKey = cellKey(court.id, slot);
                if (painted[sourceKey]) {
                    next[targetKey] = painted[sourceKey];
                } else {
                    delete next[targetKey];
                }
            });
        });
        // Use commit so undo works, and isDirty is set → Save button activates
        commit(next, painted);

        // Visual feedback: light the switch briefly, then auto-reset
        setCloneActiveId(sourceCourtId);
        setTimeout(() => setCloneActiveId(null), 700);

        toast.success(`Horario de "${courts.find(c => c.id === sourceCourtId)?.name}" copiado a todas las pistas`);
    };

    // ------- Repeat helpers -------
    type RepeatMode = 'weekday' | 'fri-sun' | 'sat-sun' | 'rest' | 'rest-year';

    const REPEAT_OPTIONS: { mode: RepeatMode; label: string; filter?: (d: CalendarDay) => boolean }[] = [
        {
            mode: 'weekday',
            label: 'Entresemana (este mes)',
            // dow: 0=Dom 1=Lun 2=Mar 3=Mié 4=Jue 5=Vie 6=Sáb
            filter: (d) => [1, 2, 3, 4, 5].includes(d.dow),
        },
        {
            mode: 'fri-sun',
            label: 'Vie–Dom (este mes)',
            filter: (d) => [0, 5, 6].includes(d.dow),
        },
        {
            mode: 'sat-sun',
            label: 'Sáb–Dom (este mes)',
            filter: (d) => [0, 6].includes(d.dow),
        },
        {
            mode: 'rest',
            label: 'Resto del mes',
            filter: (d) => d.date > day.date,
        },
        {
            mode: 'rest-year',
            label: 'Resto del año',
        },
    ];

    const [repeating, setRepeating] = useState(false);

    const handleRepeat = async (mode: RepeatMode) => {
        let targetDates: string[];

        if (mode === 'rest-year') {
            const src = new Date(day.date + 'T00:00:00');
            const yearEnd = new Date(src.getFullYear(), 11, 31);
            const dates: string[] = [];
            const cursor = new Date(src);
            cursor.setDate(cursor.getDate() + 1);
            while (cursor <= yearEnd) {
                dates.push(cursor.toISOString().split('T')[0]);
                cursor.setDate(cursor.getDate() + 1);
            }
            targetDates = dates;
        } else {
            const option = REPEAT_OPTIONS.find(o => o.mode === mode)!;
            targetDates = monthDays
                .filter(d => d.date !== day.date && option.filter!(d))
                .map(d => d.date);
        }

        if (targetDates.length === 0) {
            toast.info('No hay días disponibles para repetir con ese criterio');
            return;
        }

        setRepeating(true);
        setActiveRepeat(mode);
        try {
            await onRepeat(targetDates);
            // onRepeat handles success toast & calendar refresh
        } catch {
            toast.error('Error al repetir la configuración');
        } finally {
            setRepeating(false);
            setActiveRepeat(null);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm pt-14 p-4"
            onClick={handleClose}
        >
            <div
                className="w-full max-w-5xl max-h-[calc(100vh-4rem)] rounded-2xl bg-white flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                            editMode ? 'bg-amber-50' : 'bg-blue-50'
                        }`}>
                            <Clock className={`w-4 h-4 ${editMode ? 'text-amber-500' : 'text-blue-600'}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[#1A1A1A] capitalize">{dateLabel}</h3>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                                {isPast 
                                    ? <span className="text-gray-400 flex items-center gap-1"><Ban className="w-2.5 h-2.5" /> Solo lectura (fecha pasada)</span>
                                    : editMode
                                        ? isDirty
                                            ? <span className="text-amber-500 font-semibold">Editando — hay cambios sin guardar</span>
                                            : <span className="text-amber-400">Modo edición</span>
                                        : isBlank
                                            ? <span className="text-gray-400">Sin datos — pinta franjas o clona una pista y guarda</span>
                                            : isDirty
                                                ? <span className="text-amber-500 font-semibold">Hay cambios sin guardar</span>
                                                : 'Tarifas por franja horaria · solo lectura'
                                }
                            </p>
                        </div>
                    </div>
                    {/* Undo / Redo — only in edit mode */}
                    {editMode && (
                        <div className="flex items-center gap-0.5 mr-2">
                            <button
                                type="button"
                                onClick={handleUndo}
                                disabled={history.length === 0}
                                title="Deshacer (Ctrl+Z)"
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-25 disabled:cursor-not-allowed transition-opacity"
                            >
                                <Undo2 className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={handleRedo}
                                disabled={future.length === 0}
                                title="Rehacer (Ctrl+Y)"
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-25 disabled:cursor-not-allowed transition-opacity"
                            >
                                <Redo2 className="w-4 h-4" />
                            </button>
                            {history.length > 0 && (
                                <span className="text-[9px] text-gray-300 ml-1 tabular-nums">
                                    {history.length}
                                </span>
                            )}
                        </div>
                    )}
                    <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* ── Repeat actions ── */}
                <div className="px-5 py-2 border-b border-indigo-100 bg-indigo-50/60 flex flex-wrap gap-1.5 items-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mr-0.5 whitespace-nowrap">Repetir en:</span>
                    {REPEAT_OPTIONS.map(({ mode, label }) => {
                        // Ready when: day has been saved AND there are no pending edits AND not past
                        const isReady = savedDate === day.date && !isDirty && !isPast;
                        const isRunning = repeating && activeRepeat === mode;
                        return (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => isReady && !repeating && handleRepeat(mode)}
                                title={isPast ? 'No se pueden repetir configuraciones en el pasado' : isReady ? label : isDirty ? 'Guarda los cambios primero' : 'Guarda este día primero'}
                                disabled={!isReady || repeating}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold border transition-all duration-300 whitespace-nowrap ${
                                    !isReady
                                        ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                                        : isRunning
                                            ? 'bg-indigo-500 border-indigo-400 text-white scale-105 shadow-sm shadow-indigo-400/40'
                                            : 'bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-100 hover:border-indigo-400 cursor-pointer'
                                }`}
                            >
                                {isRunning
                                    ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    : <span className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                        !isReady ? 'bg-gray-300' : 'bg-indigo-300'
                                    }`} />
                                }
                                {label}
                            </button>
                        );
                    })}
                    {savedDate !== day.date && (
                        <span className="text-[8px] text-indigo-300 italic ml-1">Guarda primero para habilitar</span>
                    )}
                    {savedDate === day.date && isDirty && (
                        <span className="text-[8px] text-amber-400 italic ml-1">Guarda los cambios para repetir</span>
                    )}
                </div>

                {/* ── Paint palette: active in editMode, when blank, or while there are unsaved changes (AND not past) ── */}
                <div className={`px-5 py-2.5 border-b border-gray-100 flex flex-wrap gap-2 items-center flex-shrink-0 transition-all ${
                    (editMode || isBlank || isDirty) && !isPast ? 'bg-gray-50 opacity-100' : 'bg-gray-50/50 opacity-40 pointer-events-none'
                }`}>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mr-1">Pintar:</span>
                    <button
                        onClick={() => setActivePaint('')}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                            activePaint === ''
                                ? 'bg-gray-700 text-white border-gray-700 shadow-sm'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                        }`}
                    >
                        Borrar
                    </button>
                    {tariffs.map((t) => {
                        const c = cellColorMap[t.id];
                        const isActive = activePaint === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setActivePaint(t.id)}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                    c
                                        ? `${c.bg} ${c.text} ${c.border} ${isActive ? 'ring-2 ring-offset-1 ring-blue-400 shadow-sm' : 'opacity-70 hover:opacity-100'}`
                                        : 'bg-gray-100 text-gray-700 border-gray-200'
                                }`}
                            >
                                {t.is_blocking && <Ban className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />}
                                {t.name}
                                <span className="ml-1.5 opacity-50 font-normal">{fmtPrice(t.price_cents)}</span>
                            </button>
                        );
                    })}
                </div>

                {/* ── Grid ── */}
                <div className="flex-1 overflow-auto">
                    {loadingSchedule || loadingCourts ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                    ) : (
                        <table className="border-collapse w-full text-[11px]">
                            <thead>
                                <tr>
                                    {/* Corner cell */}
                                    <th className="sticky top-0 left-0 z-30 bg-[#1e1e1e] text-white border border-[#444] w-20 min-w-[72px] py-1.5 text-[10px] font-bold uppercase tracking-wider text-center">
                                        Hora
                                    </th>
                                    {courts.map((court) => (
                                        <th
                                            key={court.id}
                                            className="sticky top-0 z-20 bg-[#1e1e1e] text-white border border-[#444] py-1 px-2 text-[10px] font-bold text-center min-w-[100px]"
                                        >
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="whitespace-nowrap">{court.name.toUpperCase()}</span>
                                                {/* Clone switch — always enabled so the user can paint one court
                                     and propagate to the rest before the first Save */}
                                                <button
                                                    type="button"
                                                    disabled={isPast}
                                                    title={isPast ? 'No se puede clonar en una fecha pasada' : `Clonar horario de ${court.name} a todas las pistas`}
                                                    onClick={() => handleClone(court.id)}
                                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold transition-all duration-300 border ${
                                                        isPast 
                                                            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                                            : cloneActiveId === court.id
                                                                ? 'bg-emerald-400 border-emerald-300 text-white scale-105 shadow-md shadow-emerald-500/40'
                                                                : 'bg-white/10 border-white/20 text-white/70 hover:bg-emerald-400/30 hover:border-emerald-300/60 hover:text-white cursor-pointer'
                                                    }`}
                                                >
                                                    <span className={`w-2.5 h-2.5 rounded-full border transition-colors ${
                                                        cloneActiveId === court.id
                                                            ? 'bg-white border-white'
                                                            : 'bg-transparent border-white/50'
                                                    }`} />
                                                    clonar
                                                </button>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {TIME_SLOTS.map((slot, idx) => {
                                    return (
                                        <tr key={slot} className="group/row">
                                            {/* Time label */}
                                            <td
                                                className="sticky left-0 z-10 border-r border-b border-gray-200 text-center py-0 text-[11px] font-bold tabular-nums whitespace-nowrap bg-[#f8f8f8] text-gray-600 h-10 group-hover/row:bg-gray-100 transition-colors"
                                            >
                                                {slot}
                                            </td>
                                            {courts.map((court) => {
                                                const key = cellKey(court.id, slot);
                                                const tariffId = painted[key];
                                                const c = tariffId ? cellColorMap[tariffId] : null;
                                                const tariff = tariffs.find((t) => t.id === tariffId);
                                                // Show flat rate badge only in read mode (not editMode) when cell has no custom tariff
                                                const showFlatRate = !tariff && !editMode && flatRateCents !== null;
                                                return (
                                                    <td
                                                        key={court.id}
                                                        onClick={() => handleCellClick(court.id, slot)}
                                                        title={
                                                            tariff
                                                                ? `${tariff.name} · ${fmtPrice(tariff.price_cents)}`
                                                                : flatRateCents !== null
                                                                    ? `Tarifa Plana · ${fmtPrice(flatRateCents)}`
                                                                    : 'Sin tarifa'
                                                        }
                                                        className={`border border-gray-100 cursor-pointer select-none text-center transition-colors h-10
                                                            ${c
                                                                ? `${c.bg} ${c.text} hover:brightness-95`
                                                                : showFlatRate
                                                                    ? 'bg-amber-50 hover:bg-amber-100'
                                                                    : idx % 2 === 0
                                                                        ? 'bg-white hover:bg-emerald-50'
                                                                        : 'bg-gray-50/50 hover:bg-emerald-50'
                                                            }
                                                        `}
                                                    >
                                                        {tariff ? (
                                                            <div className="flex flex-col items-center justify-center gap-0.5 px-1 leading-none">
                                                                <span className="text-[9px] font-bold truncate w-full text-center">
                                                                    {tariff.name}
                                                                </span>
                                                                <span className="text-[8px] font-medium opacity-70 truncate w-full text-center tabular-nums">
                                                                    {fmtPrice(tariff.price_cents)}
                                                                </span>
                                                            </div>
                                                        ) : showFlatRate ? (
                                                            <div className="flex flex-col items-center justify-center gap-0.5 px-1 leading-none text-amber-700">
                                                                <span className="text-[9px] font-bold truncate w-full text-center">
                                                                    Tarifa Plana
                                                                </span>
                                                                <span className="text-[8px] font-medium opacity-70 truncate w-full text-center tabular-nums">
                                                                    {fmtPrice(flatRateCents)}
                                                                </span>
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 flex-shrink-0">
                    {/* Left: Limpiar (only in edit mode) */}
                    {editMode ? (
                        <button
                            type="button"
                            onClick={() => commit({}, painted)}
                            className="text-[10px] font-semibold text-gray-400 hover:text-red-500 transition-colors"
                        >
                            Limpiar todo
                        </button>
                    ) : (
                        <span />
                    )}

                    <div className="flex gap-2 items-center">
                        {/* Saved indicator (only for non-past days) */}
                        {!isPast && savedDate === day.date && !isDirty && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl">
                                <Check className="w-3 h-3" />
                                Guardado
                            </span>
                        )}

                        {isPast ? (
                            /* Past day footer: elegant read-only treatment */
                            <button
                                type="button"
                                onClick={handleClose}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-200 transition-all"
                            >
                                <X className="w-3.5 h-3.5" />
                                Cerrar
                            </button>
                        ) : (
                        <>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                            {isDirty ? <span className="flex items-center gap-1">Cerrar <span className="text-amber-500">●</span></span> : 'Cerrar'}
                        </button>

                        {(editMode || isDirty) ? (
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || !isDirty}
                                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                                    !isDirty
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        : 'bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-40'
                                }`}
                            >
                                {saving
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Check className="w-3.5 h-3.5" />
                                }
                                {saving ? 'Guardando...' : 'Guardar franjas'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => !isBlank && setEditMode(true)}
                                disabled={isBlank}
                                title={isBlank ? 'Pinta al menos una franja y guarda antes de usar el modo edición' : 'Editar franjas del día'}
                                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                                    isBlank
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                                        : 'bg-blue-500 text-white hover:bg-blue-600'
                                }`}
                            >
                                <Pencil className="w-3.5 h-3.5" />
                                Editar día
                            </button>
                        )}
                        </>
                        )}
                    </div>
                </div>

                {/* ── Unsaved changes confirmation ── */}
                {showCloseConfirm && (
                    <div
                        className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-80 rounded-2xl bg-white shadow-2xl overflow-hidden">
                            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                                    <AlertTriangle className="w-4.5 h-4.5 text-amber-500" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-[#1A1A1A]">Cambios sin guardar</h4>
                                    <p className="text-[10px] text-gray-500 mt-0.5">Tens cambios en las franjas que no fueron guardados</p>
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end px-5 py-4 border-t border-gray-100">
                                <button
                                    onClick={() => setShowCloseConfirm(false)}
                                    className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    Volver a editar
                                </button>
                                <button
                                    onClick={onClose}
                                    className="px-3.5 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 flex items-center gap-1.5"
                                >
                                    <X className="w-3.5 h-3.5" />
                                    Descartar y cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------- Calendar section ----------

function CalendarioSection({ clubId }: { clubId: string }) {
    const today = new Date();
    const navigate = useNavigate();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
    const [days, setDays] = useState<CalendarDay[]>([]);
    const [tariffs, setTariffs] = useState<Tariff[]>([]);
    const [loading, setLoading] = useState(true);
    const [gridDay, setGridDay] = useState<CalendarDay | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [resetting, setResetting] = useState(false);
    // Flat rate price from reservation-type-prices (used as the default price when no custom tariff is set)
    const [flatRateCents, setFlatRateCents] = useState<number | null>(null);

    useEffect(() => {
        reservationTypePricesService.getByClub(clubId)
            .then((prices) => {
                const fr = prices['flat_rate'];
                if (fr?.price_per_hour_cents != null) setFlatRateCents(fr.price_per_hour_cents);
            })
            .catch(() => { /* fail silently — flat rate badge just won't appear */ });
    }, [clubId]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getTariffCalendar(clubId, year, month);
            setDays(res.days);
            setTariffs(res.tariffs);
        } catch {
            toast.error('Error al cargar el calendario');
        } finally {
            setLoading(false);
        }
    }, [clubId, year, month]);

    // Silent refresh: updates data without showing the full-page spinner
    const silentRefresh = useCallback(async () => {
        try {
            const res = await getTariffCalendar(clubId, year, month);
            setDays(res.days);
            setTariffs(res.tariffs);
        } catch {
            // Fail silently — next load() will catch it
        }
    }, [clubId, year, month]);

    useEffect(() => { load(); }, [load]);

    const prevMonth = () => {
        if (month === 1) { setYear((y) => y - 1); setMonth(12); }
        else setMonth((m) => m - 1);
    };
    const nextMonth = () => {
        if (month === 12) { setYear((y) => y + 1); setMonth(1); }
        else setMonth((m) => m + 1);
    };

    const handleResetMonth = async () => {
        setResetting(true);
        try {
            const result = await resetMonthSchedule(clubId, year, month);
            toast.success(`Mes reseteado: ${result.deleted_slots} franjas y ${result.deleted_overrides} overrides eliminados`);
            setShowResetConfirm(false);
            load();
        } catch {
            toast.error('Error al resetear el mes');
        } finally {
            setResetting(false);
        }
    };

    // Build calendar grid (fill leading empty cells)
    const firstDow = days.length > 0 ? days[0].dow : 0; // 0=Sun
    const leadingEmpty = firstDow;

    // Monthly average price across all days that have an avg_price_cents
    const daysWithAvg = days.filter((d) => d.avg_price_cents != null);
    const monthlyAvgCents = daysWithAvg.length > 0
        ? Math.round(daysWithAvg.reduce((acc, d) => acc + d.avg_price_cents!, 0) / daysWithAvg.length)
        : null;

    const tariffColorMap: Record<string, string> = {};
    const cellColorMap: Record<string, CellColor> = {};
    const PALETTE_BG = [
        'bg-emerald-50 border-emerald-200',
        'bg-blue-50 border-blue-200',
        'bg-amber-50 border-amber-200',
        'bg-purple-50 border-purple-200',
        'bg-pink-50 border-pink-200',
        'bg-cyan-50 border-cyan-200',
        'bg-orange-50 border-orange-200',
    ];
    tariffs.forEach((t, i) => {
        tariffColorMap[t.id] = t.is_blocking ? 'bg-red-50 border-red-200' : PALETTE_BG[i % PALETTE_BG.length];
        cellColorMap[t.id] = t.is_blocking
            ? { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' }
            : CELL_COLORS[i % CELL_COLORS.length];
    });

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return (
        <div className="space-y-3">
            {/* Toolbar: Month selection + Legend + Reset */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-2 bg-gray-50/50 rounded-2xl border border-gray-100">
                <div className="flex items-center flex-wrap gap-4">
                    {/* Month Nav Pill */}
                    <div className="flex items-center bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                        <button 
                            onClick={prevMonth} 
                            className="p-2 hover:bg-gray-50 border-r border-gray-100 transition-colors"
                            title="Mes anterior"
                        >
                            <ChevronLeft className="w-4 h-4 text-gray-600" />
                        </button>
                        <div className="flex items-center gap-2 px-3 min-w-[140px] justify-center">
                            <CalendarDays className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-xs font-bold text-[#1A1A1A] tabular-nums whitespace-nowrap">
                                {MONTH_NAMES[month - 1]} {year}
                            </span>
                        </div>
                        <button 
                            onClick={nextMonth} 
                            className="p-2 hover:bg-gray-50 border-l border-gray-100 transition-colors"
                            title="Mes siguiente"
                        >
                            <ChevronRight className="w-4 h-4 text-gray-600" />
                        </button>
                    </div>

                    {/* Divider (hidden on small screens if legend wraps) */}
                    <div className="h-4 w-px bg-gray-200 hidden md:block" />

                    {/* Legend */}
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {/* Dot legend */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                            Tarifa especial
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-300 shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                            Solo por defecto
                        </span>

                        {/* Tarifa Plana — clickable → Precios por Tipo de Reserva */}
                        {flatRateCents !== null && (
                            <button
                                type="button"
                                onClick={() => navigate('/precios')}
                                title="Ver Precios por Tipo de Reserva"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-300 shadow-sm hover:bg-amber-100 hover:border-amber-400 transition-colors cursor-pointer"
                            >
                                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                                Tarifa Plana · {fmtPrice(flatRateCents)}
                            </button>
                        )}

                        {/* Tariff chips */}
                        {tariffs.map((t, i) => (
                            <span
                                key={t.id}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border shadow-sm ${tariffColorMap[t.id] ?? PALETTE_BG[i % PALETTE_BG.length]}`}
                            >
                                {t.is_blocking && <Ban className="w-2.5 h-2.5 text-red-500" />}
                                {t.name}
                            </span>
                        ))}

                        {/* Monthly average price indicator */}
                        {monthlyAvgCents != null && (
                            <>
                                <span className="text-gray-200 text-[9px] mx-0.5">|</span>
                                <span className="text-[9px] font-semibold text-gray-500 whitespace-nowrap">
                                    Precio Promedio Mensual:{' '}
                                    <span className="font-bold text-gray-700">{fmtPrice(monthlyAvgCents)}</span>
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Secondary actions: Reset */}
                {!(year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth() + 1)) && (
                    <button
                        onClick={() => setShowResetConfirm(true)}
                        title="Borrar todas las asignaciones de este mes"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold text-red-500 border border-red-200 bg-white hover:bg-red-50 transition-all shadow-sm active:scale-95"
                    >
                        <RotateCcw className="w-3 h-3" />
                        Resetear mes
                    </button>
                )}
            </div>

            {/* Reset month confirmation modal */}
            {showResetConfirm && (
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={() => !resetting && setShowResetConfirm(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center gap-3 px-6 pt-6 pb-4">
                            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-[#1A1A1A]">Resetear {MONTH_NAMES[month - 1]} {year}</h3>
                                <p className="text-[11px] text-gray-500 mt-0.5">Esta acción es irreversible</p>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-6 pb-5 space-y-3">
                            <p className="text-xs text-gray-700">
                                Se eliminarán <strong>permanentemente</strong> todos los datos de este mes para este club:
                            </p>
                            <ul className="space-y-1.5">
                                <li className="flex items-start gap-2 text-xs text-gray-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                                    Todas las <strong>franjas horarias</strong> configuradas por pista y día
                                </li>
                                <li className="flex items-start gap-2 text-xs text-gray-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                                    Todos los <strong>overrides de tarifa diaria</strong> del mes
                                </li>
                            </ul>
                            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700 font-semibold">
                                ¿Confirmás que querés resetear {MONTH_NAMES[month - 1]} {year} a cero?
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                disabled={resetting}
                                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleResetMonth}
                                disabled={resetting}
                                className="px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {resetting
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <RotateCcw className="w-3.5 h-3.5" />
                                }
                                {resetting ? 'Reseteando...' : 'Sí, resetear el mes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <PageSpinner />
            ) : (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                    {/* Day headers */}
                    <div className="grid grid-cols-7 border-b border-gray-100">
                        {DOW_LABELS.map((d) => (
                            <div key={d} className="py-2 text-center text-[10px] font-bold text-gray-400 uppercase">
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-7">
                        {/* Leading empties */}
                        {Array.from({ length: leadingEmpty }).map((_, i) => (
                            <div key={`empty-${i}`} className="border-r border-b border-gray-50" />
                        ))}

                        {days.map((day) => {
                            const isToday = day.date === todayStr;
                            const isGridOpen = gridDay?.date === day.date;
                            const cellColor = day.tariff_id
                                ? tariffColorMap[day.tariff_id] ?? 'bg-gray-50 border-gray-200'
                                : 'bg-white border-gray-50';

                            const isPastDay = day.date < todayStr;

                            return (
                                <div
                                    key={day.date}
                                    onClick={() => setGridDay(isGridOpen ? null : day)}
                                    className={`border-r border-b border-gray-100 p-1.5 flex flex-col gap-1 min-h-[80px] cursor-pointer transition-all
                                        ${cellColor}
                                        ${isPastDay ? 'opacity-60' : ''}
                                        ${isGridOpen ? 'ring-2 ring-inset ring-blue-400' : 'hover:brightness-95'}
                                    `}
                                >
                                    {/* Day number + indicators */}
                                    <div className="flex items-center justify-between">
                                        <span
                                            className={`text-xs font-bold tabular-nums leading-none ${
                                                isToday
                                                    ? 'w-5 h-5 rounded-full bg-[#E31E24] text-white flex items-center justify-center text-[10px]'
                                                    : isPastDay
                                                        ? 'text-gray-400'
                                                        : 'text-gray-700'
                                            }`}
                                        >
                                            {new Date(day.date + 'T00:00:00').getDate()}
                                        </span>
                                        {/* Indicator dot:
                                            - blue   = day has an override (special tariff)
                                            - yellow = day uses only default tariffs */}
                                        {day.origin === 'override' ? (
                                            <span
                                                className="w-3.5 h-3.5 rounded-full bg-blue-500 flex items-center justify-center shadow-sm shadow-blue-300 ring-1 ring-blue-400/30"
                                                title="Tarifa especial aplicada"
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                            </span>
                                        ) : day.origin === 'default' ? (
                                            <span
                                                className="w-3.5 h-3.5 rounded-full bg-amber-400 flex items-center justify-center shadow-sm shadow-amber-200 ring-1 ring-amber-300/40"
                                                title="Solo tarifas por defecto"
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                            </span>
                                        ) : null}
                                    </div>
                                    {/* Avg price */}
                                    {day.avg_price_cents != null && (
                                        <div className="mt-auto text-right">
                                            <span className="text-[10px] text-gray-500 font-medium">
                                                Medio: {fmtPrice(day.avg_price_cents)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Hourly tariff modal */}
            {gridDay && (
                <DayTariffModal
                    day={gridDay}
                    clubId={clubId}
                    tariffs={tariffs}
                    cellColorMap={cellColorMap}
                    monthDays={days}
                    flatRateCents={flatRateCents}
                    onRepeat={async (targetDates) => {
                        try {
                            const result = await repeatDaySchedule(clubId, gridDay.date, targetDates);
                            toast.success(`Aplicado a ${result.applied} día${result.applied !== 1 ? 's' : ''} (${result.rows_saved} franjas)`);
                            // Silent refresh: update dots behind the modal without spinner
                            await silentRefresh();
                        } catch {
                            toast.error('Error al repetir el horario');
                        }
                    }}
                    onClose={async () => {
                        setGridDay(null);
                        // Refresh dots after closing — no spinner so user sees result immediately
                        await silentRefresh();
                    }}
                />
            )}

            {tariffs.length === 0 && !loading && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 font-semibold">
                    Define al menos una tarifa en la pestaña "Tarifas" antes de configurar el calendario.
                </div>
            )}
        </div>
    );
}
