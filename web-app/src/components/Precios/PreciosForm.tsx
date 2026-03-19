import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageSpinner } from '../Layout/PageSpinner';
import { toast } from 'sonner';
import { apiFetchWithAuth } from '../../services/api';
import { RESERVATION_TYPES } from '../../services/reservationTypePrices';

const TYPE_LABELS: Record<string, string> = {
  standard: 'Pista privada',
  open_match: 'Partido abierto',
  pozo: 'Pozo / Americanas',
  fixed_recurring: 'Turno fijo',
  school_group: 'Escuela — clase grupal',
  school_individual: 'Escuela — clase particular',
  flat_rate: 'Tarifa plana',
  tournament: 'Torneo',
  blocked: 'Bloqueo administrativo',
};

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

/** Formulario que usa apiFetchWithAuth directamente para evitar problemas con el servicio */
export function PreciosForm({ clubId }: PreciosFormProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    apiFetchWithAuth<{ ok: boolean; prices?: Record<string, { price_per_hour_cents: number }> }>(
      `/reservation-type-prices?club_id=${encodeURIComponent(clubId)}`,
      { signal: controller.signal }
    )
      .then((res) => {
        if (cancelled) return;
        if (!res?.ok || !res.prices) {
          setPrices({});
          return;
        }
        const next: Record<string, number> = {};
        for (const type of RESERVATION_TYPES) {
          next[type] = res.prices?.[type]?.price_per_hour_cents ?? 0;
        }
        setPrices(next);
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Error al cargar');
        toast.error('Error al cargar los datos');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [clubId]);

  const handleChange = (type: string, value: string) => {
    const cents = parseEurToCents(value);
    setPrices((prev) => ({ ...prev, [type]: Math.max(0, cents) }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubId) return;
    setSaving(true);
    try {
      const res = await apiFetchWithAuth<{ ok: boolean }>('/reservation-type-prices', {
        method: 'PUT',
        body: JSON.stringify({ club_id: clubId, prices }),
      });
      if (res?.ok) {
        toast.success(t('save_success'));
      } else {
        throw new Error('Error al guardar');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error_saving'));
    } finally {
      setSaving(false);
    }
  };

  if (!clubId) return null;

  if (loading) {
    return <PageSpinner />;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {RESERVATION_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-gray-600 w-40 shrink-0 truncate">
                {TYPE_LABELS[type] ?? type}
              </label>
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={formatCentsToEur(prices[type] ?? 0)}
                  onChange={(e) => handleChange(type, e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#E31E24]/30 focus:border-[#E31E24]/30"
                />
                <span className="text-[10px] text-gray-400 shrink-0">€/h</span>
              </div>
            </div>
          ))}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 w-full py-3 rounded-xl bg-[#E31E24] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70 hover:bg-[#c41a1f]"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> {t('club_settings_save')}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
