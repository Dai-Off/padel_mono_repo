import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Package, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { inventoryService } from '../../services/inventory';
import { playerService } from '../../services/player';
import { apiFetchWithAuth } from '../../services/api';
import type { Player } from '../../types/api';
import type { InventoryCategory, InventoryItem } from '../../types/inventory';

function getCurrentQty(item: InventoryItem): number {
    return typeof item.current_quantity === 'number' ? item.current_quantity : 0;
}

function formatMoneyFromCents(cents: number, currency: string): string {
    const value = (Number.isFinite(cents) ? cents : 0) / 100;
    try {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: currency || 'EUR',
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        return `${currency || 'EUR'} ${value.toFixed(2)}`;
    }
}

type CartLine = {
    itemId?: string;
    customId?: string;
    customName?: string;
    unitPriceCents?: number;
    quantity: number;
};

type BookingOption = {
    id: string;
    start_at: string;
    end_at: string;
    status: string;
    courtName: string;
    playerIds: string[];
};

function todayIsoDate(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

function bookingTimeLabel(booking: BookingOption): string {
    const start = new Date(booking.start_at);
    const end = new Date(booking.end_at);
    const fmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
    return `${fmt.format(start)} - ${fmt.format(end)} · ${booking.courtName}`;
}

function cartLineKey(line: CartLine): string {
    return line.itemId ?? line.customId ?? '';
}

export function QuickSaleCart({ clubId, clubResolved = true }: { clubId: string | null; clubResolved?: boolean }) {
    const navigate = useNavigate();
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [categories, setCategories] = useState<InventoryCategory[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [showProductCatalog, setShowProductCatalog] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState('todos');
    const [customProductName, setCustomProductName] = useState('');
    const [customProductPrice, setCustomProductPrice] = useState('');
    const [cartLines, setCartLines] = useState<CartLine[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
    const [playerSearch, setPlayerSearch] = useState('');
    const [playerResults, setPlayerResults] = useState<Player[]>([]);
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [bookingOptions, setBookingOptions] = useState<BookingOption[]>([]);
    const [selectedBookingId, setSelectedBookingId] = useState('');

    const load = useCallback(async () => {
        if (!clubId) return;
        setLoading(true);
        try {
            const [data, categoryData] = await Promise.all([
                inventoryService.listItems(clubId),
                inventoryService.listCategories(clubId),
            ]);
            setItems(data);
            setCategories(categoryData);
        } catch (e) {
            toast.error((e as Error).message || 'Error al cargar productos');
            setItems([]);
            setCategories([]);
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!clubId) return;
        const query = playerSearch.trim();
        if (query.length < 2) {
            setPlayerResults([]);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            try {
                const players = await playerService.getAll(query, clubId);
                if (!cancelled) setPlayerResults(players.slice(0, 8));
            } catch {
                if (!cancelled) setPlayerResults([]);
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [clubId, playerSearch]);

    useEffect(() => {
        if (!clubId || !selectedPlayer) {
            setBookingOptions([]);
            setSelectedBookingId('');
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const q = new URLSearchParams({ club_id: clubId, date: todayIsoDate() });
                const res = await apiFetchWithAuth<{ ok: true; bookings: any[] }>(`/bookings?${q}`);
                if (cancelled) return;
                const options = (res.bookings ?? [])
                    .map((booking: any): BookingOption => {
                        const participants = Array.isArray(booking.booking_participants) ? booking.booking_participants : [];
                        const playerIds = [
                            booking.organizer_player_id,
                            ...participants.map((participant: any) => participant?.player_id),
                        ].filter(Boolean).map(String);
                        const rawCourt = Array.isArray(booking.courts) ? booking.courts[0] : booking.courts;
                        return {
                            id: String(booking.id),
                            start_at: String(booking.start_at ?? ''),
                            end_at: String(booking.end_at ?? ''),
                            status: String(booking.status ?? ''),
                            courtName: String(rawCourt?.name ?? 'Pista'),
                            playerIds,
                        };
                    })
                    .filter((booking) => booking.status !== 'cancelled' && booking.playerIds.includes(selectedPlayer.id));
                setBookingOptions(options);
                setSelectedBookingId((current) => options.some((booking) => booking.id === current) ? current : options[0]?.id ?? '');
            } catch (e) {
                if (!cancelled) {
                    setBookingOptions([]);
                    setSelectedBookingId('');
                    toast.error((e as Error).message || 'Error al cargar turnos del jugador');
                }
            }
        })();
        return () => { cancelled = true; };
    }, [clubId, selectedPlayer]);

    const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
    const saleItems = useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();
        return items
            .filter((item) => item.status === 'active' && getCurrentQty(item) > 0)
            .filter((item) => selectedCategoryId === 'todos' || item.category_id === selectedCategoryId)
            .filter((item) => {
                if (!normalizedSearch) return true;
                return item.name.toLowerCase().includes(normalizedSearch) || (item.sku ?? '').toLowerCase().includes(normalizedSearch);
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    }, [items, searchText, selectedCategoryId]);

    const cartTotalCents = cartLines.reduce((sum, line) => {
        if (line.itemId) {
            const item = itemById.get(line.itemId);
            return sum + (item?.unit_price_cents ?? 0) * line.quantity;
        }
        return sum + (line.unitPriceCents ?? 0) * line.quantity;
    }, 0);
    const currency = cartLines.map((line) => line.itemId ? itemById.get(line.itemId)?.currency : null).find(Boolean) ?? items[0]?.currency ?? 'EUR';

    const addItem = (item: InventoryItem) => {
        const stock = getCurrentQty(item);
        setCartLines((prev) => {
            const existing = prev.find((line) => line.itemId === item.id);
            const currentQty = existing?.quantity ?? 0;
            if (currentQty >= stock) {
                toast.error(`Stock disponible: ${stock}`);
                return prev;
            }
            if (existing) {
                return prev.map((line) => line.itemId === item.id ? { ...line, quantity: line.quantity + 1 } : line);
            }
            return [...prev, { itemId: item.id, quantity: 1 }];
        });
    };

    const addCustomItem = () => {
        const name = customProductName.trim();
        const price = Number(customProductPrice.trim().replace(',', '.'));
        if (!name) {
            toast.error('Nombre obligatorio para venta excepcional');
            return;
        }
        if (!Number.isFinite(price) || price <= 0) {
            toast.error('Precio inválido');
            return;
        }
        setCartLines((prev) => [
            ...prev,
            {
                customId: `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                customName: name,
                unitPriceCents: Math.round(price * 100),
                quantity: 1,
            },
        ]);
        setCustomProductName('');
        setCustomProductPrice('');
    };

    const updateLineQuantity = (lineKey: string, quantity: number) => {
        const target = cartLines.find((line) => cartLineKey(line) === lineKey);
        if (!target) return;
        if (!target.itemId) {
            const nextQuantity = Math.max(0, Math.trunc(quantity));
            setCartLines((prev) => {
                if (nextQuantity <= 0) return prev.filter((line) => cartLineKey(line) !== lineKey);
                return prev.map((line) => cartLineKey(line) === lineKey ? { ...line, quantity: nextQuantity } : line);
            });
            return;
        }
        const itemId = target.itemId;
        const item = itemById.get(itemId);
        if (!item) return;
        const stock = getCurrentQty(item);
        const nextQuantity = Math.max(0, Math.min(Math.trunc(quantity), stock));
        setCartLines((prev) => {
            if (nextQuantity <= 0) return prev.filter((line) => cartLineKey(line) !== lineKey);
            return prev.map((line) => cartLineKey(line) === lineKey ? { ...line, quantity: nextQuantity } : line);
        });
    };

    const canSubmitSale = Boolean(clubId && selectedPlayer && selectedBookingId && cartLines.length > 0 && !submitting);

    const submitSale = async () => {
        if (!clubId || cartLines.length === 0) return;
        if (!selectedPlayer) {
            toast.error('Selecciona un jugador/cliente');
            return;
        }
        if (!selectedBookingId) {
            toast.error('Selecciona el turno al que pertenece la compra');
            return;
        }
        setSubmitting(true);
        try {
            await inventoryService.createSale({
                club_id: clubId,
                booking_id: selectedBookingId,
                player_id: selectedPlayer.id,
                payment_method: paymentMethod,
                lines: cartLines.map((line) => ({
                    item_id: line.itemId,
                    quantity: line.quantity,
                    name: line.customName,
                    unit_price_cents: line.unitPriceCents,
                })),
            });
            toast.success('Ticket cargado');
            setCartLines([]);
            setEditMode(false);
            await load();
        } catch (e) {
            toast.error((e as Error).message || 'No se pudo cargar el ticket');
        } finally {
            setSubmitting(false);
        }
    };

    const topActions = [
        { label: 'Productos', onClick: () => setShowProductCatalog((value) => !value), tone: 'blue' },
        { label: 'Editar venta', onClick: () => setEditMode((value) => !value), tone: 'blue' },
        { label: 'Anular venta', onClick: () => setCartLines([]), tone: 'red' },
        { label: 'Añadir reservado', onClick: () => toast.info('Reservado añadido al ticket'), tone: 'blue' },
        { label: 'Buscar producto', onClick: () => searchInputRef.current?.focus(), tone: 'blue' },
        { label: 'Cargar ticket', onClick: submitSale, tone: 'blue', disabled: !canSubmitSale },
    ] as const;
    const categoryFilters = [
        { id: 'todos', label: 'Todos' },
        ...categories.map((category) => ({ id: category.id, label: category.name })),
    ];

    if (!clubResolved) {
        return (
            <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!clubId) {
        return <p className="text-sm text-gray-500 text-center py-12">No se pudo determinar el club. Vuelve a iniciar sesión.</p>;
    }

    return (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="rounded-3xl border border-gray-200 bg-gray-100 p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    {topActions.map((action) => (
                        <button
                            key={action.label}
                            type="button"
                            onClick={action.onClick}
                            disabled={action.disabled}
                            className={`${action.tone === 'red' ? 'bg-[#E31E24]' : 'bg-[#0B5B7A]'} rounded-xl px-3 py-3 text-xs font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>

                {showProductCatalog ? (
                    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">Productos</p>
                                <p className="text-xs font-bold text-[#1A1A1A]">Filtra por tipo o carga una venta excepcional.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => navigate('/inventario')}
                                className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                            >
                                Inventario
                            </button>
                        </div>
                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                            {categoryFilters.map((category) => (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() => setSelectedCategoryId(category.id)}
                                    className={`${selectedCategoryId === category.id ? 'bg-[#0B5B7A] text-white' : 'bg-gray-100 text-gray-600'} whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black`}
                                >
                                    {category.label}
                                </button>
                            ))}
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_130px_auto]">
                            <input
                                value={customProductName}
                                onChange={(e) => setCustomProductName(e.target.value)}
                                placeholder="Venta excepcional"
                                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none"
                            />
                            <input
                                value={customProductPrice}
                                onChange={(e) => setCustomProductPrice(e.target.value)}
                                inputMode="decimal"
                                placeholder="Precio"
                                className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none"
                            />
                            <button
                                type="button"
                                onClick={addCustomItem}
                                className="rounded-xl bg-[#E31E24] px-4 py-2 text-xs font-black text-white hover:opacity-90"
                            >
                                Agregar excepcional
                            </button>
                        </div>
                    </div>
                ) : null}

                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2">
                    <Search className="h-4 w-4 text-gray-400" />
                    <input
                        ref={searchInputRef}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Buscar producto de venta rápida"
                        className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
                    />
                </div>

                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : saleItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-8 text-center text-sm text-gray-500 mt-4">
                        No hay productos activos con stock disponible.
                    </div>
                ) : (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                        {saleItems.map((item) => {
                            const priceCents = item.unit_price_cents ?? 0;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => addItem(item)}
                                    className="min-h-[92px] rounded-xl border border-gray-200 bg-white px-3 py-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]"
                                >
                                    <span className="block text-[11px] font-black uppercase leading-tight text-[#1A1A1A]">
                                        {item.name}
                                    </span>
                                    <span className="mt-2 block text-[10px] font-bold text-gray-400">Stock {getCurrentQty(item)}</span>
                                    <span className="mt-1 block text-[10px] font-black text-[#0B5B7A]">
                                        {formatMoneyFromCents(priceCents, item.currency || currency)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            <aside className="overflow-hidden rounded-3xl border border-gray-900 bg-[#111111] text-white shadow-xl">
                <div className="border-b border-white/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Nueva venta</p>
                            <h2 className="text-lg font-black">Ticket</h2>
                        </div>
                        <div className="rounded-2xl bg-white/10 p-2">
                            <ShoppingCart className="h-5 w-5" />
                        </div>
                    </div>
                </div>

                <div className="space-y-3 border-b border-white/10 p-4">
                    <div className="relative">
                        <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Jugador/cliente</label>
                        <input
                            value={selectedPlayer ? `${selectedPlayer.first_name} ${selectedPlayer.last_name}` : playerSearch}
                            onChange={(e) => {
                                setSelectedPlayer(null);
                                setSelectedBookingId('');
                                setPlayerSearch(e.target.value);
                            }}
                            placeholder="Buscar jugador"
                            className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white outline-none placeholder:text-white/30"
                        />
                        {!selectedPlayer && playerResults.length > 0 ? (
                            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-white/10 bg-[#1A1A1A] shadow-xl">
                                {playerResults.map((player) => (
                                    <button
                                        key={player.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedPlayer(player);
                                            setPlayerSearch('');
                                            setPlayerResults([]);
                                        }}
                                        className="block w-full px-3 py-2 text-left text-xs font-semibold text-white hover:bg-white/10"
                                    >
                                        {player.first_name} {player.last_name}
                                        <span className="ml-2 text-[10px] text-white/35">{player.phone || player.email || ''}</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Turno de hoy</label>
                        <select
                            value={selectedBookingId}
                            onChange={(e) => setSelectedBookingId(e.target.value)}
                            disabled={!selectedPlayer || bookingOptions.length === 0}
                            className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white outline-none disabled:opacity-50"
                        >
                            <option value="">Seleccionar turno</option>
                            {bookingOptions.map((booking) => (
                                <option key={booking.id} value={booking.id} className="text-black">
                                    {bookingTimeLabel(booking)}
                                </option>
                            ))}
                        </select>
                        {selectedPlayer && bookingOptions.length === 0 ? (
                            <p className="mt-1 text-[10px] font-semibold text-red-200">Este jugador no tiene turnos activos hoy.</p>
                        ) : null}
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Forma de pago</label>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                            {(['cash', 'card'] as const).map((method) => (
                                <button
                                    key={method}
                                    type="button"
                                    onClick={() => setPaymentMethod(method)}
                                    className={`${paymentMethod === method ? 'bg-[#E31E24] text-white' : 'bg-white/10 text-white/60'} rounded-xl px-3 py-2 text-xs font-black transition hover:bg-white/15`}
                                >
                                    {method === 'cash' ? 'Efectivo' : 'Tarjeta'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="min-h-[260px] space-y-2 p-4">
                    {cartLines.length === 0 ? (
                        <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 text-center">
                            <Package className="h-8 w-8 text-white/30" />
                            <p className="mt-3 text-xs font-semibold text-white/50">Selecciona productos para iniciar la venta.</p>
                        </div>
                    ) : (
                        cartLines.map((line) => {
                            const item = line.itemId ? itemById.get(line.itemId) : null;
                            const name = item?.name ?? line.customName ?? 'Venta excepcional';
                            const unitPriceCents = item?.unit_price_cents ?? line.unitPriceCents ?? 0;
                            const lineCurrency = item?.currency || currency;
                            const lineTotal = unitPriceCents * line.quantity;
                            const key = cartLineKey(line);
                            return (
                                <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-black">{name}</p>
                                            <p className="mt-1 text-[10px] font-semibold text-white/50">
                                                {line.quantity} x {formatMoneyFromCents(unitPriceCents, lineCurrency)}
                                                {!item ? ' · Excepcional' : ''}
                                            </p>
                                        </div>
                                        <p className="text-xs font-black">{formatMoneyFromCents(lineTotal, lineCurrency)}</p>
                                    </div>

                                    {editMode ? (
                                        <div className="mt-3 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => updateLineQuantity(key, line.quantity - 1)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/15"
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </button>
                                                <span className="w-7 text-center text-xs font-black">{line.quantity}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => updateLineQuantity(key, line.quantity + 1)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/15"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateLineQuantity(key, 0)}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E31E24]/20 text-red-200 hover:bg-[#E31E24]/30"
                                                aria-label="Quitar producto"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="border-t border-white/10 p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-white/50">Total</span>
                        <span className="text-2xl font-black">{formatMoneyFromCents(cartTotalCents, currency)}</span>
                    </div>
                    <button
                        type="button"
                        onClick={submitSale}
                        disabled={!canSubmitSale}
                        className="w-full rounded-2xl bg-[#E31E24] px-4 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {submitting ? 'Cargando ticket...' : 'Cargar ticket'}
                    </button>
                </div>
            </aside>
        </div>
    );
}
