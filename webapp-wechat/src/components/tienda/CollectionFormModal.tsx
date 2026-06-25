import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ProductImageUpload } from './ProductImageUpload';
import type { StoreCollection, StoreCollectionInput, StoreProduct } from '../../types/api';
import { uploadStoreCollectionImage } from '../../services/store';

type CollectionFormModalProps = {
    open: boolean;
    collection?: StoreCollection | null;
    products: StoreProduct[];
    saving?: boolean;
    onClose: () => void;
    onSubmit: (input: StoreCollectionInput, productIds: string[]) => Promise<void>;
};

const emptyForm = {
    name: '',
    title: '',
    subtitle: '',
    ctaText: 'Ver colección',
    imageUrl: '',
    isActive: true,
    sortOrder: '0',
    productIds: [] as string[],
};

const inputClass =
    'w-full rounded-xl border border-auth-border-input bg-auth-input px-3.5 py-2.5 text-sm text-auth-text outline-none transition auth-input-focus placeholder:text-auth-secondary';

export function CollectionFormModal({
    open,
    collection,
    products,
    saving,
    onClose,
    onSubmit,
}: CollectionFormModalProps) {
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [productSearch, setProductSearch] = useState('');

    useEffect(() => {
        if (!open) return;
        if (collection) {
            setForm({
                name: collection.name,
                title: collection.title,
                subtitle: collection.subtitle ?? '',
                ctaText: collection.cta_text ?? 'Ver colección',
                imageUrl: collection.image_url ?? '',
                isActive: collection.is_active,
                sortOrder: String(collection.sort_order),
                productIds: collection.product_ids ?? [],
            });
        } else {
            setForm(emptyForm);
        }
        setProductSearch('');
        setError(null);
    }, [open, collection]);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open) return null;

    const filteredProducts = products.filter((p) => {
        const q = productSearch.trim().toLowerCase();
        if (!q) return true;
        return (
            p.name.toLowerCase().includes(q) ||
            (p.brand ?? '').toLowerCase().includes(q) ||
            (p.sku ?? '').toLowerCase().includes(q)
        );
    });

    const toggleProduct = (id: string) => {
        setForm((prev) => ({
            ...prev,
            productIds: prev.productIds.includes(id)
                ? prev.productIds.filter((x) => x !== id)
                : [...prev.productIds, id],
        }));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        const sortOrder = Number(form.sortOrder);
        if (!Number.isInteger(sortOrder) || sortOrder < 0) {
            setError('El orden debe ser un entero ≥ 0');
            return;
        }
        if (!form.name.trim() || !form.title.trim()) {
            setError('Completá nombre interno y título del banner');
            return;
        }
        if (form.isActive && !form.imageUrl.trim()) {
            setError('Subí una imagen para publicar la colección');
            return;
        }
        if (form.isActive && form.productIds.length === 0) {
            setError('Agregá al menos un producto a la colección');
            return;
        }

        const input: StoreCollectionInput = {
            name: form.name.trim(),
            title: form.title.trim(),
            subtitle: form.subtitle.trim() || null,
            cta_text: form.ctaText.trim() || null,
            image_url: form.imageUrl.trim() || null,
            is_active: form.isActive,
            sort_order: sortOrder,
        };

        try {
            await onSubmit(input, form.productIds);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar la colección');
        }
    };

    const busy = saving || uploadingImage;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
            <div
                role="dialog"
                aria-modal="true"
                className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-auth-border bg-[#121212] sm:max-h-[min(90dvh,820px)] sm:rounded-3xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-auth-border px-5 py-4">
                    <h2 className="text-lg font-bold text-auth-text">
                        {collection ? 'Editar colección' : 'Nueva colección'}
                    </h2>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-auth-muted hover:bg-white/5">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
                    <div className="modal-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        {error ? (
                            <div className="mb-4 rounded-xl border border-auth-error/30 bg-auth-error/10 px-4 py-3 text-sm text-auth-error">
                                {error}
                            </div>
                        ) : null}

                        <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
                            <div>
                                <p className="mb-2 text-sm font-semibold text-auth-text">Banner</p>
                                <ProductImageUpload
                                    value={form.imageUrl}
                                    onChange={(url) => setForm((p) => ({ ...p, imageUrl: url }))}
                                    disabled={busy}
                                    onError={setError}
                                    onUploadingChange={setUploadingImage}
                                    uploadFile={uploadStoreCollectionImage}
                                />
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block sm:col-span-2">
                                    <span className="mb-1 block text-xs text-auth-secondary">Nombre interno *</span>
                                    <input
                                        className={inputClass}
                                        value={form.name}
                                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                        placeholder="Ej. Primavera 2026"
                                    />
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="mb-1 block text-xs text-auth-secondary">Título en app *</span>
                                    <input
                                        className={inputClass}
                                        value={form.title}
                                        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                                    />
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="mb-1 block text-xs text-auth-secondary">Subtítulo</span>
                                    <input
                                        className={inputClass}
                                        value={form.subtitle}
                                        onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs text-auth-secondary">Texto del botón</span>
                                    <input
                                        className={inputClass}
                                        value={form.ctaText}
                                        onChange={(e) => setForm((p) => ({ ...p, ctaText: e.target.value }))}
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs text-auth-secondary">Orden</span>
                                    <input
                                        className={inputClass}
                                        value={form.sortOrder}
                                        onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                                        inputMode="numeric"
                                    />
                                </label>
                                <label className="flex items-center gap-2 sm:col-span-2">
                                    <input
                                        type="checkbox"
                                        checked={form.isActive}
                                        onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                                        className="h-4 w-4 accent-[#F18F34]"
                                    />
                                    <span className="text-sm text-auth-text">Visible en la app</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-auth-text">
                                    Productos ({form.productIds.length})
                                </p>
                                <input
                                    className={`${inputClass} max-w-xs`}
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    placeholder="Buscar producto…"
                                />
                            </div>
                            <div className="max-h-56 overflow-y-auto rounded-xl border border-auth-border">
                                {filteredProducts.map((p) => {
                                    const checked = form.productIds.includes(p.id);
                                    return (
                                        <label
                                            key={p.id}
                                            className="flex cursor-pointer items-center gap-3 border-b border-auth-border/50 px-3 py-2 last:border-0 hover:bg-white/[0.02]"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleProduct(p.id)}
                                                className="h-4 w-4 accent-[#F18F34]"
                                            />
                                            {p.image_url ? (
                                                <img src={p.image_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
                                            ) : null}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm text-auth-text">{p.name}</p>
                                                <p className="truncate text-xs text-auth-muted">{p.brand}</p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-auth-border px-5 py-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className="rounded-xl border border-auth-border px-4 py-2 text-sm text-auth-text"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl bg-auth-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
