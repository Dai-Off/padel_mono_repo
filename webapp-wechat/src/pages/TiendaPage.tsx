import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, PackageOpen, Plus, Sparkles, Zap } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CategoryFilter } from '../components/tienda/CategoryFilter';
import type { CategoryFilterValue } from '../components/tienda/CategoryFilter';
import { FlashCampaignModal } from '../components/tienda/FlashCampaignModal';
import { ProductThumb } from '../components/tienda/ProductThumb';
import { StoreStatsCards, matchesStoreStockFilter, type StoreStockFilter } from '../components/tienda/StoreStatsCards';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { ListDataPanel } from '../components/ui/ListDataPanel';
import { ListPageShell } from '../components/ui/ListPageShell';
import { pageHeaderTitleClass } from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/PageLoader';
import { Pagination } from '../components/ui/Pagination';
import { SearchInput } from '../components/ui/SearchInput';
import { ProductFormModal } from '../components/tienda/ProductFormModal';
import { ProductRowActions } from '../components/tienda/ProductRowActions';
import { StockAdjustModal } from '../components/tienda/StockAdjustModal';
import { formatMoney, storeCategoryLabel } from '../lib/format';
import { parseTiendaStockParam } from '../lib/tiendaNav';
import { DEFAULT_PAGE_SIZE, paginate, totalPages } from '../lib/pagination';
import {
    adjustStoreProductStock,
    createStoreProduct,
    deleteStoreProduct,
    listStoreProducts,
    updateStoreProduct,
} from '../services/store';
import type { StoreProduct, StoreProductInput } from '../types/api';

function StockPill({ product }: { product: StoreProduct }) {
    if (!product.is_active) {
        return (
            <span className="inline-flex rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-auth-muted">
                —
            </span>
        );
    }
    if (product.stock_quantity <= 0) {
        return (
            <span className="inline-flex rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-300">
                Agotado
            </span>
        );
    }
    if (product.stock_quantity <= product.low_stock_threshold) {
        return (
            <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                {product.stock_quantity} uds.
            </span>
        );
    }
    return (
        <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
            {product.stock_quantity} uds.
        </span>
    );
}

function StatusPills({ product }: { product: StoreProduct }) {
    return (
        <div className="flex flex-wrap gap-1">
            {!product.is_active ? (
                <span className="inline-flex rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-auth-muted">
                    Oculto
                </span>
            ) : (
                <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                    Visible
                </span>
            )}
            {product.is_featured ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-auth-accent/15 px-2 py-0.5 text-xs font-medium text-auth-accent">
                    <Sparkles className="h-3 w-3" />
                    Destacado
                </span>
            ) : null}
            {product.is_flash_deal ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-300">
                    <Zap className="h-3 w-3" />
                    Flash
                </span>
            ) : null}
        </div>
    );
}

export function TiendaPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [category, setCategory] = useState<CategoryFilterValue>('');
    const [stockFilter, setStockFilter] = useState<StoreStockFilter | null>(null);
    const [products, setProducts] = useState<StoreProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [formOpen, setFormOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
    const [stockProduct, setStockProduct] = useState<StoreProduct | null>(null);
    const [productToDelete, setProductToDelete] = useState<StoreProduct | null>(null);
    const [saving, setSaving] = useState(false);
    const [flashModalOpen, setFlashModalOpen] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        setPage(1);
    }, [category, stockFilter]);

    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        let changed = false;

        const stock = parseTiendaStockParam(next.get('stock'));
        if (stock) {
            setStockFilter(stock);
            next.delete('stock');
            changed = true;
        }

        if (next.get('flash') === '1') {
            setFlashModalOpen(true);
            next.delete('flash');
            changed = true;
        }

        if (changed) {
            setSearchParams(next, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await listStoreProducts({
                q: debouncedSearch || undefined,
                category: category || undefined,
                includeInactive: true,
            });
            setProducts(data);
            setPage(1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo');
            setProducts([]);
        } finally {
            setLoading(false);
            setHasLoaded(true);
        }
    }, [debouncedSearch, category]);

    useEffect(() => {
        void load();
    }, [load]);

    const filteredProducts = useMemo(() => {
        if (!stockFilter) return products;
        return products.filter((p) => matchesStoreStockFilter(p, stockFilter));
    }, [products, stockFilter]);

    const stats = useMemo(() => {
        const active = products.filter((p) => p.is_active).length;
        const lowStock = products.filter(
            (p) => p.is_active && p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold
        ).length;
        const outOfStock = products.filter((p) => p.is_active && p.stock_quantity <= 0).length;
        const hidden = products.filter((p) => !p.is_active).length;
        return { active, lowStock, outOfStock, hidden };
    }, [products]);

    const initialLoad = loading && !hasLoaded;
    const pageCount = totalPages(filteredProducts.length);
    const pageProducts = paginate(filteredProducts, page);
    const hasFilters = Boolean(debouncedSearch || category || stockFilter);

    const stockFilterEmptyHint =
        stockFilter === 'published'
            ? 'No hay productos publicados con los filtros actuales.'
            : stockFilter === 'low_stock'
              ? 'No hay productos con stock crítico con los filtros actuales.'
              : stockFilter === 'out_of_stock'
                ? 'No hay productos agotados con los filtros actuales.'
                : stockFilter === 'hidden'
                  ? 'No hay productos ocultos con los filtros actuales.'
                  : null;

    const handleCreateOrUpdate = async (input: StoreProductInput) => {
        setSaving(true);
        try {
            if (editingProduct) {
                const { stock_quantity: _ignored, ...updateInput } = input;
                await updateStoreProduct(editingProduct.id, updateInput);
                toast.success('Producto actualizado');
            } else {
                await createStoreProduct(input);
                toast.success('Producto publicado');
            }
            setFormOpen(false);
            setEditingProduct(null);
            await load();
        } finally {
            setSaving(false);
        }
    };

    const handleStockAdjust = async (quantityDelta: number, note: string) => {
        if (!stockProduct) return;
        setSaving(true);
        try {
            await adjustStoreProductStock(stockProduct.id, {
                quantity_delta: quantityDelta,
                note: note || null,
            });
            toast.success('Stock actualizado');
            setStockProduct(null);
            await load();
        } finally {
            setSaving(false);
        }
    };

    const handleRowAction = async (actionId: string, product: StoreProduct) => {
        if (actionId === 'edit') {
            setEditingProduct(product);
            setFormOpen(true);
            return;
        }
        if (actionId === 'stock') {
            setStockProduct(product);
            return;
        }
        if (actionId === 'toggle') {
            if (!product.is_active && !product.image_url?.trim()) {
                toast.error('Subí una imagen válida antes de publicar el producto');
                return;
            }
            setSaving(true);
            try {
                await updateStoreProduct(product.id, { is_active: !product.is_active });
                toast.success(product.is_active ? 'Producto oculto en la app' : 'Producto visible en la app');
                await load();
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'No se pudo cambiar la visibilidad');
            } finally {
                setSaving(false);
            }
            return;
        }
        if (actionId === 'delete') {
            setProductToDelete(product);
            return;
        }
    };

    const handleConfirmDelete = async () => {
        if (!productToDelete) return;
        setSaving(true);
        try {
            await deleteStoreProduct(productToDelete.id);
            toast.success('Producto eliminado');
            setProductToDelete(null);
            await load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el producto');
        } finally {
            setSaving(false);
        }
    };

    if (initialLoad) {
        return <PageLoader label="Cargando catálogo…" />;
    }

    return (
        <ListPageShell>
            <section className="mb-2 shrink-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-baseline gap-2">
                        <h1 className={pageHeaderTitleClass('sm')}>Tienda</h1>
                        {!loading ? (
                            <span className="truncate text-xs text-auth-muted">
                                {filteredProducts.length === 1
                                    ? '1 producto'
                                    : `${filteredProducts.length} productos`}
                                {hasFilters ? ' · filtrado' : ''}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                        <button
                            type="button"
                            onClick={() => setFlashModalOpen(true)}
                            className="auth-btn-shadow inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-auth-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 sm:px-3.5 sm:text-sm"
                        >
                            <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline">Ofertas flash</span>
                            <span className="sm:hidden">Flash</span>
                        </button>
                        <Link
                            to="/tienda/colecciones"
                            className="auth-btn-shadow inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-auth-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 sm:px-3.5 sm:text-sm"
                        >
                            <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            Colección
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                setEditingProduct(null);
                                setFormOpen(true);
                            }}
                            className="auth-btn-shadow inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-auth-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
                        >
                            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline">Agregar producto</span>
                            <span className="sm:hidden">Agregar</span>
                        </button>
                    </div>
                </div>
            </section>

            <div className="mb-2 shrink-0">
                <StoreStatsCards
                    active={stats.active}
                    lowStock={stats.lowStock}
                    outOfStock={stats.outOfStock}
                    hidden={stats.hidden}
                    compact
                    stockFilter={stockFilter}
                    onStockFilterChange={setStockFilter}
                />
            </div>

            <section className="mb-2 shrink-0 rounded-xl border border-auth-border bg-auth-card/60 px-2.5 py-2 sm:px-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder="Buscar por nombre, marca o SKU…"
                        className="max-w-none lg:max-w-xs lg:shrink-0"
                        compact
                    />
                    <CategoryFilter value={category} onChange={setCategory} compact />
                </div>
            </section>

            {error ? (
                <div className="mb-2 shrink-0">
                    <ErrorBanner message={error} />
                </div>
            ) : null}

            <ListDataPanel
                loading={loading}
                isEmpty={!loading && filteredProducts.length === 0}
                emptyContent={
                    <div className="flex max-w-sm flex-col items-center text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-auth-border">
                            <PackageOpen className="h-7 w-7 text-auth-muted" />
                        </div>
                        <p className="text-base font-medium text-auth-text">
                            {hasFilters ? 'Sin coincidencias' : 'Catálogo vacío'}
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-auth-secondary">
                            {stockFilterEmptyHint ??
                                (hasFilters
                                    ? 'Probá con otro término o quitá los filtros de categoría.'
                                    : 'Todavía no hay productos publicados en la tienda.')}
                        </p>
                        {stockFilter ? (
                            <button
                                type="button"
                                onClick={() => setStockFilter(null)}
                                className="mt-4 text-sm font-medium text-auth-accent hover:underline"
                            >
                                Quitar filtro de inventario
                            </button>
                        ) : null}
                    </div>
                }
                footer={
                    <Pagination
                        page={page}
                        total={pageCount}
                        pageSize={DEFAULT_PAGE_SIZE}
                        totalItems={filteredProducts.length}
                        onPageChange={setPage}
                    />
                }
            >
                <div className="modal-scroll min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain">
                    <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-auth-card">
                            <tr className="border-b border-auth-border text-[10px] uppercase tracking-wide text-auth-secondary sm:text-xs">
                                <th className="w-[30%] px-3 py-2 font-medium sm:px-4">Producto</th>
                                <th className="w-[12%] px-3 py-2 font-medium sm:px-4">Categoría</th>
                                <th className="w-[12%] px-3 py-2 font-medium sm:px-4">Precio</th>
                                <th className="w-[12%] px-3 py-2 font-medium sm:px-4">Inventario</th>
                                <th className="w-[16%] px-3 py-2 font-medium sm:px-4">Visibilidad</th>
                                <th className="w-[10%] px-3 py-2 text-right font-medium sm:px-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {pageProducts.map((product) => (
                                <tr
                                    key={product.id}
                                    className="group border-b border-auth-border/50 transition last:border-0 hover:bg-white/[0.02]"
                                >
                                    <td className="px-3 py-2 sm:px-4">
                                        <div className="flex items-center gap-2.5">
                                            <ProductThumb product={product} />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-auth-text">{product.name}</p>
                                                <p className="truncate text-[11px] text-auth-muted">
                                                    {[product.brand, product.sku].filter(Boolean).join(' · ') || 'Sin marca'}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="truncate px-3 py-2 text-xs text-auth-muted sm:px-4">
                                        {storeCategoryLabel(product.category)}
                                    </td>
                                    <td className="px-3 py-2 sm:px-4">
                                        <p className="text-sm font-medium tabular-nums text-auth-text">
                                            {formatMoney(product.price_cents)}
                                        </p>
                                        {product.compare_at_price_cents != null ? (
                                            <p className="text-[11px] tabular-nums text-auth-muted line-through">
                                                {formatMoney(product.compare_at_price_cents)}
                                            </p>
                                        ) : null}
                                    </td>
                                    <td className="px-3 py-2 sm:px-4">
                                        <StockPill product={product} />
                                    </td>
                                    <td className="px-3 py-2 sm:px-4">
                                        <StatusPills product={product} />
                                    </td>
                                    <td className="relative overflow-visible px-3 py-2 sm:px-4">
                                        <ProductRowActions
                                            product={product}
                                            onAction={(id, p) => void handleRowAction(id, p)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ListDataPanel>

            <FlashCampaignModal open={flashModalOpen} onClose={() => setFlashModalOpen(false)} />

            <ProductFormModal
                open={formOpen}
                product={editingProduct}
                saving={saving}
                onClose={() => {
                    setFormOpen(false);
                    setEditingProduct(null);
                }}
                onSubmit={handleCreateOrUpdate}
                onStockAdjust={async (id, quantityDelta, note) => {
                    const updated = await adjustStoreProductStock(id, {
                        quantity_delta: quantityDelta,
                        note: note || null,
                    });
                    setEditingProduct(updated);
                    toast.success('Inventario actualizado');
                    await load();
                    return updated;
                }}
            />

            <StockAdjustModal
                open={Boolean(stockProduct)}
                product={stockProduct}
                saving={saving}
                onClose={() => setStockProduct(null)}
                onSubmit={handleStockAdjust}
            />

            <ConfirmDialog
                open={Boolean(productToDelete)}
                title="Eliminar producto"
                description={
                    productToDelete
                        ? `¿Eliminar «${productToDelete.name}»? Se borrará del catálogo y no podrás recuperarlo. Para ocultarlo en la app sin borrarlo, usá «Mostrar / ocultar».`
                        : ''
                }
                confirmLabel="Eliminar"
                cancelLabel="Cancelar"
                tone="danger"
                loading={saving}
                onCancel={() => {
                    if (!saving) setProductToDelete(null);
                }}
                onConfirm={() => void handleConfirmDelete()}
            />
        </ListPageShell>
    );
}
