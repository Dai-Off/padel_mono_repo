import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { ProductImageUpload } from './ProductImageUpload';
import { ProductInventorySection } from './ProductInventorySection';
import { centsToEurosInput, eurosToCents } from '../../lib/format';
import { probeImageUrl } from '../../lib/validateImageUrl';
import type { StoreCategory, StoreProduct, StoreProductInput } from '../../types/api';

const CATEGORIES: { value: StoreCategory; label: string }[] = [
    { value: 'palas', label: 'Palas' },
    { value: 'pelotas', label: 'Pelotas' },
    { value: 'calzado', label: 'Calzado' },
    { value: 'ropa', label: 'Ropa' },
    { value: 'accesorios', label: 'Accesorios' },
];

type ProductFormModalProps = {
    open: boolean;
    product?: StoreProduct | null;
    saving?: boolean;
    onClose: () => void;
    onSubmit: (input: StoreProductInput) => Promise<void>;
    onStockAdjust?: (productId: string, quantityDelta: number, note: string) => Promise<StoreProduct>;
};

const emptyForm = {
    name: '',
    brand: '',
    description: '',
    category: 'palas' as StoreCategory,
    sku: '',
    price: '',
    compareAtPrice: '',
    stockQuantity: '0',
    lowStockThreshold: '5',
    imageUrl: '',
    isActive: true,
    isFeatured: false,
    isFlashDeal: false,
    sortOrder: '0',
};

const inputClass =
    'w-full rounded-xl border border-auth-border-input bg-auth-input px-3.5 py-2.5 text-sm text-auth-text outline-none transition auth-input-focus placeholder:text-auth-secondary';

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
    return (
        <span className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-auth-secondary">{children}</span>
            {hint ? <span className="text-xs text-auth-muted">{hint}</span> : null}
        </span>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="mb-3 text-sm font-semibold text-auth-text">{children}</h3>
    );
}

function ToggleChip({
    label,
    checked,
    onChange,
    accent,
}: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    accent?: 'orange' | 'red';
}) {
    const activeClass =
        accent === 'red'
            ? 'border-red-400/40 bg-red-500/15 text-red-300'
            : 'border-auth-accent/40 bg-auth-accent/15 text-auth-accent';

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={[
                'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                checked ? activeClass : 'border-auth-border bg-white/[0.03] text-auth-muted hover:text-auth-text',
            ].join(' ')}
        >
            {label}
        </button>
    );
}

export function ProductFormModal({ open, product, saving, onClose, onSubmit, onStockAdjust }: ProductFormModalProps) {
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [liveStock, setLiveStock] = useState<number | null>(null);

    useEffect(() => {
        if (!open) return;
        if (product) {
            setForm({
                name: product.name,
                brand: product.brand ?? '',
                description: product.description ?? '',
                category: product.category,
                sku: product.sku ?? '',
                price: centsToEurosInput(product.price_cents),
                compareAtPrice: product.compare_at_price_cents != null
                    ? centsToEurosInput(product.compare_at_price_cents)
                    : '',
                stockQuantity: String(product.stock_quantity),
                lowStockThreshold: String(product.low_stock_threshold),
                imageUrl: product.image_url ?? '',
                isActive: product.is_active,
                isFeatured: product.is_featured,
                isFlashDeal: product.is_flash_deal,
                sortOrder: String(product.sort_order),
            });
        } else {
            setForm(emptyForm);
        }
        setLiveStock(product?.stock_quantity ?? null);
        setError(null);
    }, [open, product]);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = prev;
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        const priceCents = eurosToCents(form.price);
        if (priceCents === null) {
            setError('Ingresá un precio válido');
            return;
        }

        const compareAtCents = form.compareAtPrice.trim() ? eurosToCents(form.compareAtPrice) : null;
        if (form.compareAtPrice.trim() && compareAtCents === null) {
            setError('El precio anterior no es válido');
            return;
        }
        if (compareAtCents !== null && compareAtCents <= priceCents) {
            setError('El precio anterior debe ser mayor que el precio de venta');
            return;
        }

        const stockQuantity = Number(form.stockQuantity);
        if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
            setError('El stock inicial debe ser un número entero ≥ 0');
            return;
        }

        const lowStockThreshold = Number(form.lowStockThreshold);
        if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
            setError('El umbral de alerta debe ser un número entero ≥ 0');
            return;
        }

        const sortOrder = Number(form.sortOrder);
        if (!Number.isInteger(sortOrder) || sortOrder < 0) {
            setError('El orden debe ser un número entero ≥ 0');
            return;
        }

        if (!form.name.trim()) {
            setError('El nombre del producto es obligatorio');
            return;
        }

        if (form.isActive) {
            if (!form.imageUrl.trim()) {
                setError('Subí una imagen antes de publicar el producto');
                return;
            }
            try {
                await probeImageUrl(form.imageUrl);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'La imagen no es válida');
                return;
            }
        }

        const input: StoreProductInput = {
            name: form.name.trim(),
            brand: form.brand.trim() || null,
            description: form.description.trim() || null,
            category: form.category,
            sku: form.sku.trim() || null,
            price_cents: priceCents,
            compare_at_price_cents: compareAtCents,
            stock_quantity: product ? product.stock_quantity : stockQuantity,
            low_stock_threshold: lowStockThreshold,
            image_url: form.imageUrl.trim() || null,
            is_active: form.isActive,
            is_featured: form.isFeatured,
            is_flash_deal: form.isFlashDeal,
            sort_order: sortOrder,
        };

        try {
            await onSubmit(input);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar el producto');
        }
    };

    const isBusy = saving || uploadingImage;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="product-form-title"
                className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-auth-border bg-[#121212] shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:max-h-[min(90dvh,820px)] sm:rounded-3xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative shrink-0 border-b border-auth-border px-5 py-5 sm:px-6">
                    <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-auth-accent/10 blur-3xl" />
                    <div className="relative flex items-start justify-between gap-4">
                        <div>
                            <h2 id="product-form-title" className="text-xl font-bold tracking-tight text-auth-text">
                                {product ? 'Editar producto' : 'Nuevo producto'}
                            </h2>
                            <p className="mt-1 text-sm text-auth-muted">
                                {product
                                    ? 'Actualizá los datos del catálogo mobile.'
                                    : 'Completá la ficha para publicar en la tienda de la app.'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-transparent p-2 text-auth-muted transition hover:border-auth-border hover:bg-white/5 hover:text-auth-text"
                            aria-label="Cerrar"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
                    <div className="modal-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                        {error ? (
                            <div className="mb-5 rounded-xl border border-auth-error/30 bg-auth-error/10 px-4 py-3 text-sm text-auth-error">
                                {error}
                            </div>
                        ) : null}

                        <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr]">
                            {/* Imagen */}
                            <div className="lg:sticky lg:top-0 lg:self-start">
                                <SectionTitle>Foto del producto</SectionTitle>
                                <ProductImageUpload
                                    value={form.imageUrl}
                                    onChange={(url) => setForm((p) => ({ ...p, imageUrl: url }))}
                                    disabled={isBusy}
                                    onError={setError}
                                    onUploadingChange={setUploadingImage}
                                />
                            </div>

                            {/* Campos */}
                            <div className="flex flex-col gap-6">
                                <section>
                                    <SectionTitle>Información general</SectionTitle>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <label className="block sm:col-span-2">
                                            <FieldLabel>Nombre *</FieldLabel>
                                            <input
                                                value={form.name}
                                                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                                placeholder="Ej. Pala Nox AT10 Pro"
                                                className={inputClass}
                                                required
                                            />
                                        </label>
                                        <label className="block">
                                            <FieldLabel>Marca</FieldLabel>
                                            <input
                                                value={form.brand}
                                                onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))}
                                                placeholder="Ej. Nox"
                                                className={inputClass}
                                            />
                                        </label>
                                        <label className="block">
                                            <FieldLabel>Categoría *</FieldLabel>
                                            <div className="relative">
                                                <select
                                                    value={form.category}
                                                    onChange={(e) =>
                                                        setForm((p) => ({ ...p, category: e.target.value as StoreCategory }))
                                                    }
                                                    className={`${inputClass} appearance-none pr-10`}
                                                >
                                                    {CATEGORIES.map((cat) => (
                                                        <option key={cat.value} value={cat.value}>
                                                            {cat.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-auth-muted" />
                                            </div>
                                        </label>
                                        <label className="block sm:col-span-2">
                                            <FieldLabel>Descripción</FieldLabel>
                                            <textarea
                                                value={form.description}
                                                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                                                rows={3}
                                                placeholder="Detalles, materiales, tallas…"
                                                className={`${inputClass} resize-none`}
                                            />
                                        </label>
                                    </div>
                                </section>

                                <section>
                                    <SectionTitle>Precios e identificación</SectionTitle>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <label className="block">
                                            <FieldLabel>SKU</FieldLabel>
                                            <input
                                                value={form.sku}
                                                onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))}
                                                placeholder="Opcional"
                                                className={inputClass}
                                            />
                                        </label>
                                        <label className="block">
                                            <FieldLabel>Orden en catálogo</FieldLabel>
                                            <input
                                                value={form.sortOrder}
                                                onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                                                inputMode="numeric"
                                                className={inputClass}
                                            />
                                        </label>
                                        <label className="block">
                                            <FieldLabel>Precio de venta *</FieldLabel>
                                            <div className="relative">
                                                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-auth-muted">
                                                    €
                                                </span>
                                                <input
                                                    value={form.price}
                                                    onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                                                    inputMode="decimal"
                                                    placeholder="0,00"
                                                    className={`${inputClass} pl-8 tabular-nums`}
                                                    required
                                                />
                                            </div>
                                        </label>
                                        <label className="block">
                                            <FieldLabel hint="tachado en app">Precio anterior</FieldLabel>
                                            <div className="relative">
                                                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-auth-muted">
                                                    €
                                                </span>
                                                <input
                                                    value={form.compareAtPrice}
                                                    onChange={(e) => setForm((p) => ({ ...p, compareAtPrice: e.target.value }))}
                                                    inputMode="decimal"
                                                    placeholder="Opcional"
                                                    className={`${inputClass} pl-8 tabular-nums`}
                                                />
                                            </div>
                                        </label>
                                    </div>
                                </section>

                                <section>
                                    <SectionTitle>Inventario</SectionTitle>
                                    <ProductInventorySection
                                        mode={product ? 'edit' : 'create'}
                                        stockQuantity={form.stockQuantity}
                                        onStockQuantityChange={(v) => setForm((p) => ({ ...p, stockQuantity: v }))}
                                        lowStockThreshold={form.lowStockThreshold}
                                        onLowStockThresholdChange={(v) =>
                                            setForm((p) => ({ ...p, lowStockThreshold: v }))
                                        }
                                        currentStock={liveStock ?? product?.stock_quantity ?? 0}
                                        disabled={isBusy}
                                        onAdjustStock={
                                            product && onStockAdjust
                                                ? async (delta, note) => {
                                                      const updated = await onStockAdjust(product.id, delta, note);
                                                      setLiveStock(updated.stock_quantity);
                                                  }
                                                : undefined
                                        }
                                    />
                                </section>

                                <section>
                                    <SectionTitle>Visibilidad en la app</SectionTitle>
                                    <div className="flex flex-wrap gap-2">
                                        <ToggleChip
                                            label="Visible"
                                            checked={form.isActive}
                                            onChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
                                        />
                                        <ToggleChip
                                            label="Destacado"
                                            checked={form.isFeatured}
                                            onChange={(v) => setForm((p) => ({ ...p, isFeatured: v }))}
                                        />
                                        <ToggleChip
                                            label="Oferta flash"
                                            checked={form.isFlashDeal}
                                            onChange={(v) => setForm((p) => ({ ...p, isFlashDeal: v }))}
                                            accent="red"
                                        />
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>

                    <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-auth-border bg-[#0f0f0f]/80 px-5 py-4 backdrop-blur-sm sm:flex-row sm:justify-end sm:px-6">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isBusy}
                            className="rounded-xl border border-auth-border px-5 py-2.5 text-sm font-medium text-auth-text transition hover:bg-white/5 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isBusy}
                            className="auth-btn-shadow inline-flex items-center justify-center gap-2 rounded-xl bg-auth-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {product ? 'Guardar cambios' : 'Publicar producto'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
