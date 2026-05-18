import { useState, useEffect, useRef } from 'react';
import { Loader2, Save, Trash2, Lock, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageSpinner } from '../Layout/PageSpinner';
import { toast } from 'sonner';
import { reservationTypePricesService, type ReservationTypeConfig } from '../../services/reservationTypePrices';

function formatCentsToEur(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function parseEurToCents(value: string): number {
  const cleaned = value.replace(',', '.').replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

interface PreciosFormProps {
  clubId: string | null;
}

export function PreciosForm({ clubId }: PreciosFormProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeConfigs, setTypeConfigs] = useState<ReservationTypeConfig[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [colors, setColors] = useState<Record<string, string>>({});
  const [allowOnline, setAllowOnline] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Custom types creation form state
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#3b82f6');
  const [newTypePrice, setNewTypePrice] = useState('0,00');
  const [creatingCustom, setCreatingCustom] = useState(false);

  const fetchTypePrices = async (clubId: string) => {
    try {
      const data = await reservationTypePricesService.getByClub(clubId);
      const configs = Object.entries(data).map(([type, entry]) => ({
        ...entry,
        reservation_type: type,
      })).sort((a, b) => {
        if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
        return (a.sort_order ?? 100) - (b.sort_order ?? 100);
      });
      setTypeConfigs(configs);

      const nextPrices: Record<string, number> = {};
      const nextColors: Record<string, string> = {};
      const nextAllow: Record<string, boolean> = {};
      for (const c of configs) {
        nextPrices[c.reservation_type] = c.price_per_hour_cents;
        nextColors[c.reservation_type] = c.color ?? '#6b7280';
        nextAllow[c.reservation_type] = c.allow_online;
      }
      setPrices(nextPrices);
      setColors(nextColors);
      setAllowOnline(nextAllow);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : t('precios_load_error'));
      toast.error(t('precios_load_error'));
    }
  };

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const controller = new AbortController();

    fetchTypePrices(clubId)
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; controller.abort(); };
  }, [clubId]);

  const handleChange = (type: string, value: string) => {
    setPrices((prev) => ({ ...prev, [type]: Math.max(0, parseEurToCents(value)) }));
  };

  const handleColorChange = (type: string, value: string) => {
    setColors((prev) => ({ ...prev, [type]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubId) return;
    setSaving(true);
    try {
      const updated = await reservationTypePricesService.update(clubId, prices, colors, allowOnline);
      const configs = Object.entries(updated).map(([type, entry]) => ({
        ...entry,
        reservation_type: type,
      })).sort((a, b) => {
        if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
        return (a.sort_order ?? 100) - (b.sort_order ?? 100);
      });
      setTypeConfigs(configs);
      toast.success(t('save_success'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error_saving'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCustomType = async () => {
    if (!clubId || !newTypeName.trim()) return;
    setCreatingCustom(true);
    try {
      const cents = parseEurToCents(newTypePrice);
      const updated = await reservationTypePricesService.createCustomType(clubId, {
        display_name: newTypeName.trim(),
        color: newTypeColor,
        price_per_hour_cents: cents,
      });

      const configs = Object.entries(updated).map(([type, entry]) => ({
        ...entry,
        reservation_type: type,
      })).sort((a, b) => {
        if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
        return (a.sort_order ?? 100) - (b.sort_order ?? 100);
      });
      setTypeConfigs(configs);

      const nextPrices: Record<string, number> = {};
      const nextColors: Record<string, string> = {};
      const nextAllow: Record<string, boolean> = {};
      for (const c of configs) {
        nextPrices[c.reservation_type] = c.price_per_hour_cents;
        nextColors[c.reservation_type] = c.color ?? '#6b7280';
        nextAllow[c.reservation_type] = c.allow_online;
      }
      setPrices(nextPrices);
      setColors(nextColors);
      setAllowOnline(nextAllow);

      setNewTypeName('');
      setNewTypePrice('0,00');
      toast.success('Tipo de reserva personalizado creado con éxito');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear tipo de reserva');
    } finally {
      setCreatingCustom(false);
    }
  };

  const handleDeleteCustomType = async (type: string) => {
    if (!clubId) return;
    const confirmDelete = window.confirm(
      '¿Estás seguro de que deseas eliminar este tipo de reserva personalizado? Solo se puede eliminar si no hay reservas activas asociadas.'
    );
    if (!confirmDelete) return;

    try {
      const updated = await reservationTypePricesService.deleteCustomType(clubId, type);
      const configs = Object.entries(updated).map(([type, entry]) => ({
        ...entry,
        reservation_type: type,
      })).sort((a, b) => {
        if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
        return (a.sort_order ?? 100) - (b.sort_order ?? 100);
      });
      setTypeConfigs(configs);

      const nextPrices: Record<string, number> = {};
      const nextColors: Record<string, string> = {};
      const nextAllow: Record<string, boolean> = {};
      for (const c of configs) {
        nextPrices[c.reservation_type] = c.price_per_hour_cents;
        nextColors[c.reservation_type] = c.color ?? '#6b7280';
        nextAllow[c.reservation_type] = c.allow_online;
      }
      setPrices(nextPrices);
      setColors(nextColors);
      setAllowOnline(nextAllow);

      toast.success('Tipo de reserva personalizado eliminado con éxito');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar tipo de reserva');
    }
  };

  if (!clubId) return null;
  if (loading) return <PageSpinner />;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      <form onSubmit={handleSave} className="space-y-4">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          «Online» = el jugador puede reservar este tipo desde la app/web. Pista privada y partido abierto suelen estar activos; el resto suele ser solo recepción.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {typeConfigs.map((c) => {
            const type = c.reservation_type;
            const label = c.is_system ? t(`reservation_type_${type}`) : c.display_name;
            const currentColor = colors[type] ?? c.color ?? '#6b7280';

            return (
              <div key={type} className="flex items-center gap-2 flex-wrap bg-gray-50/30 p-2.5 rounded-xl border border-gray-50">
                <div className="w-36 shrink-0 truncate flex items-center gap-1" title={c.is_system ? "Tipo del sistema" : undefined}>
                  {c.is_system ? (
                    <Lock className="w-3 h-3 text-gray-400 shrink-0" />
                  ) : null}
                  <span className="text-[11px] font-semibold text-gray-700 truncate" title={label}>
                    {label}
                  </span>
                </div>

                <label className="flex items-center gap-1 text-[10px] text-gray-500 shrink-0 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allowOnline[type] ?? false}
                    onChange={(e) =>
                      setAllowOnline((prev) => ({ ...prev, [type]: e.target.checked }))
                    }
                    className="rounded border-gray-300 text-[#E31E24] focus:ring-[#E31E24]"
                  />
                  Online
                </label>

                <div className="flex-1 flex items-center gap-1.5 min-w-[140px]">
                  <input
                    type="color"
                    ref={(el) => { colorInputRefs.current[type] = el; }}
                    value={currentColor}
                    onChange={(e) => handleColorChange(type, e.target.value)}
                    className="sr-only"
                    aria-label={`Color ${label}`}
                  />
                  <button
                    type="button"
                    onClick={() => colorInputRefs.current[type]?.click()}
                    title="Cambiar color en la grilla"
                    className="w-7 h-7 rounded-lg border-2 border-white shadow ring-1 ring-gray-200 shrink-0 transition-transform hover:scale-110 active:scale-95"
                    style={{ backgroundColor: currentColor }}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatCentsToEur(prices[type] ?? 0)}
                    onChange={(e) => handleChange(type, e.target.value)}
                    placeholder={t('precios_input_placeholder')}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#E31E24]/30 focus:border-[#E31E24]/30"
                  />
                  <span className="text-[10px] text-gray-400 shrink-0">{t('precios_price_suffix')}</span>

                  {!c.is_system ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomType(type)}
                      title="Eliminar tipo de reserva"
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sección de creación de tipo personalizado */}
        <div className="mt-6 pt-5 border-t border-gray-100">
          <h4 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-[#E31E24]" />
            <span>Crear nuevo tipo de reserva personalizado</span>
          </h4>
          <div className="flex flex-wrap items-end gap-3 bg-gray-50/50 rounded-2xl border border-gray-100 p-4">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-[10px] font-medium text-gray-500 block">Nombre del tipo</label>
              <input
                type="text"
                placeholder="Ej: Liga Interna, Clase Prueba"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#E31E24]/30 focus:border-[#E31E24]/30"
              />
            </div>
            <div className="w-24 space-y-1">
              <label className="text-[10px] font-medium text-gray-500 block">Precio/Hora</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={newTypePrice}
                onChange={(e) => setNewTypePrice(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#E31E24]/30 focus:border-[#E31E24]/30"
              />
            </div>
            <div className="w-16 space-y-1 flex flex-col items-center">
              <label className="text-[10px] font-medium text-gray-500 block text-center">Color</label>
              <div className="flex items-center">
                <input
                  type="color"
                  value={newTypeColor}
                  onChange={(e) => setNewTypeColor(e.target.value)}
                  className="w-8 h-8 rounded-lg border-2 border-white shadow cursor-pointer"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={creatingCustom || !newTypeName.trim()}
              onClick={handleCreateCustomType}
              className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold transition-all hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5 h-[38px]"
            >
              {creatingCustom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>+ Agregar</span>}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-4 w-full py-3 rounded-xl bg-[#E31E24] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70 hover:bg-[#c41a1f] transition-all"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</>
          ) : (
            <><Save className="w-4 h-4" /> {t('club_settings_save')}</>
          )}
        </button>
      </form>
    </div>
  );
}

