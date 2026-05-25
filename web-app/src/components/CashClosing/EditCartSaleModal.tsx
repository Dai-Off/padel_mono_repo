import { useCallback, useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryService, type CartSaleDetail } from '../../services/inventory';
import { playerService } from '../../services/player';
import type { InventoryItem } from '../../types/inventory';

type ModalLine = {
    key: string;
    itemId?: string;
    customName?: string;
    unitPriceCents: number;
    quantity: number;
};

type ModalBookingLine = {
    bookingId: string;
    chargeScope: 'full' | 'player_share';
    amountCents: number;
    label: string;
};

function formatMoney(cents: number, currency = 'EUR'): string {
    const value = cents / 100;
    try {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
    } catch {
        return `${value.toFixed(2)} ${currency}`;
    }
}

function cartLineKey(line: ModalLine): string {
    return line.itemId ?? line.key;
}

function getStock(item: InventoryItem): number {
    return typeof item.current_quantity === 'number' ? item.current_quantity : 0;
}

export function EditCartSaleModal({
    clubId,
    saleId,
    onClose,
    onSaved,
}: {
    clubId: string;
    saleId: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [playerLabel, setPlayerLabel] = useState('');
    const [playerId, setPlayerId] = useState('');
    const [lines, setLines] = useState<ModalLine[]>([]);
    const [bookingLines, setBookingLines] = useState<ModalBookingLine[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'wallet'>('cash');
    const [useWallet, setUseWallet] = useState(false);
    const [walletAmountCents, setWalletAmountCents] = useState(0);
    const [addItemId, setAddItemId] = useState('');
    const [customName, setCustomName] = useState('');
    const [customPrice, setCustomPrice] = useState('');
    const [currency, setCurrency] = useState('EUR');

    const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

    const applySale = useCallback((sale: CartSaleDetail) => {
        setPlayerId(sale.player_id);
        setWalletAmountCents(sale.wallet_amount_cents);
        setUseWallet(sale.wallet_amount_cents > 0);
        const method = sale.payment_method;
        if (method.includes('wallet') && !method.includes('cash') && !method.includes('card')) {
            setPaymentMethod('wallet');
        } else if (method.includes('card')) {
            setPaymentMethod('card');
        } else {
            setPaymentMethod('cash');
        }
        setLines(
            sale.lines.map((line, idx) => ({
                key: line.item_id ?? `custom_${idx}`,
                itemId: line.item_id,
                customName: line.custom_name,
                unitPriceCents: line.unit_price_cents,
                quantity: line.quantity,
            })),
        );
        setBookingLines(
            sale.booking_charges.map((c) => ({
                bookingId: c.booking_id,
                chargeScope: c.charge_scope,
                amountCents: c.amount_cents,
                label: c.charge_scope === 'full' ? 'Turno completo' : 'Su parte',
            })),
        );
        setCurrency(sale.currency || 'EUR');
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [sale, catalog, players] = await Promise.all([
                    inventoryService.getSale(clubId, saleId),
                    inventoryService.listItems(clubId),
                    playerService.getAll('', clubId),
                ]);
                if (cancelled) return;
                if (sale.voided) {
                    toast.error('Esta venta ya está anulada');
                    onClose();
                    return;
                }
                setItems(catalog.filter((i) => i.status === 'active'));
                const player = players.find((p) => p.id === sale.player_id);
                setPlayerLabel(player ? `${player.first_name} ${player.last_name}` : 'Cliente');
                applySale(sale);
            } catch (e) {
                if (!cancelled) {
                    toast.error((e as Error).message || 'No se pudo cargar la venta');
                    onClose();
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [clubId, saleId, applySale, onClose]);

    const productsCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    const bookingsCents = bookingLines.reduce((s, l) => s + l.amountCents, 0);
    const totalCents = productsCents + bookingsCents;

    const updateQty = (key: string, delta: number) => {
        setLines((prev) =>
            prev
                .map((line) => {
                    if (cartLineKey(line) !== key) return line;
                    const item = line.itemId ? itemById.get(line.itemId) : null;
                    const max = item ? getStock(item) + line.quantity : 999;
                    const next = Math.max(0, Math.min(line.quantity + delta, max));
                    return { ...line, quantity: next };
                })
                .filter((line) => line.quantity > 0),
        );
    };

    const updatePrice = (key: string, euros: string) => {
        const parsed = Math.round(Number(euros.replace(',', '.')) * 100);
        if (!Number.isFinite(parsed) || parsed <= 0) return;
        setLines((prev) => prev.map((line) => (cartLineKey(line) === key ? { ...line, unitPriceCents: parsed } : line)));
    };

    const addCatalogItem = () => {
        if (!addItemId) return;
        const item = itemById.get(addItemId);
        if (!item || getStock(item) <= 0) {
            toast.error('Sin stock');
            return;
        }
        setLines((prev) => {
            const existing = prev.find((l) => l.itemId === addItemId);
            if (existing) {
                return prev.map((l) =>
                    l.itemId === addItemId ? { ...l, quantity: Math.min(l.quantity + 1, getStock(item) + l.quantity) } : l,
                );
            }
            return [
                ...prev,
                {
                    key: addItemId,
                    itemId: addItemId,
                    unitPriceCents: item.unit_price_cents ?? 0,
                    quantity: 1,
                },
            ];
        });
        setAddItemId('');
    };

    const addCustomLine = () => {
        const name = customName.trim();
        const price = Number(customPrice.replace(',', '.'));
        if (!name) {
            toast.error('Nombre obligatorio');
            return;
        }
        if (!Number.isFinite(price) || price <= 0) {
            toast.error('Precio inválido');
            return;
        }
        setLines((prev) => [
            ...prev,
            {
                key: `custom_${Date.now()}`,
                customName: name,
                unitPriceCents: Math.round(price * 100),
                quantity: 1,
            },
        ]);
        setCustomName('');
        setCustomPrice('');
    };

    const buildPayload = () => ({
        club_id: clubId,
        player_id: playerId,
        payment_method: (useWallet && walletAmountCents >= totalCents ? 'wallet' : paymentMethod) as 'cash' | 'card' | 'wallet',
        wallet_amount_cents: useWallet ? Math.min(walletAmountCents, totalCents) : undefined,
        booking_charges: bookingLines.map((l) => ({ booking_id: l.bookingId, charge_scope: l.chargeScope })),
        lines: lines.map((line) => ({
            item_id: line.itemId,
            quantity: line.quantity,
            name: line.customName,
            unit_price_cents: line.unitPriceCents,
        })),
    });

    const handleSave = async () => {
        if (!playerId) {
            toast.error('Falta el cliente de la venta');
            return;
        }
        if (lines.length === 0 && bookingLines.length === 0) {
            toast.error('Añade al menos un producto o turno');
            return;
        }
        setSaving(true);
        try {
            await inventoryService.updateSale(saleId, buildPayload());
            toast.success('Venta actualizada');
            onSaved();
            onClose();
        } catch (e) {
            toast.error((e as Error).message || 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    const handleVoid = async () => {
        if (!window.confirm('¿Anular esta venta? Se restaurará stock, pagos y saldo bono. Afectará el arqueo del día.')) return;
        setSaving(true);
        try {
            await inventoryService.voidSale(clubId, saleId);
            toast.success('Venta anulada');
            onSaved();
            onClose();
        } catch (e) {
            toast.error((e as Error).message || 'No se pudo anular');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
        >
            <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">Editar venta</p>
                        <h3 className="text-lg font-black text-[#1A1A1A]">Ticket #{saleId.slice(-6)}</h3>
                        <p className="mt-1 text-xs font-semibold text-gray-500">{playerLabel}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50" aria-label="Cerrar">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-4 border-[#0B5B7A] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Líneas del ticket</p>
                                {lines.length === 0 && bookingLines.length === 0 ? (
                                    <p className="text-xs text-gray-500 py-4 text-center">Sin líneas</p>
                                ) : null}
                                {bookingLines.map((bl) => (
                                    <div key={bl.bookingId} className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-bold text-emerald-900">{bl.label}</p>
                                            <p className="text-xs font-black">{formatMoney(bl.amountCents, currency)}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setBookingLines((p) => p.filter((x) => x.bookingId !== bl.bookingId))}
                                            className="mt-1 text-[10px] font-bold text-red-600 hover:underline"
                                        >
                                            Quitar turno
                                        </button>
                                    </div>
                                ))}
                                {lines.map((line) => {
                                    const item = line.itemId ? itemById.get(line.itemId) : null;
                                    const name = item?.name ?? line.customName ?? 'Producto';
                                    const key = cartLineKey(line);
                                    return (
                                        <div key={key} className="rounded-xl border border-gray-200 px-3 py-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-xs font-bold text-[#1A1A1A]">{name}</p>
                                                <p className="text-xs font-black shrink-0">
                                                    {formatMoney(line.unitPriceCents * line.quantity, currency)}
                                                </p>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <button type="button" onClick={() => updateQty(key, -1)} className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center">
                                                    <Minus className="h-3 w-3" />
                                                </button>
                                                <span className="w-6 text-center text-xs font-black">{line.quantity}</span>
                                                <button type="button" onClick={() => updateQty(key, 1)} className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center">
                                                    <Plus className="h-3 w-3" />
                                                </button>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    defaultValue={(line.unitPriceCents / 100).toFixed(2)}
                                                    key={`${key}-${line.unitPriceCents}`}
                                                    onBlur={(e) => updatePrice(key, e.target.value)}
                                                    className="ml-auto w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs font-bold text-right"
                                                />
                                                <span className="text-[10px] text-gray-400">€/ud</span>
                                                <button type="button" onClick={() => setLines((p) => p.filter((l) => cartLineKey(l) !== key))} className="h-7 w-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="rounded-xl border border-dashed border-gray-200 p-3 space-y-2">
                                <p className="text-[10px] font-bold uppercase text-gray-400">Añadir producto</p>
                                <div className="flex gap-2">
                                    <select
                                        value={addItemId}
                                        onChange={(e) => setAddItemId(e.target.value)}
                                        className="flex-1 rounded-xl border border-gray-200 px-2 py-2 text-xs"
                                    >
                                        <option value="">Elegir producto…</option>
                                        {items
                                            .filter((i) => getStock(i) > 0)
                                            .map((i) => (
                                                <option key={i.id} value={i.id}>
                                                    {i.name} (stock {getStock(i)})
                                                </option>
                                            ))}
                                    </select>
                                    <button type="button" onClick={addCatalogItem} className="rounded-xl bg-[#0B5B7A] px-3 py-2 text-xs font-black text-white">
                                        +
                                    </button>
                                </div>
                                <div className="grid grid-cols-[1fr_80px_auto] gap-2">
                                    <input
                                        value={customName}
                                        onChange={(e) => setCustomName(e.target.value)}
                                        placeholder="Venta excepcional"
                                        className="rounded-xl border border-gray-200 px-2 py-2 text-xs"
                                    />
                                    <input
                                        value={customPrice}
                                        onChange={(e) => setCustomPrice(e.target.value)}
                                        inputMode="decimal"
                                        placeholder="Precio"
                                        className="rounded-xl border border-gray-200 px-2 py-2 text-xs"
                                    />
                                    <button type="button" onClick={addCustomLine} className="rounded-xl bg-[#E31E24] px-3 py-2 text-xs font-black text-white">
                                        +
                                    </button>
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] font-bold uppercase text-gray-400 mb-2">Forma de pago</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['cash', 'card'] as const).map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setPaymentMethod(m)}
                                            className={`rounded-xl px-3 py-2 text-xs font-black ${paymentMethod === m ? 'bg-[#0B5B7A] text-white' : 'bg-gray-100 text-gray-600'}`}
                                        >
                                            {m === 'cash' ? 'Efectivo' : 'Tarjeta'}
                                        </button>
                                    ))}
                                </div>
                                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-gray-600">
                                    <input type="checkbox" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} className="accent-[#0B5B7A]" />
                                    Usar saldo bono ({formatMoney(walletAmountCents, currency)})
                                </label>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                <span className="text-xs font-bold text-gray-500">Total</span>
                                <span className="text-xl font-black">{formatMoney(totalCents, currency)}</span>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row">
                    <button
                        type="button"
                        onClick={handleVoid}
                        disabled={loading || saving}
                        className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                        Anular venta
                    </button>
                    <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-600 hover:bg-gray-50">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={loading || saving}
                        className="flex-1 rounded-2xl bg-[#0B5B7A] px-4 py-3 text-sm font-black text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
