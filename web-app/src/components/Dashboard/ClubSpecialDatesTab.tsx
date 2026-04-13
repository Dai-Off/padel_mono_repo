import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Plus, RotateCcw, Sun, Ban, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageSpinner } from '../Layout/PageSpinner';
import {
    listSpecialDates,
    createSpecialDate,
    deleteSpecialDate,
    type ClubSpecialDate,
    type SpecialDateType,
} from '../../services/clubSpecialDates';

type Props = { clubId: string | null; clubResolved: boolean };

const TYPE_META: Record<SpecialDateType, { label: string; color: string; bg: string; icon: typeof Sun }> = {
    holiday: { label: 'Festivo', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Sun },
    non_working: { label: 'No laborable', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: Ban },
};

function fmtDate(iso: string) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export const ClubSpecialDatesTab: React.FC<Props> = ({ clubId, clubResolved }) => {
    const [dates, setDates] = useState<ClubSpecialDate[]>([]);
    const [loading, setLoading] = useState(true);
    const [year, setYear] = useState(() => new Date().getFullYear());

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [formDate, setFormDate] = useState('');
    const [formType, setFormType] = useState<SpecialDateType>('holiday');
    const [formReason, setFormReason] = useState('');
    const [saving, setSaving] = useState(false);

    const fetch = useCallback(async () => {
        if (!clubId) return;
        setLoading(true);
        try {
            const res = await listSpecialDates(clubId, year);
            setDates(res.dates);
        } catch {
            toast.error('Error al cargar fechas especiales');
        } finally {
            setLoading(false);
        }
    }, [clubId, year]);

    useEffect(() => { fetch(); }, [fetch]);

    const handleCreate = async () => {
        if (!clubId || !formDate || !formType) return;
        setSaving(true);
        try {
            const res = await createSpecialDate({
                club_id: clubId,
                date: formDate,
                type: formType,
                reason: formReason.trim() || undefined,
            });
            setDates(prev => [...prev, res.entry].sort((a, b) => a.date.localeCompare(b.date)));
            setShowForm(false);
            setFormDate('');
            setFormReason('');
            toast.success(formType === 'holiday' ? 'Día festivo agregado' : 'Día no laborable agregado');
        } catch (err: any) {
            if (err?.status === 409) {
                toast.error('Ya existe una entrada para esa fecha y tipo');
            } else {
                toast.error('Error al crear fecha especial');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleRestore = async (entry: ClubSpecialDate) => {
        try {
            await deleteSpecialDate(entry.id);
            setDates(prev => prev.filter(d => d.id !== entry.id));
            toast.success('Día restaurado como día normal');
        } catch {
            toast.error('Error al restaurar el día');
        }
    };

    if (!clubResolved) return <PageSpinner />;
    if (!clubId) return <p className="text-sm text-gray-500 text-center py-12">No se encontró el club</p>;

    const holidays = dates.filter(d => d.type === 'holiday');
    const nonWorking = dates.filter(d => d.type === 'non_working');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                        <CalendarDays className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[#1A1A1A]">Fechas especiales</h2>
                        <p className="text-xs text-gray-400">Días festivos y no laborables del club</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#E31E24] text-white hover:opacity-90 active:scale-95"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar fecha
                </button>
            </div>

            {/* Year selector */}
            <div className="flex items-center justify-center gap-4">
                <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-gray-100">
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-sm font-bold text-[#1A1A1A] tabular-nums">{year}</span>
                <button onClick={() => setYear(y => y + 1)} className="p-1.5 rounded-lg hover:bg-gray-100">
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
            </div>

            {loading ? (
                <PageSpinner />
            ) : dates.length === 0 ? (
                <div className="text-center py-16">
                    <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No hay fechas especiales para {year}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Non-working days */}
                    <Section
                        title="Días no laborables"
                        subtitle="Las pistas quedarán bloqueadas automáticamente"
                        entries={nonWorking}
                        type="non_working"
                        onRestore={handleRestore}
                    />
                    {/* Holidays */}
                    <Section
                        title="Días festivos"
                        subtitle="Se podrán aplicar reglas de tarifa especial"
                        entries={holidays}
                        type="holiday"
                        onRestore={handleRestore}
                    />
                </div>
            )}

            {/* Create form modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 p-6 shadow-xl space-y-5">
                        <h3 className="text-base font-bold text-[#1A1A1A]">Nueva fecha especial</h3>

                        {/* Date */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha</label>
                            <input
                                type="date"
                                value={formDate}
                                onChange={e => setFormDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            />
                        </div>

                        {/* Type */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-2">Tipo</label>
                            <div className="flex gap-3">
                                {(['holiday', 'non_working'] as SpecialDateType[]).map(t => {
                                    const meta = TYPE_META[t];
                                    const Icon = meta.icon;
                                    const selected = formType === t;
                                    return (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setFormType(t)}
                                            className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                                selected
                                                    ? `${meta.bg} ${meta.color} ring-2 ring-offset-1 ${t === 'holiday' ? 'ring-amber-400' : 'ring-red-400'}`
                                                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                            }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {meta.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Reason */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Motivo (opcional)</label>
                            <input
                                type="text"
                                value={formReason}
                                onChange={e => setFormReason(e.target.value)}
                                placeholder="Ej: Navidad, Obras en el club..."
                                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            />
                        </div>

                        {/* Info box */}
                        {formType === 'non_working' && (
                            <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                                <Ban className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>Los días no laborables bloquearán todas las pistas del club para esa fecha.</span>
                            </div>
                        )}
                        {formType === 'holiday' && (
                            <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
                                <Sun className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>Los días festivos podrán tener tarifas especiales configurables en el futuro.</span>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 justify-end pt-1">
                            <button
                                type="button"
                                onClick={() => { setShowForm(false); setFormDate(''); setFormReason(''); }}
                                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={!formDate || saving}
                                className="px-4 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-bold hover:bg-[#333] disabled:opacity-40 flex items-center gap-1.5"
                            >
                                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

function Section({
    title,
    subtitle,
    entries,
    type,
    onRestore,
}: {
    title: string;
    subtitle: string;
    entries: ClubSpecialDate[];
    type: SpecialDateType;
    onRestore: (e: ClubSpecialDate) => void;
}) {
    const meta = TYPE_META[type];
    const Icon = meta.icon;

    return (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className={`px-4 py-3 border-b ${meta.bg}`}>
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                    <div>
                        <h3 className={`text-sm font-bold ${meta.color}`}>{title}</h3>
                        <p className="text-[10px] text-gray-500">{subtitle}</p>
                    </div>
                    <span className={`ml-auto text-xs font-bold ${meta.color} tabular-nums`}>{entries.length}</span>
                </div>
            </div>
            {entries.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-gray-400">Sin fechas registradas</div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {entries.map(entry => (
                        <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[#1A1A1A] capitalize">{fmtDate(entry.date)}</p>
                                {entry.reason && (
                                    <p className="text-xs text-gray-500 truncate">{entry.reason}</p>
                                )}
                            </div>
                            <button
                                onClick={() => onRestore(entry)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 opacity-0 group-hover:opacity-100 transition-all"
                                title="Restaurar como día normal"
                            >
                                <RotateCcw className="w-3 h-3" />
                                <span>Día normal</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
