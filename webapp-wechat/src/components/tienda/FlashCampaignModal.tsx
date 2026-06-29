import { useEffect, useState } from 'react';
import { Loader2, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { getStoreFlashSettings, listStoreProducts, updateStoreFlashSettings } from '../../services/store';
import type { StoreFlashSettings } from '../../types/api';

export const FLASH_TITLE_MAX_LEN = 24;

function toLocalInputValue(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type FlashCampaignModalProps = {
    open: boolean;
    onClose: () => void;
};

export function FlashCampaignModal({ open, onClose }: FlashCampaignModalProps) {
    const [settings, setSettings] = useState<StoreFlashSettings | null>(null);
    const [flashProductCount, setFlashProductCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [endsAt, setEndsAt] = useState('');
    const [title, setTitle] = useState('');

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const [flashSettings, products] = await Promise.all([
                    getStoreFlashSettings(),
                    listStoreProducts({ includeInactive: false }),
                ]);
                if (cancelled) return;
                setSettings(flashSettings);
                setEnabled(flashSettings.flash_enabled);
                setEndsAt(toLocalInputValue(flashSettings.flash_ends_at));
                setTitle(flashSettings.flash_title ?? '');
                setFlashProductCount(products.filter((p) => p.is_active && p.is_flash_deal).length);
            } catch (err) {
                if (!cancelled) {
                    toast.error(err instanceof Error ? err.message : 'No se pudo cargar la campaña flash');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [open]);

    const handleSave = async () => {
        if (enabled && !endsAt.trim()) {
            toast.error('Indicá cuándo termina la oferta flash');
            return;
        }
        setSaving(true);
        try {
            const updated = await updateStoreFlashSettings({
                flash_enabled: enabled,
                flash_ends_at: enabled && endsAt ? new Date(endsAt).toISOString() : null,
                flash_title: title.trim() || null,
            });
            setSettings(updated);
            toast.success('Campaña de ofertas flash actualizada');
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
            <div
                role="dialog"
                aria-modal="true"
                className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-auth-border bg-[#121212] sm:max-h-[min(90dvh,640px)] sm:rounded-3xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-auth-border px-5 py-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
                            <Zap className="h-4 w-4" />
                        </div>
                        <h2 className="text-lg font-bold text-auth-text">Ofertas flash</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-lg p-1.5 text-auth-muted hover:bg-white/5"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="modal-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-auth-muted">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Cargando…
                        </div>
                    ) : (
                        <>
                            <p className="mb-4 text-sm text-auth-secondary">
                                Marcá productos con «Oferta flash» y activá la campaña con fecha de fin.
                                {flashProductCount > 0
                                    ? ` ${flashProductCount} producto(s) listos.`
                                    : ' Sin productos flash todavía.'}
                            </p>

                            <label className="mb-4 flex items-center gap-2 text-sm text-auth-text">
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => setEnabled(e.target.checked)}
                                    className="h-4 w-4 rounded border-auth-border accent-[#F18F34]"
                                />
                                Campaña activa en la app
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block sm:col-span-2">
                                    <span className="mb-1 block text-xs font-medium text-auth-secondary">
                                        Fin de la oferta
                                    </span>
                                    <input
                                        type="datetime-local"
                                        value={endsAt}
                                        onChange={(e) => setEndsAt(e.target.value)}
                                        disabled={!enabled}
                                        className="w-full rounded-lg border border-auth-border-input bg-auth-input px-3 py-2 text-sm text-auth-text outline-none auth-input-focus disabled:opacity-50"
                                    />
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="mb-1 flex items-center justify-between text-xs font-medium text-auth-secondary">
                                        <span>Título en app (opcional)</span>
                                        <span className="tabular-nums text-auth-muted">
                                            {title.length}/{FLASH_TITLE_MAX_LEN}
                                        </span>
                                    </span>
                                    <input
                                        value={title}
                                        maxLength={FLASH_TITLE_MAX_LEN}
                                        onChange={(e) => setTitle(e.target.value.slice(0, FLASH_TITLE_MAX_LEN))}
                                        placeholder="Ofertas flash"
                                        className="w-full rounded-lg border border-auth-border-input bg-auth-input px-3 py-2 text-sm text-auth-text outline-none auth-input-focus placeholder:text-auth-secondary"
                                    />
                                </label>
                            </div>

                            {settings?.flash_enabled && settings.flash_ends_at ? (
                                <p className="mt-3 text-xs text-auth-muted">
                                    Visible en la app hasta{' '}
                                    {new Intl.DateTimeFormat('es-AR', {
                                        dateStyle: 'medium',
                                        timeStyle: 'short',
                                    }).format(new Date(settings.flash_ends_at))}
                                </p>
                            ) : null}
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-auth-border px-5 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-xl border border-auth-border px-4 py-2 text-sm text-auth-text"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving || loading}
                        className="inline-flex items-center gap-2 rounded-xl bg-auth-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}
