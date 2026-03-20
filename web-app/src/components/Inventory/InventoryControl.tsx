import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Edit, Minus, Package, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { InventoryItem, InventoryMovement, InventoryMovementType } from '../../types/inventory';
import { inventoryService } from '../../services/inventory';

function clampInt(n: number): number {
    const v = Math.floor(Number.isFinite(n) ? n : 0);
    return Number.isNaN(v) ? 0 : v;
}

export function InventoryControl({ clubId, clubResolved = true }: { clubId: string | null; clubResolved?: boolean }) {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(false);

    const [itemModal, setItemModal] = useState<null | { mode: 'create' | 'edit'; item?: InventoryItem }>(null);
    const [itemForm, setItemForm] = useState<{
        name: string;
        sku: string;
        unit: string;
        status: 'active' | 'inactive';
        unitPrice: string;
        currency: string;
        lowStockThreshold: string;
    }>({
        name: '',
        sku: '',
        unit: '',
        status: 'active',
        unitPrice: '0',
        currency: 'EUR',
        lowStockThreshold: '0',
    });

    const [itemImageFile, setItemImageFile] = useState<File | null>(null);
    const [itemImagePreviewUrl, setItemImagePreviewUrl] = useState<string | null>(null);

    const [movementModal, setMovementModal] = useState<null | {
        item: InventoryItem;
        movementType: InventoryMovementType;
        quantity: number;
        reason: string;
        movementDate: string;
        maxQuantity?: number;
    }>(null);

    const [searchText, setSearchText] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [stockFilter, setStockFilter] = useState<'all' | 'inStock' | 'outOfStock'>('all');
    const [sortBy, setSortBy] = useState<'name' | 'stock' | 'value'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
    const [historyByItem, setHistoryByItem] = useState<Record<string, InventoryMovement[]>>({});
    const [historyLoadingItemId, setHistoryLoadingItemId] = useState<string | null>(null);

    function formatMoneyFromCents(cents: number, currency: string): string {
        const value = (Number.isFinite(cents) ? cents : 0) / 100;
        try {
            return new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: currency || 'EUR',
                notation: 'compact',
                maximumFractionDigits: 1,
            }).format(value);
        } catch {
            return `${currency || 'EUR'} ${value.toFixed(2)}`;
        }
    }

    function getLowStockThreshold(item: InventoryItem): number {
        const v = item.low_stock_threshold;
        if (typeof v !== 'number' || Number.isNaN(v)) return 0;
        return Math.max(0, Math.trunc(v));
    }

    function getCurrentQty(item: InventoryItem): number {
        return typeof item.current_quantity === 'number' ? item.current_quantity : 0;
    }

    function movementDateLabel(movement: InventoryMovement): string {
        const src = movement.movement_at ?? movement.created_at;
        if (!src) return '-';
        const d = new Date(src);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    const load = useCallback(async () => {
        if (!clubId) return;
        setLoading(true);
        try {
            const data = await inventoryService.listItems(clubId);
            setItems(data);
        } catch (e) {
            toast.error((e as Error).message || 'Error al cargar inventario');
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        load();
    }, [load]);

    const stats = useMemo(() => {
        const totalProducts = items.length;

        let stockOk = 0;
        let stockLow = 0;
        let totalValueCents = 0;

        for (const it of items) {
            const qty = getCurrentQty(it);
            const threshold = getLowStockThreshold(it);
            const isLow = threshold > 0 && qty <= threshold;

            if (isLow) stockLow += 1;
            else stockOk += 1;

            const unitPriceCents = typeof it.unit_price_cents === 'number' ? it.unit_price_cents : 0;
            totalValueCents += qty * unitPriceCents;
        }

        const currency = items[0]?.currency || 'EUR';
        return { totalProducts, stockOk, stockLow, totalValueCents, currency };
    }, [items]);

    const filteredItems = useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();
        let next = [...items];

        if (normalizedSearch) {
            next = next.filter((item) => item.name.toLowerCase().includes(normalizedSearch));
        }

        if (filterDateFrom) {
            const from = new Date(`${filterDateFrom}T00:00:00`).getTime();
            next = next.filter((item) => {
                if (!item.created_at) return false;
                const t = new Date(item.created_at).getTime();
                return Number.isFinite(t) && t >= from;
            });
        }

        if (filterDateTo) {
            const to = new Date(`${filterDateTo}T23:59:59`).getTime();
            next = next.filter((item) => {
                if (!item.created_at) return false;
                const t = new Date(item.created_at).getTime();
                return Number.isFinite(t) && t <= to;
            });
        }

        if (stockFilter === 'inStock') {
            next = next.filter((item) => getCurrentQty(item) > 0);
        } else if (stockFilter === 'outOfStock') {
            next = next.filter((item) => getCurrentQty(item) <= 0);
        }

        next.sort((a, b) => {
            let av = 0;
            let bv = 0;
            if (sortBy === 'name') {
                const cmp = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
                return sortDir === 'asc' ? cmp : -cmp;
            }
            if (sortBy === 'stock') {
                av = getCurrentQty(a);
                bv = getCurrentQty(b);
            } else if (sortBy === 'value') {
                av = getCurrentQty(a) * (a.unit_price_cents ?? 0);
                bv = getCurrentQty(b) * (b.unit_price_cents ?? 0);
            }
            const diff = av - bv;
            return sortDir === 'asc' ? diff : -diff;
        });

        return next;
    }, [items, searchText, filterDateFrom, filterDateTo, stockFilter, sortBy, sortDir]);

    const openCreate = () => {
        setItemForm({
            name: '',
            sku: '',
            unit: '',
            status: 'active',
            unitPrice: '0',
            currency: 'EUR',
            lowStockThreshold: '0',
        });
        setItemImageFile(null);
        setItemImagePreviewUrl(null);
        setItemModal({ mode: 'create' });
    };

    const openEdit = (item: InventoryItem) => {
        setItemForm({
            name: item.name ?? '',
            sku: item.sku ?? '',
            unit: item.unit ?? '',
            status: item.status,
            unitPrice: item.unit_price_cents != null ? String((item.unit_price_cents / 100).toFixed(2)).replace(/\.00$/, '') : '0',
            currency: item.currency ?? 'EUR',
            lowStockThreshold: item.low_stock_threshold != null ? String(item.low_stock_threshold) : '0',
        });
        setItemImageFile(null);
        setItemImagePreviewUrl(item.image_url ?? null);
        setItemModal({ mode: 'edit', item });
    };

    const submitItem = async () => {
        if (!clubId) return;
        const name = itemForm.name.trim();
        if (!name) {
            toast.error('Nombre obligatorio');
            return;
        }

        const unitPriceCents = (() => {
            const raw = itemForm.unitPrice.trim();
            if (!raw) return 0;
            const n = Number(raw.replace(',', '.'));
            if (!Number.isFinite(n) || n < 0) return 0;
            return Math.round(n * 100);
        })();
        const lowStockThresholdInt = (() => {
            const raw = itemForm.lowStockThreshold.trim();
            if (!raw) return 0;
            const n = parseInt(raw, 10);
            if (!Number.isFinite(n) || n < 0) return 0;
            return Math.trunc(n);
        })();

        try {
            if (itemModal?.mode === 'create') {
                const created = await inventoryService.createItem({
                    club_id: clubId,
                    name,
                    sku: itemForm.sku.trim() || null,
                    unit: itemForm.unit.trim() || null,
                    status: itemForm.status,
                    unit_price_cents: unitPriceCents,
                    currency: itemForm.currency || 'EUR',
                    low_stock_threshold: lowStockThresholdInt,
                    image_url: null,
                });

                if (itemImageFile) {
                    const { url } = await inventoryService.uploadItemImage(created.id, itemImageFile);
                    setItemImagePreviewUrl(url);
                }

                setItemImageFile(null);
                setItemImagePreviewUrl(null);
                toast.success('Producto añadido');
                setItemModal(null);
                await load();
            } else if (itemModal?.mode === 'edit' && itemModal.item) {
                const updated = await inventoryService.updateItem(itemModal.item.id, {
                    name,
                    sku: itemForm.sku.trim() || null,
                    unit: itemForm.unit.trim() || null,
                    status: itemForm.status,
                    unit_price_cents: unitPriceCents,
                    currency: itemForm.currency || 'EUR',
                    low_stock_threshold: lowStockThresholdInt,
                });

                if (itemImageFile) {
                    const { url } = await inventoryService.uploadItemImage(updated.id, itemImageFile);
                    setItemImagePreviewUrl(url);
                }

                setItemImageFile(null);
                setItemImagePreviewUrl(null);
                toast.success('Guardado');
                setItemModal(null);
                await load();
            }
        } catch (e) {
            toast.error((e as Error).message || 'Error al guardar');
        }
    };

    const confirmDelete = async (item: InventoryItem) => {
        if (!clubId) return;
        const ok = window.confirm(`¿Eliminar "${item.name}"?`);
        if (!ok) return;

        try {
            await inventoryService.deleteItem(item.id);
            setItems((prev) => prev.filter((x) => x.id !== item.id));
            toast.success('Eliminado');
        } catch (e) {
            toast.error((e as Error).message || 'Error al eliminar');
        }
    };

    const openAdjust = (item: InventoryItem, movementType: InventoryMovementType) => {
        const maxQuantity = movementType === 'out' ? getCurrentQty(item) : undefined;
        setMovementModal({
            item,
            movementType,
            quantity: 1,
            reason: '',
            movementDate: new Date().toISOString().slice(0, 10),
            maxQuantity,
        });
    };

    const submitMovement = async () => {
        if (!clubId || !movementModal) return;
        const quantity = clampInt(movementModal.quantity);
        if (quantity <= 0) {
            toast.error('Cantidad inválida');
            return;
        }
        if (movementModal.movementType === 'out' && movementModal.maxQuantity != null && quantity > movementModal.maxQuantity) {
            toast.error(`No puedes restar más stock del disponible (${movementModal.maxQuantity}).`);
            return;
        }

        try {
            await inventoryService.createMovement({
                club_id: clubId,
                item_id: movementModal.item.id,
                movement_type: movementModal.movementType,
                quantity,
                reason: movementModal.reason.trim() || null,
                movement_at: movementModal.movementDate ? `${movementModal.movementDate}T12:00:00` : null,
            });
            toast.success('Movimiento guardado');
            setMovementModal(null);
            await load();
            if (expandedItemId && expandedItemId === movementModal.item.id) {
                setHistoryByItem((prev) => ({ ...prev, [expandedItemId]: [] }));
            }
        } catch (e) {
            toast.error((e as Error).message || 'Error al guardar movimiento');
        }
    };

    const toggleHistory = async (item: InventoryItem) => {
        const nextId = expandedItemId === item.id ? null : item.id;
        setExpandedItemId(nextId);
        if (!nextId) return;
        if (historyByItem[nextId]?.length) return;
        if (!clubId) return;

        setHistoryLoadingItemId(nextId);
        try {
            const movements = await inventoryService.listMovements({ club_id: clubId, item_id: nextId });
            const sorted = [...movements].sort((a, b) => {
                const at = new Date(a.movement_at ?? a.created_at ?? '').getTime();
                const bt = new Date(b.movement_at ?? b.created_at ?? '').getTime();
                return bt - at;
            });
            setHistoryByItem((prev) => ({ ...prev, [nextId]: sorted }));
        } catch (e) {
            toast.error((e as Error).message || 'Error al cargar historial');
            setHistoryByItem((prev) => ({ ...prev, [nextId]: [] }));
        } finally {
            setHistoryLoadingItemId(null);
        }
    };

    if (!clubResolved) {
        return (
            <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!clubId) {
        return (
            <p className="text-sm text-gray-500 text-center py-12">
                No se pudo determinar el club. Vuelve a iniciar sesión.
            </p>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold text-[#1A1A1A]">Control de inventario</h2>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold hover:opacity-90"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Añadir producto
                </button>
            </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <p className="text-[10px] font-semibold text-gray-500">Productos Total</p>
                        <p className="text-lg font-black text-[#1A1A1A]">{stats.totalProducts}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <p className="text-[10px] font-semibold text-gray-500">Stock OK</p>
                        <p className="text-lg font-black text-[#1A1A1A] text-green-600">{stats.stockOk}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <p className="text-[10px] font-semibold text-gray-500">Stock Bajo</p>
                        <p className="text-lg font-black text-[#1A1A1A] text-red-600">{stats.stockLow}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4">
                        <p className="text-[10px] font-semibold text-gray-500">Valor Total</p>
                        <p className="text-lg font-black text-[#1A1A1A]">{formatMoneyFromCents(stats.totalValueCents, stats.currency)}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                        <div className="lg:col-span-2">
                            <label className="text-[10px] font-semibold text-gray-500">Buscar por nombre</label>
                            <input
                                className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Ej: Pelotas"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500">Fecha desde</label>
                            <input
                                type="date"
                                className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                value={filterDateFrom}
                                onChange={(e) => setFilterDateFrom(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500">Fecha hasta</label>
                            <input
                                type="date"
                                className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                value={filterDateTo}
                                onChange={(e) => setFilterDateTo(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500">Estado stock</label>
                            <select
                                className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                value={stockFilter}
                                onChange={(e) => setStockFilter(e.target.value as 'all' | 'inStock' | 'outOfStock')}
                            >
                                <option value="all">Todos</option>
                                <option value="inStock">Con stock</option>
                                <option value="outOfStock">Sin stock</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500">Orden</label>
                            <div className="mt-0.5 flex gap-2">
                                <select
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as 'name' | 'stock' | 'value')}
                                >
                                    <option value="name">Nombre</option>
                                    <option value="stock">Stock</option>
                                    <option value="value">Valor</option>
                                </select>
                                <select
                                    className="w-[100px] rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={sortDir}
                                    onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                                >
                                    <option value="asc">Asc</option>
                                    <option value="desc">Desc</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
                </div>
            ) : filteredItems.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">Aún no hay productos registrados.</p>
            ) : (
                <div className="space-y-3">
                    {filteredItems.map((item) => {
                        const qty = getCurrentQty(item);
                        const threshold = getLowStockThreshold(item);
                        const isLow = threshold > 0 && qty <= threshold;
                        const unitPriceCents = typeof item.unit_price_cents === 'number' ? item.unit_price_cents : 0;
                        const valueCents = qty * unitPriceCents;
                        const currency = item.currency || stats.currency || 'EUR';

                        return (
                            <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                        {item.image_url ? (
                                            <img
                                                src={item.image_url}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Package className="w-7 h-7 text-gray-400" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs font-bold text-[#1A1A1A] truncate">{item.name}</p>
                                            <span className={`text-[10px] font-semibold ${isLow ? 'text-red-600' : 'text-green-600'}`}>
                                                Stock: {qty}
                                            </span>
                                        </div>

                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                                            {item.sku ? <span>SKU: {item.sku}</span> : null}
                                            {item.unit ? <span>Unidad: {item.unit}</span> : null}
                                            <span>{item.status === 'active' ? 'Activo' : 'Inactivo'}</span>
                                            {threshold > 0 ? <span>Límite bajo: {threshold}</span> : null}
                                        </div>

                                        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                                            <div className="rounded-xl border border-gray-100 p-2 bg-gray-50">
                                                <p className="text-gray-500 font-semibold">Precio</p>
                                                <p className="text-[#1A1A1A] font-bold">
                                                    {formatMoneyFromCents(unitPriceCents, currency)}
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-gray-100 p-2 bg-gray-50">
                                                <p className="text-gray-500 font-semibold">Valor</p>
                                                <p className="text-[#1A1A1A] font-bold">
                                                    {formatMoneyFromCents(valueCents, currency)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openAdjust(item, 'in')}
                                            className="px-3 py-2 rounded-xl bg-green-600/10 text-green-700 text-xs font-bold hover:bg-green-600/15"
                                        >
                                            <div className="flex items-center gap-1">
                                                <Plus className="w-3.5 h-3.5" />
                                                Sumar
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openAdjust(item, 'out')}
                                            className="px-3 py-2 rounded-xl bg-red-600/10 text-red-700 text-xs font-bold hover:bg-red-600/15"
                                            disabled={qty <= 0}
                                            aria-disabled={qty <= 0}
                                        >
                                            <div className="flex items-center gap-1">
                                                <Minus className="w-3.5 h-3.5" />
                                                Restar
                                            </div>
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => toggleHistory(item)}
                                            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                                        >
                                            Historial
                                            {expandedItemId === item.id ? (
                                                <ChevronUp className="w-3.5 h-3.5" />
                                            ) : (
                                                <ChevronDown className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openEdit(item)}
                                            className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50"
                                            aria-label="Editar"
                                        >
                                            <Edit className="w-3.5 h-3.5 text-gray-400" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => confirmDelete(item)}
                                            className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50"
                                            aria-label="Eliminar"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                        </button>
                                    </div>
                                </div>

                                {expandedItemId === item.id && (
                                    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-[10px] font-semibold text-gray-500 mb-2">Historial de movimientos</p>
                                        {historyLoadingItemId === item.id ? (
                                            <p className="text-[10px] text-gray-400">Cargando historial...</p>
                                        ) : (historyByItem[item.id] ?? []).length === 0 ? (
                                            <p className="text-[10px] text-gray-400">Sin movimientos registrados.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {(historyByItem[item.id] ?? [])
                                                    .filter((mv) => {
                                                        const src = mv.movement_at ?? mv.created_at;
                                                        if (!src) return true;
                                                        const t = new Date(src).getTime();
                                                        if (!Number.isFinite(t)) return true;
                                                        if (filterDateFrom) {
                                                            const from = new Date(`${filterDateFrom}T00:00:00`).getTime();
                                                            if (t < from) return false;
                                                        }
                                                        if (filterDateTo) {
                                                            const to = new Date(`${filterDateTo}T23:59:59`).getTime();
                                                            if (t > to) return false;
                                                        }
                                                        return true;
                                                    })
                                                    .map((mv) => {
                                                    const isIn = mv.movement_type === 'in';
                                                    return (
                                                        <div key={mv.id} className="bg-white rounded-lg border border-gray-100 p-2">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className={`text-[10px] font-bold ${isIn ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {isIn ? 'Entrada' : 'Salida'} {isIn ? '+' : '-'}{mv.quantity}
                                                                </span>
                                                                <span className="text-[10px] text-gray-500">{movementDateLabel(mv)}</span>
                                                            </div>
                                                            {mv.reason ? (
                                                                <p className="text-[10px] text-gray-500 mt-1">{mv.reason}</p>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {itemModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 p-5 shadow-xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-sm font-bold text-[#1A1A1A] mb-4">
                            {itemModal.mode === 'create' ? 'Nuevo producto' : 'Editar producto'}
                        </h3>

                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Nombre</label>
                                <input
                                    className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={itemForm.name}
                                    onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-500">SKU (opcional)</label>
                                    <input
                                        className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                        value={itemForm.sku}
                                        onChange={(e) => setItemForm((f) => ({ ...f, sku: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-500">Unidad (opcional)</label>
                                    <input
                                        className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                        value={itemForm.unit}
                                        onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Estado</label>
                                <select
                                    className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={itemForm.status}
                                    onChange={(e) => setItemForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
                                >
                                    <option value="active">Activo</option>
                                    <option value="inactive">Inactivo</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-500">Precio (unidad)</label>
                                    <input
                                        inputMode="decimal"
                                        className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                        value={itemForm.unitPrice}
                                        onChange={(e) => setItemForm((f) => ({ ...f, unitPrice: e.target.value }))}
                                        placeholder="Ej: 2.50"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-500">Stock bajo (umbral)</label>
                                    <input
                                        inputMode="numeric"
                                        className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                        value={itemForm.lowStockThreshold}
                                        onChange={(e) => setItemForm((f) => ({ ...f, lowStockThreshold: e.target.value }))}
                                        placeholder="Ej: 5"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Imagen (opcional)</label>
                                <div className="mt-2 flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                        {itemImagePreviewUrl ? (
                                            <img src={itemImagePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                                        ) : itemModal?.item?.image_url ? (
                                            <img src={itemModal.item.image_url} alt={itemModal.item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <Package className="w-7 h-7 text-gray-400" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <label
                                                className="cursor-pointer flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                            >
                                                <Upload className="w-3.5 h-3.5" />
                                                Elegir archivo
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0] ?? null;
                                                        setItemImageFile(file);
                                                        if (file) {
                                                            setItemImagePreviewUrl(URL.createObjectURL(file));
                                                        } else {
                                                            setItemImagePreviewUrl(itemModal?.item?.image_url ?? null);
                                                        }
                                                    }}
                                                />
                                            </label>
                                            {itemImageFile ? (
                                                <button
                                                    type="button"
                                                    className="text-[10px] font-bold text-gray-500 hover:text-gray-700"
                                                    onClick={() => {
                                                        setItemImageFile(null);
                                                        setItemImagePreviewUrl(itemModal?.item?.image_url ?? null);
                                                    }}
                                                >
                                                    Quitar
                                                </button>
                                            ) : null}
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1">Se guarda la URL de la imagen al cargarla.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end mt-5">
                            <button
                                type="button"
                                onClick={() => setItemModal(null)}
                                className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={submitItem}
                                className="px-3.5 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-bold hover:opacity-90"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {movementModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 p-5 shadow-xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-sm font-bold text-[#1A1A1A] mb-4">Movimiento de stock</h3>

                        <div className="space-y-3">
                            <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                                <p className="text-[10px] font-semibold text-gray-500">Producto</p>
                                <p className="text-xs font-bold text-[#1A1A1A]">{movementModal.item.name}</p>
                            </div>

                            {movementModal.movementType === 'out' && movementModal.maxQuantity != null ? (
                                <p className="text-[10px] text-red-500 font-semibold">
                                    Stock disponible: {movementModal.maxQuantity}
                                </p>
                            ) : null}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-500">Tipo</label>
                                    <select
                                        className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                        value={movementModal.movementType}
                                        onChange={(e) =>
                                            setMovementModal((m) => {
                                                if (!m) return m;
                                                const nextType = e.target.value as InventoryMovementType;
                                                const nextMax = nextType === 'out' ? getCurrentQty(m.item) : undefined;
                                                const nextQty =
                                                    nextMax != null && clampInt(m.quantity) > nextMax ? nextMax : m.quantity;
                                                return {
                                                    ...m,
                                                    movementType: nextType,
                                                    maxQuantity: nextMax,
                                                    quantity: nextQty,
                                                };
                                            })
                                        }
                                    >
                                        <option value="in">Entrada (+)</option>
                                        <option value="out">Salida (-)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-500">Cantidad</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={movementModal.movementType === 'out' ? movementModal.maxQuantity : undefined}
                                        step={1}
                                        className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                        value={movementModal.quantity}
                                        onChange={(e) =>
                                            setMovementModal((m) =>
                                                m ? { ...m, quantity: Number(e.target.value ?? 1) } : m
                                            )
                                        }
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Motivo (opcional)</label>
                                <input
                                    className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={movementModal.reason}
                                    onChange={(e) => setMovementModal((m) => (m ? { ...m, reason: e.target.value } : m))}
                                    placeholder="Ej: compra / merma"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Fecha del movimiento</label>
                                <input
                                    type="date"
                                    className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={movementModal.movementDate}
                                    onChange={(e) => setMovementModal((m) => (m ? { ...m, movementDate: e.target.value } : m))}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end mt-5">
                            <button
                                type="button"
                                onClick={() => setMovementModal(null)}
                                className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={submitMovement}
                                className="px-3.5 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-bold hover:opacity-90"
                            >
                                Guardar movimiento
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

