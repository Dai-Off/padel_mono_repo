import { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Layers, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CollectionFormModal } from '../components/tienda/CollectionFormModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { ListDataPanel } from '../components/ui/ListDataPanel';
import { ListPageShell } from '../components/ui/ListPageShell';
import { PageHeader } from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/PageLoader';
import { RowActionsMenu } from '../components/ui/RowActionsMenu';
import {
    createStoreCollection,
    deleteStoreCollection,
    listStoreCollections,
    listStoreProducts,
    setStoreCollectionProducts,
    updateStoreCollection,
} from '../services/store';
import type { StoreCollection, StoreCollectionInput, StoreProduct } from '../types/api';

export function ColeccionesPage() {
    const [collections, setCollections] = useState<StoreCollection[]>([]);
    const [products, setProducts] = useState<StoreProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<StoreCollection | null>(null);
    const [toDelete, setToDelete] = useState<StoreCollection | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [cols, prods] = await Promise.all([
                listStoreCollections({ includeInactive: true }),
                listStoreProducts({ includeInactive: true }),
            ]);
            setCollections(cols);
            setProducts(prods);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudieron cargar las colecciones');
            setCollections([]);
        } finally {
            setLoading(false);
            setHasLoaded(true);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const openCreateModal = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const handleSubmit = async (input: StoreCollectionInput, productIds: string[]) => {
        setSaving(true);
        try {
            if (editing) {
                await updateStoreCollection(editing.id, input);
                await setStoreCollectionProducts(editing.id, productIds);
                toast.success('Colección actualizada');
            } else {
                const created = await createStoreCollection(input);
                await setStoreCollectionProducts(created.id, productIds);
                toast.success('Colección creada');
            }
            setFormOpen(false);
            setEditing(null);
            await load();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!toDelete) return;
        setSaving(true);
        try {
            await deleteStoreCollection(toDelete.id);
            toast.success('Colección eliminada');
            setToDelete(null);
            await load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo eliminar');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (collection: StoreCollection) => {
        if (!collection.is_active) {
            if (!collection.image_url?.trim()) {
                toast.error('Subí una imagen antes de publicar la colección');
                return;
            }
            if ((collection.product_count ?? collection.product_ids?.length ?? 0) === 0) {
                toast.error('Agregá al menos un producto antes de publicar');
                return;
            }
        }
        setSaving(true);
        try {
            await updateStoreCollection(collection.id, { is_active: !collection.is_active });
            toast.success(collection.is_active ? 'Colección oculta en la app' : 'Colección visible en la app');
            await load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo cambiar la visibilidad');
        } finally {
            setSaving(false);
        }
    };

    if (loading && !hasLoaded) {
        return <PageLoader label="Cargando colecciones…" />;
    }

    return (
        <ListPageShell>
            <PageHeader
                dense
                title="Colecciones"
                description={`Banners en la app · ${collections.length} colección(es)`}
                actions={(
                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-auth-accent px-3 py-1.5 text-xs font-semibold text-white sm:px-4 sm:py-2 sm:text-sm"
                    >
                        <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Nueva colección
                    </button>
                )}
            />

            {error ? (
                <div className="mb-2 shrink-0">
                    <ErrorBanner message={error} />
                </div>
            ) : null}

            <ListDataPanel
                loading={loading}
                isEmpty={!loading && collections.length === 0}
                emptyContent={
                    <div className="flex max-w-sm flex-col items-center text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-auth-border">
                            <Layers className="h-7 w-7 text-auth-muted" />
                        </div>
                        <p className="text-base font-medium text-auth-text">Sin colecciones</p>
                        <p className="mt-1.5 text-sm text-auth-secondary">
                            Creá banners promocionales y asignales productos para la tienda en la app.
                        </p>
                        <button
                            type="button"
                            onClick={openCreateModal}
                            className="auth-btn-shadow mt-5 inline-flex items-center gap-1.5 rounded-lg bg-auth-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                        >
                            <Plus className="h-4 w-4" />
                            Nueva colección
                        </button>
                    </div>
                }
            >
                <div className="modal-scroll min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                    <table className="w-full min-w-[640px] table-fixed text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-auth-card">
                            <tr className="border-b border-auth-border text-[10px] uppercase tracking-wide text-auth-secondary sm:text-xs">
                                <th className="w-[28%] px-3 py-2 font-medium sm:px-4">Colección</th>
                                <th className="w-[22%] px-3 py-2 font-medium sm:px-4">Banner</th>
                                <th className="w-[12%] px-3 py-2 font-medium sm:px-4">Productos</th>
                                <th className="w-[10%] px-3 py-2 font-medium sm:px-4">Orden</th>
                                <th className="w-[14%] px-3 py-2 font-medium sm:px-4">Estado</th>
                                <th className="w-[8%] px-3 py-2 text-right font-medium sm:px-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {collections.map((c) => (
                                <tr
                                    key={c.id}
                                    className="border-b border-auth-border/50 transition last:border-0 hover:bg-white/[0.02]"
                                >
                                    <td className="px-3 py-2 sm:px-4">
                                        <p className="truncate font-medium text-auth-text">{c.title}</p>
                                        <p className="truncate text-[11px] text-auth-muted">{c.name}</p>
                                    </td>
                                    <td className="px-3 py-2 sm:px-4">
                                        {c.image_url ? (
                                            <img
                                                src={c.image_url}
                                                alt=""
                                                className="h-10 w-16 rounded-lg object-cover ring-1 ring-auth-border"
                                            />
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs text-auth-muted">
                                                <ImageIcon className="h-3.5 w-3.5" />
                                                Sin imagen
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-auth-muted sm:px-4">
                                        {c.product_count ?? c.product_ids?.length ?? 0}
                                    </td>
                                    <td className="px-3 py-2 text-xs tabular-nums text-auth-muted sm:px-4">
                                        {c.sort_order}
                                    </td>
                                    <td className="px-3 py-2 sm:px-4">
                                        {c.is_active ? (
                                            <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                                                Visible
                                            </span>
                                        ) : (
                                            <span className="inline-flex rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-auth-muted">
                                                Oculta
                                            </span>
                                        )}
                                    </td>
                                    <td className="relative overflow-visible px-3 py-2 sm:px-4">
                                        <RowActionsMenu
                                            ariaLabel={`Acciones para ${c.title}`}
                                            actions={[
                                                { id: 'edit', label: 'Editar', icon: Pencil },
                                                {
                                                    id: 'toggle',
                                                    label: c.is_active ? 'Ocultar en app' : 'Publicar en app',
                                                    icon: Power,
                                                },
                                                { id: 'delete', label: 'Eliminar', icon: Trash2, tone: 'danger' },
                                            ]}
                                            onSelect={(id) => {
                                                if (id === 'edit') {
                                                    setEditing(c);
                                                    setFormOpen(true);
                                                    return;
                                                }
                                                if (id === 'toggle') {
                                                    void handleToggleActive(c);
                                                    return;
                                                }
                                                if (id === 'delete') setToDelete(c);
                                            }}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ListDataPanel>

            <CollectionFormModal
                open={formOpen}
                collection={editing}
                products={products.filter((p) => p.is_active)}
                saving={saving}
                onClose={() => {
                    setFormOpen(false);
                    setEditing(null);
                }}
                onSubmit={handleSubmit}
            />

            <ConfirmDialog
                open={Boolean(toDelete)}
                title="Eliminar colección"
                description={
                    toDelete
                        ? `¿Eliminar «${toDelete.title}»? El banner dejará de mostrarse en la app.`
                        : ''
                }
                confirmLabel="Eliminar"
                cancelLabel="Cancelar"
                tone="danger"
                loading={saving}
                onCancel={() => {
                    if (!saving) setToDelete(null);
                }}
                onConfirm={() => void handleDelete()}
            />
        </ListPageShell>
    );
}
