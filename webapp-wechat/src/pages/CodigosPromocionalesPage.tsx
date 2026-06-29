import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Percent, Plus, Tag, Ticket, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ListDataPanel } from '../components/ui/ListDataPanel';
import { PageHeader } from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/PageLoader';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { formatMoney } from '../lib/format';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import {
    createPromoCode,
    deletePromoCode,
    listPromoCodes,
    updatePromoCode,
    type PromoCode,
    type PromoDiscountType,
} from '../services/store';

function KpiCard({
    label,
    value,
    hint,
    icon: Icon,
}: {
    label: string;
    value: string;
    hint?: string;
    icon: typeof Ticket;
}) {
    return (
        <div className="rounded-xl border border-auth-border bg-auth-card/60 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(241,143,52,0.12)] text-auth-accent">
                <Icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-xs text-auth-secondary">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-auth-text">{value}</p>
            {hint ? <p className="mt-1 text-[11px] text-auth-muted">{hint}</p> : null}
        </div>
    );
}

function formatDiscount(promo: PromoCode): string {
    if (promo.discount_type === 'percent') return `${promo.discount_value}%`;
    return formatMoney(promo.discount_value);
}

type NewCodeForm = {
    code: string;
    discountType: PromoDiscountType;
    value: string;
};

const EMPTY_FORM: NewCodeForm = { code: '', discountType: 'percent', value: '' };

function CreateCodeModal({
    open,
    saving,
    onClose,
    onSubmit,
}: {
    open: boolean;
    saving: boolean;
    onClose: () => void;
    onSubmit: (form: NewCodeForm) => void;
}) {
    const [form, setForm] = useState<NewCodeForm>(EMPTY_FORM);

    useEffect(() => {
        if (open) setForm(EMPTY_FORM);
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
            <div className="relative w-full max-w-md rounded-2xl border border-auth-border bg-auth-card p-5 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-auth-text">Nuevo código</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-auth-muted transition hover:bg-white/5 hover:text-auth-text disabled:opacity-50"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSubmit(form);
                    }}
                    className="space-y-4"
                >
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-auth-secondary">Código</label>
                        <input
                            type="text"
                            value={form.code}
                            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                            placeholder="VERANO26"
                            autoFocus
                            className="w-full rounded-lg border border-auth-border bg-white/[0.03] px-3 py-2 font-mono text-sm uppercase tracking-wide text-auth-text outline-none transition focus:border-auth-accent"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-auth-secondary">Tipo de descuento</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['percent', 'fixed'] as const).map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, discountType: type }))}
                                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                        form.discountType === type
                                            ? 'border-auth-accent bg-auth-accent/10 text-auth-accent'
                                            : 'border-auth-border bg-white/[0.03] text-auth-muted hover:text-auth-text'
                                    }`}
                                >
                                    {type === 'percent' ? 'Porcentaje (%)' : 'Importe fijo (€)'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-auth-secondary">
                            {form.discountType === 'percent' ? 'Porcentaje (1-100)' : 'Importe en euros'}
                        </label>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={form.value}
                            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                            placeholder={form.discountType === 'percent' ? '15' : '10,00'}
                            className="w-full rounded-lg border border-auth-border bg-white/[0.03] px-3 py-2 text-sm text-auth-text outline-none transition focus:border-auth-accent"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="rounded-lg border border-auth-border px-4 py-2 text-sm font-medium text-auth-muted transition hover:text-auth-text disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="auth-btn-shadow inline-flex items-center gap-1.5 rounded-lg bg-auth-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                        >
                            <Plus className="h-4 w-4" />
                            {saving ? 'Creando…' : 'Crear código'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function CodigosPromocionalesPage() {
    const [codes, setCodes] = useState<PromoCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toDelete, setToDelete] = useState<PromoCode | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const load = useCallback(async (opts?: { silent?: boolean }) => {
        const silent = opts?.silent ?? false;
        if (!silent) setLoading(true);
        try {
            const data = await listPromoCodes();
            setCodes(data);
            setError(null);
        } catch (err) {
            if (!silent) {
                setError(err instanceof Error ? err.message : 'No se pudieron cargar los códigos');
                setCodes([]);
            }
        } finally {
            if (!silent) setLoading(false);
            setHasLoaded(true);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useAutoRefresh(() => load({ silent: true }), { enabled: !modalOpen && !toDelete && !saving });

    const activeCount = useMemo(() => codes.filter((c) => c.is_active).length, [codes]);

    const handleCreate = async (form: NewCodeForm) => {
        const code = form.code.trim().toUpperCase();
        if (!code) {
            toast.error('Ingresá un código');
            return;
        }
        let discountValue: number;
        if (form.discountType === 'percent') {
            discountValue = Number.parseInt(form.value, 10);
            if (!Number.isInteger(discountValue) || discountValue < 1 || discountValue > 100) {
                toast.error('El porcentaje debe ser un entero entre 1 y 100');
                return;
            }
        } else {
            const euros = Number.parseFloat(form.value.replace(',', '.'));
            if (!Number.isFinite(euros) || euros <= 0) {
                toast.error('Ingresá un importe válido');
                return;
            }
            discountValue = Math.round(euros * 100);
        }

        setSaving(true);
        try {
            await createPromoCode({ code, discount_type: form.discountType, discount_value: discountValue });
            toast.success('Código creado');
            setModalOpen(false);
            await load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo crear el código');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (promo: PromoCode) => {
        setTogglingId(promo.id);
        try {
            await updatePromoCode(promo.id, { is_active: !promo.is_active });
            await load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo actualizar el código');
        } finally {
            setTogglingId(null);
        }
    };

    const handleConfirmDelete = async () => {
        if (!toDelete) return;
        setSaving(true);
        try {
            await deletePromoCode(toDelete.id);
            toast.success('Código eliminado');
            setToDelete(null);
            await load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el código');
        } finally {
            setSaving(false);
        }
    };

    if (loading && !hasLoaded) {
        return <PageLoader label="Cargando códigos…" />;
    }

    return (
        <div className="flex w-full flex-col gap-5 pb-8 sm:gap-6">
            <PageHeader
                title="Códigos promocionales"
                description="Cupones de descuento para la tienda de la app."
                actions={(
                    <button
                        type="button"
                        onClick={() => setModalOpen(true)}
                        className="auth-btn-shadow inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-auth-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                        <Plus className="h-4 w-4" />
                        Nuevo código
                    </button>
                )}
            />

            {error ? <ErrorBanner message={error} /> : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <KpiCard label="Códigos" value={String(codes.length)} hint="Total dados de alta" icon={Ticket} />
                <KpiCard label="Activos" value={String(activeCount)} hint="Vigentes ahora" icon={Percent} />
                <KpiCard label="Inactivos" value={String(codes.length - activeCount)} hint="Pausados" icon={Tag} />
            </div>

            <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-auth-text">Listado de códigos</h2>
                    <span className="text-xs text-auth-muted">{codes.length} códigos</span>
                </div>
                <ListDataPanel
                    loading={loading}
                    isEmpty={!loading && codes.length === 0}
                    emptyMessage="Todavía no hay códigos. Creá el primero con «Nuevo código»."
                >
                    <div className="modal-scroll overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[640px] table-fixed text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-auth-card">
                                <tr className="border-b border-auth-border text-[10px] uppercase tracking-wide text-auth-secondary sm:text-xs">
                                    <th className="w-[26%] px-3 py-2 font-medium sm:px-4">Código</th>
                                    <th className="w-[18%] px-3 py-2 font-medium sm:px-4">Descuento</th>
                                    <th className="w-[22%] px-3 py-2 font-medium sm:px-4">Estado</th>
                                    <th className="w-[20%] px-3 py-2 font-medium sm:px-4">Creado</th>
                                    <th className="w-[14%] px-3 py-2 text-right font-medium sm:px-4" />
                                </tr>
                            </thead>
                            <tbody>
                                {codes.map((promo) => (
                                    <tr
                                        key={promo.id}
                                        className="border-b border-auth-border/50 transition last:border-0 hover:bg-white/[0.02]"
                                    >
                                        <td className="px-3 py-2.5 sm:px-4">
                                            <span className="font-mono text-xs font-semibold text-auth-accent">
                                                {promo.code}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 font-semibold tabular-nums text-auth-text sm:px-4">
                                            {formatDiscount(promo)}
                                        </td>
                                        <td className="px-3 py-2.5 sm:px-4">
                                            <button
                                                type="button"
                                                onClick={() => void handleToggle(promo)}
                                                disabled={togglingId === promo.id}
                                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                                                    promo.is_active
                                                        ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                                        : 'bg-white/5 text-auth-muted hover:bg-white/10'
                                                }`}
                                                title={promo.is_active ? 'Click para desactivar' : 'Click para activar'}
                                            >
                                                <span
                                                    className={`h-1.5 w-1.5 rounded-full ${
                                                        promo.is_active ? 'bg-emerald-400' : 'bg-auth-muted'
                                                    }`}
                                                />
                                                {promo.is_active ? 'Activo' : 'Inactivo'}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-auth-muted sm:px-4">
                                            {new Intl.DateTimeFormat('es-ES', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric',
                                            }).format(new Date(promo.created_at))}
                                        </td>
                                        <td className="px-3 py-2.5 text-right sm:px-4">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-auth-border text-auth-muted transition hover:bg-white/5 hover:text-auth-text"
                                                    title="Copiar código"
                                                    onClick={() => {
                                                        void navigator.clipboard?.writeText(promo.code);
                                                        toast.success('Código copiado');
                                                    }}
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-auth-border text-red-300/80 transition hover:bg-red-500/10 hover:text-red-300"
                                                    title="Eliminar código"
                                                    onClick={() => setToDelete(promo)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ListDataPanel>
            </section>

            <CreateCodeModal
                open={modalOpen}
                saving={saving}
                onClose={() => {
                    if (!saving) setModalOpen(false);
                }}
                onSubmit={(form) => void handleCreate(form)}
            />

            <ConfirmDialog
                open={Boolean(toDelete)}
                title="Eliminar código"
                description={
                    toDelete
                        ? `¿Eliminar el código «${toDelete.code}»? Dejará de aplicar descuentos en la app.`
                        : ''
                }
                confirmLabel="Eliminar"
                cancelLabel="Cancelar"
                tone="danger"
                loading={saving}
                onCancel={() => {
                    if (!saving) setToDelete(null);
                }}
                onConfirm={() => void handleConfirmDelete()}
            />
        </div>
    );
}
