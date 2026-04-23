import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Loader2, Check, X, Tag, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import {
  getTariffCalendar,
  createTariff,
  updateTariff,
  deleteTariff,
  saveTariffDefaults,
  putDayOverride,
  deleteDayOverride,
  type Tariff,
  type CalendarDay,
  type TariffDefaults,
} from '../../services/tariffs';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const TARIFF_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

function formatCents(cents: number | null): string {
  if (cents == null) return '—';
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

type Tab = 'tarifas' | 'calendario';
type EditingTariff = { id?: string; name: string; price_cents: number; is_blocking: boolean };

interface Props {
  clubId: string;
}

export function TarifasCalendar({ clubId }: Props) {
  const today = new Date();
  const [activeTab, setActiveTab] = useState<Tab>('tarifas');

  // ── Shared data ──
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [defaults, setDefaults] = useState<TariffDefaults | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Tab: Gestión de tarifas ──
  const [editing, setEditing] = useState<EditingTariff | null>(null);
  const [savingTariff, setSavingTariff] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);

  // ── Tab: Gestión del calendario ──
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTariffCalendar(clubId, year, month);
      if (res.ok) {
        setTariffs(res.tariffs);
        setDays(res.days);
        setDefaults(res.defaults);
      }
    } catch {
      toast.error('Error al cargar las tarifas');
    } finally {
      setLoading(false);
    }
  }, [clubId, year, month]);

  useEffect(() => { load(); }, [load]);

  // ── Helpers ──
  const colorForTariff = (id: string | null) => {
    if (!id) return null;
    const idx = tariffs.findIndex(t => t.id === id);
    return TARIFF_COLORS[idx % TARIFF_COLORS.length] ?? '#6b7280';
  };

  const firstDow = days[0]?.dow ?? 1;
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // ── Tariff CRUD ──
  const openCreate = () => setEditing({ name: '', price_cents: 0, is_blocking: false });
  const openEdit = (t: Tariff) => setEditing({ id: t.id, name: t.name, price_cents: t.price_cents, is_blocking: t.is_blocking });

  const handleSaveTariff = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSavingTariff(true);
    try {
      if (editing.id) {
        await updateTariff(editing.id, { name: editing.name, price_cents: editing.price_cents, is_blocking: editing.is_blocking });
      } else {
        await createTariff({ club_id: clubId, name: editing.name, price_cents: editing.price_cents, is_blocking: editing.is_blocking });
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al guardar tarifa');
    } finally {
      setSavingTariff(false);
    }
  };

  const handleDeleteTariff = async (id: string) => {
    if (!confirm('¿Eliminar esta tarifa? Se quitará de todos los días asignados.')) return;
    setDeletingId(id);
    try {
      await deleteTariff(id);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Defaults ──
  const handleSaveDefaults = async (weekday_tariff_id: string | null, weekend_tariff_id: string | null) => {
    setSavingDefaults(true);
    try {
      await saveTariffDefaults({ club_id: clubId, weekday_tariff_id, weekend_tariff_id });
      await load();
      toast.success('Valores por defecto guardados');
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al guardar');
    } finally {
      setSavingDefaults(false);
    }
  };

  // ── Day override ──
  const handleSetOverride = async (date: string, tariff_id: string | null) => {
    setSavingOverride(true);
    try {
      if (tariff_id) {
        await putDayOverride({ club_id: clubId, date, tariff_id });
      } else {
        await deleteDayOverride(clubId, date);
      }
      setSelectedDate(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al guardar');
    } finally {
      setSavingOverride(false);
    }
  };

  // ── Render ──
  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl mb-6">
        <button
          onClick={() => setActiveTab('tarifas')}
          className={[
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
            activeTab === 'tarifas'
              ? 'bg-white text-[#1A1A1A] shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          ].join(' ')}
        >
          <Tag className="w-4 h-4" />
          Gestión de tarifas
        </button>
        <button
          onClick={() => setActiveTab('calendario')}
          className={[
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
            activeTab === 'calendario'
              ? 'bg-white text-[#1A1A1A] shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          ].join(' ')}
        >
          <CalendarDays className="w-4 h-4" />
          Gestión del calendario
        </button>
      </div>

      {/* ────────────────────────────────────────────────
          TAB 1: Gestión de tarifas
      ──────────────────────────────────────────────── */}
      {activeTab === 'tarifas' && (
        <div className="space-y-5">
          {/* Tariff list */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#1A1A1A]">Tarifas definidas</h2>
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E31E24] text-white text-xs font-bold hover:bg-[#c41a1f] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Nueva tarifa
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            )}

            {!loading && tariffs.length === 0 && !editing && (
              <p className="text-xs text-gray-400 text-center py-6">
                Sin tarifas. Crea una para poder asignarla al calendario.
              </p>
            )}

            {!loading && (
              <div className="space-y-2">
                {tariffs.map((tariff, idx) => (
                  <div key={tariff.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: TARIFF_COLORS[idx % TARIFF_COLORS.length] }}
                    />
                    <span className="flex-1 text-sm font-medium text-[#1A1A1A] truncate">{tariff.name}</span>
                    <span className="text-xs text-gray-500 shrink-0">{formatCents(tariff.price_cents)}/h</span>
                    {tariff.is_blocking && (
                      <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full shrink-0">Bloquea</span>
                    )}
                    <button
                      onClick={() => openEdit(tariff)}
                      className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button
                      onClick={() => handleDeleteTariff(tariff.id)}
                      disabled={deletingId === tariff.id}
                      className="p-1 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deletingId === tariff.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
                        : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                    </button>
                  </div>
                ))}

                {/* Create / Edit form */}
                {editing && (
                  <div className="flex flex-col gap-2 px-3 py-3 rounded-xl border border-[#E31E24]/30 bg-red-50/30 mt-2">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Nombre de la tarifa"
                      value={editing.name}
                      onChange={e => setEditing(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#E31E24]/30 focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step={100}
                        placeholder="Precio en céntimos"
                        value={editing.price_cents}
                        onChange={e => setEditing(prev => prev ? { ...prev, price_cents: Math.max(0, Number(e.target.value)) } : null)}
                        className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#E31E24]/30 focus:outline-none"
                      />
                      <span className="text-xs text-gray-400 shrink-0 min-w-[70px]">
                        = {formatCents(editing.price_cents)}/h
                      </span>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editing.is_blocking}
                        onChange={e => setEditing(prev => prev ? { ...prev, is_blocking: e.target.checked } : null)}
                        className="rounded"
                      />
                      Bloquea reservas en días asignados
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveTariff}
                        disabled={savingTariff}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-bold disabled:opacity-60"
                      >
                        {savingTariff ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        {editing.id ? 'Actualizar' : 'Crear tarifa'}
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs hover:bg-gray-200 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Defaults */}
          {!loading && tariffs.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="text-sm font-bold text-[#1A1A1A] mb-1">Tarifa por defecto</h2>
              <p className="text-xs text-gray-400 mb-4">
                Se aplica automáticamente a todos los días sin override específico.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(['weekday', 'weekend'] as const).map((kind) => {
                  const field = kind === 'weekday' ? 'weekday_tariff_id' : 'weekend_tariff_id';
                  const currentId = defaults?.[field] ?? null;
                  return (
                    <div key={kind}>
                      <p className="text-[11px] text-gray-500 mb-1.5 font-semibold">
                        {kind === 'weekday' ? '📅 Lunes – Viernes' : '🏖 Sábado – Domingo'}
                      </p>
                      <select
                        value={currentId ?? ''}
                        onChange={e => {
                          const val = e.target.value || null;
                          handleSaveDefaults(
                            kind === 'weekday' ? val : (defaults?.weekday_tariff_id ?? null),
                            kind === 'weekend' ? val : (defaults?.weekend_tariff_id ?? null),
                          );
                        }}
                        disabled={savingDefaults}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-[#E31E24]/30 focus:outline-none disabled:opacity-60"
                      >
                        <option value="">Sin tarifa por defecto</option>
                        {tariffs.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} — {formatCents(t.price_cents)}/h
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────
          TAB 2: Gestión del calendario
      ──────────────────────────────────────────────── */}
      {activeTab === 'calendario' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          {tariffs.length === 0 && !loading && (
            <div className="text-center py-10">
              <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-1">Sin tarifas creadas</p>
              <p className="text-xs text-gray-400">
                Ve a la pestaña <strong>Gestión de tarifas</strong> y crea al menos una tarifa para asignarla al calendario.
              </p>
            </div>
          )}

          {(tariffs.length > 0 || loading) && (
            <>
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); }}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <h2 className="text-sm font-bold text-[#1A1A1A]">
                  {MONTH_NAMES[month - 1]} {year}
                </h2>
                <button
                  onClick={() => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); }}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {/* Day names header */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAY_NAMES.map(d => (
                      <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
                    ))}
                  </div>

                  {/* Days grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: startOffset }).map((_, i) => <div key={`pad-${i}`} />)}

                    {days.map(day => {
                      const color = colorForTariff(day.tariff_id);
                      const isToday = day.date === todayStr;
                      const isSelected = day.date === selectedDate;
                      const isOverride = day.origin === 'override';

                      return (
                        <button
                          key={day.date}
                          onClick={() => setSelectedDate(prev => prev === day.date ? null : day.date)}
                          className={[
                            'relative flex flex-col items-center justify-start pt-1 pb-1.5 rounded-xl text-center transition-all min-h-[54px]',
                            isSelected
                              ? 'ring-2 ring-[#E31E24] bg-red-50'
                              : 'hover:bg-gray-50',
                            day.is_blocking ? 'opacity-40' : '',
                          ].join(' ')}
                          title={day.tariff_name
                            ? `${day.tariff_name} — ${formatCents(day.avg_price_cents)}`
                            : 'Sin tarifa asignada'}
                        >
                          <span className={[
                            'text-xs leading-none mb-1',
                            isToday
                              ? 'w-5 h-5 flex items-center justify-center rounded-full bg-[#E31E24] text-white font-bold'
                              : 'text-gray-700',
                          ].join(' ')}>
                            {new Date(`${day.date}T00:00:00Z`).getUTCDate()}
                          </span>

                          {color && (
                            <span
                              className="w-4/5 h-1.5 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                          )}

                          {day.tariff_name && (
                            <span className="text-[8px] text-gray-400 leading-none mt-0.5 truncate w-full px-0.5">
                              {day.tariff_name}
                            </span>
                          )}

                          {isOverride && (
                            <span
                              className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400"
                              title="Override manual"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Day override picker */}
                  {selectedDate && (
                    <div className="mt-5 border-t border-gray-100 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-[#1A1A1A]">
                          {new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString('es-ES', {
                            weekday: 'long', day: 'numeric', month: 'long',
                          })}
                        </p>
                        <button
                          onClick={() => setSelectedDate(null)}
                          className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <X className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {/* Remove override */}
                        <button
                          onClick={() => handleSetOverride(selectedDate, null)}
                          disabled={savingOverride}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          <X className="w-3.5 h-3.5 shrink-0" />
                          <span>Usar defecto</span>
                        </button>

                        {tariffs.map((tariff, idx) => {
                          const dayData = days.find(d => d.date === selectedDate);
                          const isActive = dayData?.tariff_id === tariff.id && dayData?.origin === 'override';
                          return (
                            <button
                              key={tariff.id}
                              onClick={() => handleSetOverride(selectedDate, tariff.id)}
                              disabled={savingOverride}
                              className={[
                                'flex items-center gap-2 px-3 py-2 rounded-xl border text-xs text-left transition-all disabled:opacity-50',
                                isActive
                                  ? 'border-[#E31E24] bg-red-50 font-semibold text-[#E31E24]'
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-[#1A1A1A]',
                              ].join(' ')}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: TARIFF_COLORS[idx % TARIFF_COLORS.length] }}
                              />
                              <span className="truncate">{tariff.name}</span>
                              {isActive && <Check className="w-3 h-3 ml-auto shrink-0" />}
                            </button>
                          );
                        })}
                      </div>

                      {savingOverride && (
                        <p className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando...
                        </p>
                      )}
                    </div>
                  )}

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-100 flex-wrap">
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                      Override manual
                    </span>
                    {tariffs.map((t, idx) => (
                      <span key={t.id} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: TARIFF_COLORS[idx % TARIFF_COLORS.length] }}
                        />
                        {t.name}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
