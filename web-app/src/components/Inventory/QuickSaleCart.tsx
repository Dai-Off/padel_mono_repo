import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Minus, Package, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { inventoryService, type CartSaleDetail } from '../../services/inventory';
import { playerService } from '../../services/player';
import { apiFetchWithAuth } from '../../services/api';
import { browserIanaTimeZone } from '../../lib/browserTimeZone';
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
    /** Precio manual al editar venta o línea excepcional */
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
    total_price_cents: number;
    currency: string;
    bookingPaidCents: number;
    playerShareCents: number;
    playerPaidCents: number;
};

type CartBookingLine = {
    bookingId: string;
    chargeScope: 'full' | 'player_share';
    label: string;
    amountCents: number;
    currency: string;
};

function computeChargeCents(booking: BookingOption, scope: 'full' | 'player_share'): number {
    if (scope === 'full') {
        return Math.max(0, booking.total_price_cents - booking.bookingPaidCents);
    }
    const share = booking.playerShareCents > 0
        ? booking.playerShareCents
        : (booking.total_price_cents > 0 ? Math.ceil(booking.total_price_cents / 4) : 0);
    return Math.max(0, share - booking.playerPaidCents);
}

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

function isQuickSaleItem(item: InventoryItem): boolean {
    return item.quick_sale_enabled === true;
}

export function QuickSaleCart({ clubId, clubResolved = true }: { clubId: string | null; clubResolved?: boolean }) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
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
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'wallet'>('cash');
    const [useWallet, setUseWallet] = useState(false);
    const [walletBalanceCents, setWalletBalanceCents] = useState(0);
    const [playerSearch, setPlayerSearch] = useState('');
    const [playerResults, setPlayerResults] = useState<Player[]>([]);
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [bookingOptions, setBookingOptions] = useState<BookingOption[]>([]);
    const [cartBookingLines, setCartBookingLines] = useState<CartBookingLine[]>([]);
    const [saleWithoutBooking, setSaleWithoutBooking] = useState(false);
    const [bookingChargeScope, setBookingChargeScope] = useState<'full' | 'player_share'>('full');
    const [showAddBookingsModal, setShowAddBookingsModal] = useState(false);
    const [modalBookingSelection, setModalBookingSelection] = useState<string[]>([]);
    const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
    const [loadingSale, setLoadingSale] = useState(false);
    const pendingDeepLinkBookingIdRef = useRef<string | null>(null);
    const pendingSaleBookingChargesRef = useRef<CartSaleDetail['booking_charges'] | null>(null);

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

    const deepLinkPlayerId = searchParams.get('player');
    const deepLinkBookingId = searchParams.get('booking');
    const deepLinkSaleId = searchParams.get('sale');

    const clearDraftCart = useCallback(() => {
        setCartLines([]);
        setCartBookingLines([]);
        setEditMode(false);
        setEditingSaleId(null);
        pendingSaleBookingChargesRef.current = null;
    }, []);

    const applySaleToCart = useCallback((sale: CartSaleDetail) => {
        setEditingSaleId(sale.id);
        setEditMode(true);
        setCartLines(
            sale.lines.map((line) => {
                if (line.item_id) {
                    return {
                        itemId: line.item_id,
                        quantity: line.quantity,
                        unitPriceCents: line.unit_price_cents,
                    };
                }
                return {
                    customId: `custom_${line.custom_name ?? 'item'}_${line.unit_price_cents}`,
                    customName: line.custom_name,
                    unitPriceCents: line.unit_price_cents,
                    quantity: line.quantity,
                };
            }),
        );
        pendingSaleBookingChargesRef.current = sale.booking_charges;
        const method = sale.payment_method;
        if (method.includes('wallet') && !method.includes('cash') && !method.includes('card')) {
            setPaymentMethod('wallet');
            setUseWallet(true);
        } else if (method.includes('card')) {
            setPaymentMethod('card');
            setUseWallet(sale.wallet_amount_cents > 0);
        } else {
            setPaymentMethod('cash');
            setUseWallet(sale.wallet_amount_cents > 0);
        }
        if (sale.wallet_amount_cents > 0) setUseWallet(true);
        setSaleWithoutBooking(sale.booking_charges.length === 0 && !sale.link_booking_id);
    }, []);

    useEffect(() => {
        if (!clubId || !deepLinkSaleId) return;
        let cancelled = false;
        setLoadingSale(true);
        (async () => {
            try {
                const sale = await inventoryService.getSale(clubId, deepLinkSaleId);
                if (cancelled) return;
                if (sale.voided) {
                    toast.error('Esta venta ya está anulada');
                    return;
                }
                const players = await playerService.getAll('', clubId);
                const player = players.find((p) => p.id === sale.player_id);
                if (player) {
                    setSelectedPlayer(player);
                    setPlayerSearch('');
                }
                applySaleToCart(sale);
                const next = new URLSearchParams(searchParams);
                next.delete('sale');
                setSearchParams(next, { replace: true });
            } catch (e) {
                if (!cancelled) toast.error((e as Error).message || 'No se pudo cargar la venta');
            } finally {
                if (!cancelled) setLoadingSale(false);
            }
        })();
        return () => { cancelled = true; };
    }, [clubId, deepLinkSaleId, applySaleToCart, searchParams, setSearchParams]);

    useEffect(() => {
        if (!clubId || !deepLinkPlayerId) return;
        let cancelled = false;
        (async () => {
            try {
                const players = await playerService.getAll('', clubId);
                const player = players.find((p) => p.id === deepLinkPlayerId);
                if (!cancelled && player) {
                    setSelectedPlayer(player);
                    setPlayerSearch('');
                    if (deepLinkBookingId) {
                        setSaleWithoutBooking(false);
                        pendingDeepLinkBookingIdRef.current = deepLinkBookingId;
                    }
                }
            } catch {
                /* ignore */
            } finally {
                if (!cancelled) {
                    const next = new URLSearchParams(searchParams);
                    next.delete('player');
                    next.delete('booking');
                    setSearchParams(next, { replace: true });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [clubId, deepLinkPlayerId, deepLinkBookingId, searchParams, setSearchParams]);

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
            setCartBookingLines([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const q = new URLSearchParams({
                    club_id: clubId,
                    date: todayIsoDate(),
                    time_zone: browserIanaTimeZone(),
                });
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
                        const bookingPaidCents = (booking.payment_transactions ?? [])
                            .filter((t: any) => t.status === 'succeeded')
                            .reduce((sum: number, t: any) => sum + Math.trunc(Number(t.amount_cents ?? 0)), 0);
                        const playerParticipant = participants.find(
                            (p: any) => String(p.player_id) === selectedPlayer.id,
                        );
                        const playerPaidCents =
                            (playerParticipant?.paid_amount_cents ?? 0) + (playerParticipant?.wallet_amount_cents ?? 0);
                        const totalPrice = Math.trunc(Number(booking.total_price_cents ?? 0));
                        const playerShare = Math.trunc(Number(playerParticipant?.share_amount_cents ?? 0));
                        return {
                            id: String(booking.id),
                            start_at: String(booking.start_at ?? ''),
                            end_at: String(booking.end_at ?? ''),
                            status: String(booking.status ?? ''),
                            courtName: String(rawCourt?.name ?? 'Pista'),
                            playerIds,
                            total_price_cents: totalPrice,
                            currency: String(booking.currency ?? 'EUR'),
                            bookingPaidCents,
                            playerShareCents: playerShare,
                            playerPaidCents,
                        };
                    })
                    .filter((booking) => booking.status !== 'cancelled' && booking.playerIds.includes(selectedPlayer.id));
                setBookingOptions(options);
                setCartBookingLines((prev) =>
                    prev
                        .filter((line) => options.some((booking) => booking.id === line.bookingId))
                        .map((line) => {
                            const booking = options.find((b) => b.id === line.bookingId);
                            if (!booking) return line;
                            const amountCents = computeChargeCents(booking, line.chargeScope);
                            return {
                                ...line,
                                amountCents,
                                currency: booking.currency,
                                label: `${bookingTimeLabel(booking)} · ${line.chargeScope === 'full' ? 'Turno completo' : 'Su parte'}`,
                            };
                        }),
                );
                const pendingCharges = pendingSaleBookingChargesRef.current;
                if (pendingCharges && pendingCharges.length > 0) {
                    pendingSaleBookingChargesRef.current = null;
                    const newLines: CartBookingLine[] = [];
                    for (const charge of pendingCharges) {
                        const booking = options.find((b) => b.id === charge.booking_id);
                        if (!booking) continue;
                        const amountCents = charge.amount_cents;
                        if (amountCents <= 0) continue;
                        newLines.push({
                            bookingId: charge.booking_id,
                            chargeScope: charge.charge_scope,
                            label: `${bookingTimeLabel(booking)} · ${charge.charge_scope === 'full' ? 'Turno completo' : 'Su parte'}`,
                            amountCents,
                            currency: booking.currency,
                        });
                    }
                    if (newLines.length > 0) setCartBookingLines(newLines);
                }
                const pendingBookingId = pendingDeepLinkBookingIdRef.current;
                if (pendingBookingId) {
                    pendingDeepLinkBookingIdRef.current = null;
                    const linkedBooking = options.find((booking) => booking.id === pendingBookingId);
                    if (linkedBooking) {
                        const result = tryAddBookingToCart(linkedBooking);
                        if (result === 'added') toast.success('Turno del enlace añadido al ticket');
                        else if (result === 'paid') toast.info('El turno del enlace ya está pagado');
                        else if (result === 'duplicate') toast.info('El turno del enlace ya está en el carrito');
                    } else {
                        toast.error('No se encontró el turno del enlace para hoy');
                    }
                }
            } catch (e) {
                if (!cancelled) {
                    setBookingOptions([]);
                    setCartBookingLines([]);
                    toast.error((e as Error).message || 'Error al cargar turnos del jugador');
                }
            }
        })();
        return () => { cancelled = true; };
    }, [clubId, selectedPlayer]);

    useEffect(() => {
        if (!clubId || !selectedPlayer) {
            setWalletBalanceCents(0);
            setUseWallet(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const q = new URLSearchParams({ player_id: selectedPlayer.id, club_id: clubId });
                const res = await apiFetchWithAuth<{ ok: true; balance_cents: number }>(`/wallet/balance?${q}`);
                if (!cancelled) {
                    const balance = Math.max(0, res.balance_cents ?? 0);
                    setWalletBalanceCents(balance);
                    if (balance <= 0) setUseWallet(false);
                }
            } catch {
                if (!cancelled) setWalletBalanceCents(0);
            }
        })();
        return () => { cancelled = true; };
    }, [clubId, selectedPlayer]);

    const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
    const saleItems = useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();
        const searching = normalizedSearch.length > 0;
        const browsingCategory = showProductCatalog && selectedCategoryId !== 'todos';
        const showAllMatching = searching || browsingCategory;

        return items
            .filter((item) => item.status === 'active' && getCurrentQty(item) > 0)
            .filter((item) => selectedCategoryId === 'todos' || item.category_id === selectedCategoryId)
            .filter((item) => {
                if (!normalizedSearch) return true;
                return item.name.toLowerCase().includes(normalizedSearch) || (item.sku ?? '').toLowerCase().includes(normalizedSearch);
            })
            .filter((item) => showAllMatching || isQuickSaleItem(item))
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    }, [items, searchText, selectedCategoryId, showProductCatalog]);

    const productsTotalCents = cartLines.reduce((sum, line) => {
        if (line.itemId) {
            const item = itemById.get(line.itemId);
            const unit = line.unitPriceCents ?? item?.unit_price_cents ?? 0;
            return sum + unit * line.quantity;
        }
        return sum + (line.unitPriceCents ?? 0) * line.quantity;
    }, 0);
    const bookingsTotalCents = cartBookingLines.reduce((sum, line) => sum + line.amountCents, 0);
    const cartTotalCents = productsTotalCents + bookingsTotalCents;
    const currency =
        cartBookingLines[0]?.currency
        ?? cartLines.map((line) => (line.itemId ? itemById.get(line.itemId)?.currency : null)).find(Boolean)
        ?? items[0]?.currency
        ?? 'EUR';
    const walletAppliedCents = useWallet ? Math.min(walletBalanceCents, cartTotalCents) : 0;
    const remainderCents = Math.max(0, cartTotalCents - walletAppliedCents);

    type AddBookingResult = 'added' | 'duplicate' | 'paid' | 'blocked';

    const buildBookingCartLine = (booking: BookingOption, scope: 'full' | 'player_share'): CartBookingLine | null => {
        const amountCents = computeChargeCents(booking, scope);
        if (amountCents <= 0) return null;
        return {
            bookingId: booking.id,
            chargeScope: scope,
            label: `${bookingTimeLabel(booking)} · ${scope === 'full' ? 'Turno completo' : 'Su parte'}`,
            amountCents,
            currency: booking.currency,
        };
    };

    const tryAddBookingToCart = (booking: BookingOption, scope = bookingChargeScope): AddBookingResult => {
        if (saleWithoutBooking) return 'blocked';
        if (cartBookingLines.some((line) => line.bookingId === booking.id)) return 'duplicate';
        const line = buildBookingCartLine(booking, scope);
        if (!line) return 'paid';
        setCartBookingLines((prev) => [...prev, line]);
        return 'added';
    };

    const addBookingToCart = (booking: BookingOption) => {
        const result = tryAddBookingToCart(booking);
        if (result === 'blocked') {
            toast.error('Desactiva «Venta sin turno» para cobrar reservas');
            return;
        }
        if (result === 'duplicate') {
            toast.error('Ese turno ya está en el carrito');
            return;
        }
        if (result === 'paid') {
            toast.error(bookingChargeScope === 'full' ? 'El turno ya está pagado' : 'La parte de este jugador ya está pagada');
            return;
        }
        toast.success('Turno añadido al ticket');
    };

    const openAddBookingsModal = () => {
        if (!selectedPlayer) {
            toast.error('Selecciona un jugador/cliente primero');
            return;
        }
        if (saleWithoutBooking) {
            toast.error('Desactiva «Venta sin turno» para cobrar reservas');
            return;
        }
        setModalBookingSelection([]);
        setShowAddBookingsModal(true);
    };

    const toggleModalBookingSelection = (bookingId: string) => {
        setModalBookingSelection((prev) =>
            prev.includes(bookingId) ? prev.filter((id) => id !== bookingId) : [...prev, bookingId],
        );
    };

    const confirmAddBookingsFromModal = () => {
        if (modalBookingSelection.length === 0) {
            toast.error('Selecciona al menos un turno');
            return;
        }
        const newLines: CartBookingLine[] = [];
        let skippedPaid = 0;
        let skippedDuplicate = 0;
        const existingIds = new Set(cartBookingLines.map((line) => line.bookingId));
        for (const bookingId of modalBookingSelection) {
            const booking = bookingOptions.find((option) => option.id === bookingId);
            if (!booking) continue;
            if (existingIds.has(booking.id) || newLines.some((line) => line.bookingId === booking.id)) {
                skippedDuplicate += 1;
                continue;
            }
            const line = buildBookingCartLine(booking, bookingChargeScope);
            if (!line) {
                skippedPaid += 1;
                continue;
            }
            newLines.push(line);
            existingIds.add(booking.id);
        }
        setShowAddBookingsModal(false);
        setModalBookingSelection([]);
        if (newLines.length > 0) {
            setCartBookingLines((prev) => [...prev, ...newLines]);
            toast.success(
                newLines.length === 1 ? 'Turno añadido al ticket' : `${newLines.length} turnos añadidos al ticket`,
            );
        }
        if (newLines.length === 0) {
            if (skippedPaid > 0) {
                toast.error('Los turnos seleccionados ya están pagados');
            } else if (skippedDuplicate > 0) {
                toast.error('Los turnos seleccionados ya están en el carrito');
            } else {
                toast.error('No se pudo añadir ningún turno');
            }
        } else if (skippedPaid > 0 || skippedDuplicate > 0) {
            toast.info('Algunos turnos no se añadieron (ya pagados o ya en el ticket)');
        }
    };

    const removeBookingLine = (bookingId: string) => {
        setCartBookingLines((prev) => prev.filter((line) => line.bookingId !== bookingId));
    };
    const needsSecondaryPayment = useWallet && remainderCents > 0;

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

    const updateLineUnitPrice = (lineKey: string, unitPriceCents: number) => {
        const nextPrice = Math.max(1, Math.trunc(unitPriceCents));
        setCartLines((prev) =>
            prev.map((line) => {
                if (cartLineKey(line) !== lineKey) return line;
                if (line.itemId) return { ...line, unitPriceCents: nextPrice };
                return { ...line, unitPriceCents: nextPrice };
            }),
        );
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

    const hasCartContent = cartLines.length > 0 || cartBookingLines.length > 0;
    const canSubmitSale = Boolean(clubId && selectedPlayer && hasCartContent && !submitting);

    const submitSale = async () => {
        if (!clubId || !hasCartContent) return;
        if (!selectedPlayer) {
            toast.error('Selecciona un jugador/cliente');
            return;
        }
        if (saleWithoutBooking && cartBookingLines.length > 0) {
            toast.error('Quita los turnos del carrito o desactiva «Venta sin turno»');
            return;
        }
        if (useWallet && walletBalanceCents <= 0) {
            toast.error('El jugador no tiene saldo bono disponible');
            return;
        }
        if (needsSecondaryPayment && paymentMethod === 'wallet') {
            toast.error('Elige efectivo o tarjeta para el importe restante');
            return;
        }
        const effectiveMethod =
            useWallet && walletAppliedCents >= cartTotalCents
                ? 'wallet'
                : needsSecondaryPayment
                    ? paymentMethod === 'wallet'
                        ? 'cash'
                        : paymentMethod
                    : paymentMethod;

        setSubmitting(true);
        try {
            const linkBookingId =
                !saleWithoutBooking && cartBookingLines.length > 0
                    ? cartBookingLines[0].bookingId
                    : undefined;
            const salePayload = {
                club_id: clubId,
                booking_id: linkBookingId,
                player_id: selectedPlayer.id,
                payment_method: effectiveMethod as 'cash' | 'card' | 'wallet',
                wallet_amount_cents: useWallet ? walletAppliedCents : undefined,
                booking_charges: cartBookingLines.map((line) => ({
                    booking_id: line.bookingId,
                    charge_scope: line.chargeScope,
                })),
                lines: cartLines.map((line) => {
                    const item = line.itemId ? itemById.get(line.itemId) : null;
                    return {
                        item_id: line.itemId,
                        quantity: line.quantity,
                        name: line.customName,
                        unit_price_cents: line.unitPriceCents ?? item?.unit_price_cents,
                    };
                }),
            };
            if (editingSaleId) {
                await inventoryService.updateSale(editingSaleId, salePayload);
                toast.success('Venta actualizada');
            } else {
                await inventoryService.createSale(salePayload);
                toast.success('Ticket cargado');
            }
            clearDraftCart();
            await load();
        } catch (e) {
            toast.error((e as Error).message || 'No se pudo cargar el ticket');
        } finally {
            setSubmitting(false);
        }
    };

    type TopBarAction = {
        label: string;
        onClick: () => void;
        tone: 'blue' | 'red';
        disabled?: boolean;
    };
    const voidSale = async () => {
        if (editingSaleId && clubId) {
            if (!window.confirm('¿Anular esta venta? Se revertirá stock, pagos y saldo bono. Afectará el arqueo del día.')) return;
            setSubmitting(true);
            try {
                await inventoryService.voidSale(clubId, editingSaleId);
                toast.success('Venta anulada');
                clearDraftCart();
                await load();
            } catch (e) {
                toast.error((e as Error).message || 'No se pudo anular la venta');
            } finally {
                setSubmitting(false);
            }
            return;
        }
        clearDraftCart();
        toast.info('Carrito vaciado');
    };

    const topActions: TopBarAction[] = [
        { label: 'Productos', onClick: () => setShowProductCatalog((value) => !value), tone: 'blue' },
        { label: editMode ? 'Listo' : 'Editar venta', onClick: () => setEditMode((value) => !value), tone: 'blue' },
        { label: editingSaleId ? 'Anular venta' : 'Vaciar carrito', onClick: voidSale, tone: 'red' },
        { label: 'Añadir reservas', onClick: openAddBookingsModal, tone: 'blue' },
        { label: 'Buscar producto', onClick: () => searchInputRef.current?.focus(), tone: 'blue' },
        {
            label: editingSaleId ? 'Guardar cambios' : 'Cargar ticket',
            onClick: submitSale,
            tone: 'blue',
            disabled: !canSubmitSale,
        },
    ];
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
        <>
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="rounded-3xl border border-gray-200 bg-gray-100 p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    {topActions.map((action) => (
                        <button
                            key={action.label}
                            type="button"
                            onClick={action.onClick}
                            disabled={action.disabled === true}
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
                        placeholder="Buscar en todo el catálogo (nombre o SKU)"
                        className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
                    />
                </div>

                {loading || loadingSale ? (
                    <div className="flex justify-center py-16">
                        <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : saleItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-8 text-center text-sm text-gray-500 mt-4">
                        {searchText.trim() || (showProductCatalog && selectedCategoryId !== 'todos') ? (
                            <>No hay productos que coincidan con la búsqueda o la categoría.</>
                        ) : (
                            <span>
                                No hay productos de venta rápida con stock. Marcálos en Inventario o abrí «Productos» y filtrá por
                                categoría, o buscá por nombre arriba.
                            </span>
                        )}
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
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">
                                {editingSaleId ? `Editando venta #${editingSaleId.slice(-6)}` : 'Nueva venta'}
                            </p>
                            <h2 className="text-lg font-black">{editingSaleId ? 'Modificar ticket' : 'Ticket'}</h2>
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
                                setCartBookingLines([]);
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

                    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <span className="text-xs font-bold text-white/80">Venta sin turno</span>
                        <input
                            type="checkbox"
                            checked={saleWithoutBooking}
                            onChange={(e) => {
                                setSaleWithoutBooking(e.target.checked);
                                if (e.target.checked) setCartBookingLines([]);
                            }}
                            className="h-4 w-4 accent-[#E31E24]"
                        />
                    </label>

                    {!saleWithoutBooking && selectedPlayer ? (
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Turnos de hoy</label>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setBookingChargeScope('full')}
                                    className={`${bookingChargeScope === 'full' ? 'bg-[#E31E24] text-white' : 'bg-white/10 text-white/60'} rounded-xl px-2 py-2 text-[10px] font-black`}
                                >
                                    Turno completo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBookingChargeScope('player_share')}
                                    className={`${bookingChargeScope === 'player_share' ? 'bg-[#E31E24] text-white' : 'bg-white/10 text-white/60'} rounded-xl px-2 py-2 text-[10px] font-black`}
                                >
                                    Su parte
                                </button>
                            </div>
                            {bookingOptions.length === 0 ? (
                                <p className="mt-2 text-[10px] font-semibold text-red-200">Sin turnos activos hoy para este jugador.</p>
                            ) : (
                                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                                    {bookingOptions.map((booking) => {
                                        const preview = computeChargeCents(booking, bookingChargeScope);
                                        const inCart = cartBookingLines.some((line) => line.bookingId === booking.id);
                                        return (
                                            <button
                                                key={booking.id}
                                                type="button"
                                                disabled={inCart || preview <= 0}
                                                onClick={() => addBookingToCart(booking)}
                                                className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-left disabled:opacity-40"
                                            >
                                                <span className="min-w-0 truncate text-[10px] font-semibold text-white/80">
                                                    {bookingTimeLabel(booking)}
                                                </span>
                                                <span className="shrink-0 text-[10px] font-black text-emerald-300">
                                                    {preview > 0 ? formatMoneyFromCents(preview, booking.currency) : 'Pagado'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : null}

                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Forma de pago</label>
                        <div className="mt-1 space-y-2">
                            <label
                                className={`flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 ${
                                    selectedPlayer && walletBalanceCents > 0 ? 'cursor-pointer' : 'opacity-70'
                                }`}
                            >
                                <span className="text-xs font-bold text-white/80">Usar saldo bono</span>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`text-[10px] font-semibold ${
                                            selectedPlayer && walletBalanceCents > 0 ? 'text-emerald-300' : 'text-white/40'
                                        }`}
                                    >
                                        {formatMoneyFromCents(selectedPlayer ? walletBalanceCents : 0, currency)}
                                    </span>
                                    <input
                                        type="checkbox"
                                        checked={useWallet}
                                        disabled={!selectedPlayer || walletBalanceCents <= 0}
                                        onChange={(e) => {
                                            setUseWallet(e.target.checked);
                                            if (e.target.checked && walletBalanceCents >= cartTotalCents) {
                                                setPaymentMethod('wallet');
                                            } else if (!e.target.checked) {
                                                setPaymentMethod('cash');
                                            }
                                        }}
                                        className="h-4 w-4 accent-[#E31E24] disabled:opacity-40"
                                    />
                                </div>
                            </label>
                            {selectedPlayer && walletBalanceCents <= 0 ? (
                                <p className="text-[10px] font-semibold text-white/35">Sin saldo bono disponible</p>
                            ) : !selectedPlayer ? (
                                <p className="text-[10px] font-semibold text-white/35">
                                    Selecciona un jugador para ver y usar su saldo bono.
                                </p>
                            ) : null}
                            <div className={`grid gap-2 ${needsSecondaryPayment || !useWallet ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                {(['cash', 'card'] as const).map((method) => {
                                    if (useWallet && !needsSecondaryPayment) return null;
                                    return (
                                        <button
                                            key={method}
                                            type="button"
                                            onClick={() => setPaymentMethod(method)}
                                            className={`${paymentMethod === method ? 'bg-[#E31E24] text-white' : 'bg-white/10 text-white/60'} rounded-xl px-3 py-2 text-xs font-black transition hover:bg-white/15`}
                                        >
                                            {method === 'cash' ? 'Efectivo' : 'Tarjeta'}
                                            {needsSecondaryPayment ? ` (${formatMoneyFromCents(remainderCents, currency)})` : ''}
                                        </button>
                                    );
                                })}
                                {useWallet && walletAppliedCents >= cartTotalCents && cartTotalCents > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethod('wallet')}
                                        className={`${paymentMethod === 'wallet' ? 'bg-[#E31E24] text-white' : 'bg-white/10 text-white/60'} col-span-2 rounded-xl px-3 py-2 text-xs font-black transition hover:bg-white/15`}
                                    >
                                        Pago total con saldo bono
                                    </button>
                                ) : null}
                            </div>
                            {useWallet && walletAppliedCents > 0 ? (
                                <p className="text-[10px] font-semibold text-emerald-200/90">
                                    Bono: {formatMoneyFromCents(walletAppliedCents, currency)}
                                    {remainderCents > 0 ? ` · Resto: ${formatMoneyFromCents(remainderCents, currency)}` : ''}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="min-h-[260px] space-y-2 p-4">
                    {cartLines.length === 0 && cartBookingLines.length === 0 ? (
                        <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 text-center">
                            <Package className="h-8 w-8 text-white/30" />
                            <p className="mt-3 text-xs font-semibold text-white/50">
                                Añade productos o turnos para iniciar la venta.
                            </p>
                        </div>
                    ) : (
                        <>
                        {cartBookingLines.map((line) => (
                            <div key={line.bookingId} className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.08] p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="h-3 w-3 text-emerald-300" />
                                            <p className="truncate text-xs font-black text-emerald-100">{line.label}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs font-black">{formatMoneyFromCents(line.amountCents, line.currency)}</p>
                                </div>
                                {editMode ? (
                                    <button
                                        type="button"
                                        onClick={() => removeBookingLine(line.bookingId)}
                                        className="mt-2 text-[10px] font-bold text-red-200 hover:text-red-100"
                                    >
                                        Quitar turno
                                    </button>
                                ) : null}
                            </div>
                        ))}
                        {cartLines.map((line) => {
                            const item = line.itemId ? itemById.get(line.itemId) : null;
                            const name = item?.name ?? line.customName ?? 'Venta excepcional';
                            const unitPriceCents = line.unitPriceCents ?? item?.unit_price_cents ?? 0;
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
                                        <div className="mt-3 space-y-2">
                                            <div className="flex items-center justify-between gap-2">
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
                                            {editingSaleId || !item ? (
                                                <label className="flex items-center justify-between gap-2 text-[10px] font-semibold text-white/50">
                                                    <span>Precio unit.</span>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        defaultValue={(unitPriceCents / 100).toFixed(2)}
                                                        key={`${key}-${unitPriceCents}`}
                                                        onBlur={(e) => {
                                                            const parsed = Math.round(Number(e.target.value.replace(',', '.')) * 100);
                                                            if (Number.isFinite(parsed) && parsed > 0) {
                                                                updateLineUnitPrice(key, parsed);
                                                            }
                                                        }}
                                                        className="w-20 rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-right text-xs font-black text-white"
                                                    />
                                                </label>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                        </>
                    )}
                </div>

                <div className="border-t border-white/10 p-4">
                    {(bookingsTotalCents > 0 || productsTotalCents > 0) && cartTotalCents > 0 ? (
                        <div className="mb-2 space-y-1 text-[10px] font-semibold text-white/45">
                            {bookingsTotalCents > 0 ? (
                                <div className="flex justify-between">
                                    <span>Turnos</span>
                                    <span>{formatMoneyFromCents(bookingsTotalCents, currency)}</span>
                                </div>
                            ) : null}
                            {productsTotalCents > 0 ? (
                                <div className="flex justify-between">
                                    <span>Productos</span>
                                    <span>{formatMoneyFromCents(productsTotalCents, currency)}</span>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
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
                        {submitting
                            ? editingSaleId
                                ? 'Guardando...'
                                : 'Cargando ticket...'
                            : editingSaleId
                                ? 'Guardar cambios'
                                : 'Cargar ticket'}
                    </button>
                </div>
            </aside>
        </div>

        {showAddBookingsModal ? (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-bookings-modal-title"
            >
                <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">Carrito</p>
                            <h3 id="add-bookings-modal-title" className="text-lg font-black text-[#1A1A1A]">
                                Añadir reservas
                            </h3>
                            {selectedPlayer ? (
                                <p className="mt-1 text-xs font-semibold text-gray-500">
                                    {selectedPlayer.first_name} {selectedPlayer.last_name} · turnos de hoy
                                </p>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setShowAddBookingsModal(false);
                                setModalBookingSelection([]);
                            }}
                            className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                            aria-label="Cerrar"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="space-y-4 overflow-y-auto px-5 py-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Cobrar</p>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setBookingChargeScope('full')}
                                    className={`${bookingChargeScope === 'full' ? 'bg-[#0B5B7A] text-white' : 'bg-gray-100 text-gray-600'} rounded-xl px-3 py-2 text-xs font-black`}
                                >
                                    Turno completo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBookingChargeScope('player_share')}
                                    className={`${bookingChargeScope === 'player_share' ? 'bg-[#0B5B7A] text-white' : 'bg-gray-100 text-gray-600'} rounded-xl px-3 py-2 text-xs font-black`}
                                >
                                    Su parte
                                </button>
                            </div>
                        </div>

                        {bookingOptions.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm font-semibold text-gray-500">
                                No hay turnos activos hoy para este jugador.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {bookingOptions.map((booking) => {
                                    const preview = computeChargeCents(booking, bookingChargeScope);
                                    const inCart = cartBookingLines.some((line) => line.bookingId === booking.id);
                                    const selectable = !inCart && preview > 0;
                                    const selected = modalBookingSelection.includes(booking.id);
                                    return (
                                        <li key={booking.id}>
                                            <button
                                                type="button"
                                                disabled={!selectable}
                                                onClick={() => {
                                                    if (selectable) toggleModalBookingSelection(booking.id);
                                                }}
                                                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                                                    selected
                                                        ? 'border-[#0B5B7A] bg-[#0B5B7A]/5'
                                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                                } disabled:cursor-not-allowed disabled:opacity-45`}
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-black text-[#1A1A1A]">
                                                        {bookingTimeLabel(booking)}
                                                    </p>
                                                    <p className="mt-0.5 text-[10px] font-semibold text-gray-400">
                                                        {inCart
                                                            ? 'Ya en el ticket'
                                                            : preview <= 0
                                                                ? 'Ya pagado'
                                                                : selected
                                                                    ? 'Seleccionado'
                                                                    : 'Toca para seleccionar'}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 text-xs font-black text-[#0B5B7A]">
                                                    {preview > 0
                                                        ? formatMoneyFromCents(preview, booking.currency)
                                                        : '—'}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
                        <button
                            type="button"
                            onClick={() => {
                                setShowAddBookingsModal(false);
                                setModalBookingSelection([]);
                            }}
                            className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-600 hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={confirmAddBookingsFromModal}
                            disabled={modalBookingSelection.length === 0}
                            className="flex-1 rounded-2xl bg-[#0B5B7A] px-4 py-3 text-sm font-black text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Añadir al ticket
                            {modalBookingSelection.length > 0 ? ` (${modalBookingSelection.length})` : ''}
                        </button>
                    </div>
                </div>
            </div>
        ) : null}
        </>
    );
}
