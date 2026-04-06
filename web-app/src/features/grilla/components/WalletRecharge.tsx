import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, Search, UserPlus, Wallet, CreditCard, Banknote, Gift,
    CheckCircle, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { playerService } from '../../../services/player';
import { apiFetchWithAuth } from '../../../services/api';
import type { Player } from '../../../types/api';
import { useVisualViewportFix } from '../hooks/useVisualViewportFix';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Bonus {
    id: string;
    name: string;
    category: string;
    price_to_pay: number;
    balance_to_add: number;
    physical_item: string | null;
    validity_days: number | null;
    is_active: boolean;
}

type PaymentMethod = 'cash' | 'card' | 'prize';

interface WalletRechargeProps {
    clubId: string | null;
    isOpen: boolean;
    onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const WalletRecharge: React.FC<WalletRechargeProps> = ({ clubId, isOpen, onClose }) => {
    const vvStyle = useVisualViewportFix(isOpen);

    // Player search
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Player[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

    // Wallet balance
    const [balanceCents, setBalanceCents] = useState<number | null>(null);
    const [loadingBalance, setLoadingBalance] = useState(false);

    // Bonuses
    const [bonuses, setBonuses] = useState<Bonus[]>([]);
    const [loadingBonuses, setLoadingBonuses] = useState(false);

    // Amount field
    const [amountText, setAmountText] = useState('');

    // Bonus toggle
    const [bonusEnabled, setBonusEnabled] = useState(false);
    const [selectedBonus, setSelectedBonus] = useState<Bonus | null>(null);
    const [bonusListExpanded, setBonusListExpanded] = useState(true);

    // Payment
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
    const [notes, setNotes] = useState('');

    // Submit
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Alta jugador
    const [altaOpen, setAltaOpen] = useState(false);
    const [altaForm, setAltaForm] = useState({ first_name: '', last_name: '', phone: '', email: '' });
    const [altaSubmitting, setAltaSubmitting] = useState(false);
    const [altaError, setAltaError] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);

    // ── Reset on close ──
    useEffect(() => {
        if (!isOpen) {
            setQuery(''); setResults([]); setShowResults(false);
            setSelectedPlayer(null); setBalanceCents(null);
            setSelectedBonus(null); setBonusEnabled(false);
            setAmountText('');
            setPaymentMethod('cash'); setNotes('');
            setSubmitting(false); setSuccess(false); setError(null);
            setAltaOpen(false); setBonusListExpanded(true);
        }
    }, [isOpen]);

    // ── Fetch balance ──
    const fetchBalance = useCallback(async (playerId: string) => {
        if (!clubId) return;
        setLoadingBalance(true);
        try {
            const res = await apiFetchWithAuth<any>(`/wallet/balance?player_id=${playerId}&club_id=${clubId}`);
            setBalanceCents(res.balance_cents ?? 0);
        } catch { setBalanceCents(0); }
        finally { setLoadingBalance(false); }
    }, [clubId]);

    // ── Fetch bonuses ──
    const fetchBonuses = useCallback(async () => {
        if (!clubId) return;
        setLoadingBonuses(true);
        try {
            const res = await apiFetchWithAuth<any>(`/bonuses?club_id=${clubId}`);
            setBonuses((res.data ?? []).filter((b: Bonus) => b.is_active));
        } catch { setBonuses([]); }
        finally { setLoadingBonuses(false); }
    }, [clubId]);

    useEffect(() => { if (isOpen) fetchBonuses(); }, [isOpen, fetchBonuses]);

    // ── Player search (debounced) ──
    const handleSearch = async () => {
        setIsSearching(true);
        try {
            const players = await playerService.getAll(query.trim() || undefined);
            setResults(players);
            setShowResults(true);
        } catch { /* ignore */ }
        finally { setIsSearching(false); }
    };

    useEffect(() => {
        if (query.trim().length < 2) { setResults([]); setShowResults(false); return; }
        const timer = setTimeout(handleSearch, 350);
        return () => clearTimeout(timer);
    }, [query]);

    const handleSelectPlayer = (player: Player) => {
        setSelectedPlayer(player);
        setShowResults(false);
        setQuery('');
        setSuccess(false); setError(null);
        fetchBalance(player.id);
    };

    const handleClearPlayer = () => {
        setSelectedPlayer(null);
        setBalanceCents(null);
        setSelectedBonus(null);
        setBonusEnabled(false);
        setAmountText('');
        setSuccess(false); setError(null);
    };

    // ── Bonus toggle handler ──
    const handleToggleBonus = () => {
        if (bonusEnabled) {
            setBonusEnabled(false);
            setSelectedBonus(null);
        } else {
            setBonusEnabled(true);
            setBonusListExpanded(true);
            // Auto-select if there is only one bonus
            if (bonuses.length === 1) {
                setSelectedBonus(bonuses[0]);
            }
        }
    };

    const handleSelectBonus = (bonus: Bonus) => {
        setSelectedBonus(selectedBonus?.id === bonus.id ? null : bonus);
    };

    // ── Alta jugador ──
    const handleAltaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!altaForm.first_name.trim() || !altaForm.last_name.trim()) { setAltaError('Nombre y apellido son obligatorios'); return; }
        setAltaSubmitting(true); setAltaError('');
        try {
            const payload: any = { first_name: altaForm.first_name.trim(), last_name: altaForm.last_name.trim() };
            if (altaForm.email.trim()) payload.email = altaForm.email.trim();
            if (altaForm.phone.trim()) payload.phone = altaForm.phone.trim();
            const newPlayer = await playerService.createManual(payload);
            handleSelectPlayer(newPlayer);
            setAltaOpen(false);
            setAltaForm({ first_name: '', last_name: '', phone: '', email: '' });
        } catch (err: any) { setAltaError(err?.message || 'Error al registrar'); }
        finally { setAltaSubmitting(false); }
    };

    // ── Computed values ──
    const amountCents = Math.round(parseFloat(amountText || '0') * 100);
    const bonusExtraCents = selectedBonus ? selectedBonus.balance_to_add : 0;
    const totalToWallet = amountCents + bonusExtraCents;

    // Premio → importe en caja forzado a 0
    const priceToPay = paymentMethod === 'prize' ? 0 : amountCents;

    const isValid = selectedPlayer && amountCents > 0;

    // ── Submit ──
    const handleSubmit = async () => {
        if (!selectedPlayer || !clubId || !isValid) return;
        setSubmitting(true); setError(null); setSuccess(false);

        const methodLabel = paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'card' ? 'Tarjeta' : 'Premio';
        const bonusPart = selectedBonus ? ` + Bono "${selectedBonus.name}" (+${fmt(bonusExtraCents)}€)` : '';

        try {
            await apiFetchWithAuth<any>('/wallet/transactions', {
                method: 'POST',
                body: JSON.stringify({
                    player_id: selectedPlayer.id,
                    club_id: clubId,
                    amount_cents: totalToWallet,
                    concept: `Recarga ${fmt(amountCents)}€${bonusPart} — ${methodLabel}`,
                    type: 'credit',
                    notes: notes.trim() || null,
                }),
            });
            await fetchBalance(selectedPlayer.id);
            setSuccess(true);
            setSelectedBonus(null);
            setBonusEnabled(false);
            setAmountText('');
            setNotes('');
        } catch (err: any) {
            setError(err?.message || 'Error al procesar recarga');
        } finally {
            setSubmitting(false);
        }
    };

    // Close results on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (showResults && containerRef.current && !containerRef.current.contains(e.target as Node)) setShowResults(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showResults]);

    if (!isOpen) return null;

    const fmt = (cents: number) => (cents / 100).toFixed(2);

    return (
        <div style={vvStyle} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4">
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative flex flex-col w-full h-[100dvh] bg-gray-50 rounded-t-3xl shadow-2xl sm:h-[90dvh] sm:max-h-[90dvh] sm:w-[520px] sm:rounded-2xl animate-slide-up sm:animate-fade-scale-in overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-[#00726b] to-[#005a4f] text-white rounded-t-3xl sm:rounded-t-2xl flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                            <Wallet size={17} className="text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-sm">Recarga de Wallet</h2>
                            <p className="text-[10px] text-white/70">Cargar saldo al monedero del cliente</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

                    {/* ── Step 1: Player search ── */}
                    <div ref={containerRef}>
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">1. Seleccionar cliente</label>
                        {selectedPlayer ? (
                            <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px] font-bold">
                                        {selectedPlayer.first_name[0]}{selectedPlayer.last_name[0]}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-900">{selectedPlayer.first_name} {selectedPlayer.last_name}</p>
                                        <p className="text-[10px] text-gray-500">{selectedPlayer.email || selectedPlayer.phone || ''}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {loadingBalance ? (
                                        <span className="text-[10px] text-gray-400 animate-pulse">...</span>
                                    ) : (
                                        <div className="text-right">
                                            <p className="text-[9px] text-gray-400 uppercase">Saldo</p>
                                            <p className={`text-sm font-bold ${(balanceCents ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {fmt(balanceCents ?? 0)} €
                                            </p>
                                        </div>
                                    )}
                                    <button onClick={handleClearPlayer} className="p-1 hover:bg-emerald-100 rounded-full text-emerald-600">
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="flex gap-1.5">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            value={query}
                                            onChange={e => setQuery(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                            placeholder="Buscar por nombre, email o teléfono..."
                                            className="w-full p-2.5 pr-9 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-[#00726b] focus:border-transparent outline-none"
                                            onFocus={() => query.trim() && setShowResults(true)}
                                        />
                                        <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={handleSearch}>
                                            <Search size={16} className="text-[#00726b]" />
                                        </button>
                                    </div>
                                    <button
                                        title="Registrar jugador nuevo"
                                        onClick={() => { setAltaOpen(true); setAltaError(''); }}
                                        className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#00726b] hover:bg-[#005a4f] text-white transition-colors shrink-0"
                                    >
                                        <UserPlus size={14} />
                                    </button>
                                </div>
                                {showResults && results.length > 0 && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                        {results.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => handleSelectPlayer(p)}
                                                className="w-full flex items-center gap-2.5 p-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left"
                                            >
                                                <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                                                    {p.first_name[0]}{p.last_name[0]}
                                                </div>
                                                <div className="truncate">
                                                    <p className="text-xs font-bold text-gray-900 truncate">{p.first_name} {p.last_name}</p>
                                                    <p className="text-[10px] text-gray-500 truncate">{p.email || p.phone || ''}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {showResults && results.length === 0 && query.trim() && !isSearching && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-center">
                                        <p className="text-xs text-gray-500">No se encontraron jugadores</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {selectedPlayer && (
                        <>
                            {/* ── Step 2: Amount field ── */}
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">2. Saldo a cargar</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">€</span>
                                    <input
                                        type="number" min="0" step="0.01"
                                        value={amountText}
                                        onChange={e => setAmountText(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-xl text-base font-bold focus:ring-2 focus:ring-[#00726b] focus:border-transparent outline-none"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">Importe que paga el cliente en caja</p>
                            </div>

                            {/* ── Step 3: Bonus toggle (optional) ── */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">3. Aplicar bono (opcional)</label>
                                    <button
                                        onClick={handleToggleBonus}
                                        className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${
                                            bonusEnabled ? 'bg-[#005bc5]' : 'bg-gray-300'
                                        }`}
                                        style={{ width: 40, height: 22 }}
                                    >
                                        <span
                                            className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform duration-200 ${
                                                bonusEnabled ? 'translate-x-[18px]' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>

                                {bonusEnabled && (
                                    <div className="space-y-2">
                                        {/* Selected bonus chip */}
                                        {selectedBonus && (
                                            <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Gift size={14} className="text-[#005bc5] shrink-0" />
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-gray-800 truncate">{selectedBonus.name}</p>
                                                        <p className="text-[10px] text-emerald-600 font-medium">
                                                            +{fmt(selectedBonus.balance_to_add)}€ extra en wallet
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleSelectBonus(selectedBonus)}
                                                    className="p-1 hover:bg-blue-100 rounded-full text-blue-500 shrink-0"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        )}

                                        {/* Bonus list */}
                                        <button
                                            onClick={() => setBonusListExpanded(!bonusListExpanded)}
                                            className="flex items-center justify-between w-full text-xs font-semibold text-gray-600"
                                        >
                                            <span>Bonos disponibles ({bonuses.length})</span>
                                            {bonusListExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </button>
                                        {bonusListExpanded && (
                                            loadingBonuses ? (
                                                <div className="flex justify-center py-6">
                                                    <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                                                </div>
                                            ) : bonuses.length === 0 ? (
                                                <div className="text-center py-4 text-gray-400 text-xs">
                                                    No hay bonos activos. Crea uno desde "Gestión de Bonos".
                                                </div>
                                            ) : (
                                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                                    {bonuses.map(b => {
                                                        const isSelected = selectedBonus?.id === b.id;
                                                        return (
                                                            <button
                                                                key={b.id}
                                                                onClick={() => handleSelectBonus(b)}
                                                                className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                                                                    isSelected
                                                                        ? 'border-[#005bc5] bg-blue-50 ring-1 ring-blue-200'
                                                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2.5">
                                                                    {/* Checkbox visual */}
                                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                                                        isSelected
                                                                            ? 'border-[#005bc5] bg-[#005bc5]'
                                                                            : 'border-gray-300 bg-white'
                                                                    }`}>
                                                                        {isSelected && (
                                                                            <CheckCircle size={14} className="text-white" />
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-xs font-bold text-gray-800 truncate">{b.name}</p>
                                                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                                                            Se suman <strong className="text-emerald-600">{fmt(b.balance_to_add)} €</strong> extra al saldo
                                                                        </p>
                                                                    </div>
                                                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full shrink-0">
                                                                        +{fmt(b.balance_to_add)}€
                                                                    </span>
                                                                </div>
                                                                {b.physical_item && (
                                                                    <p className="text-[10px] text-orange-500 mt-1 ml-7.5">+ {b.physical_item}</p>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Step 4: Payment method ── */}
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">4. Método de pago</label>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { key: 'cash' as const, icon: Banknote, label: 'Efectivo', color: 'emerald' },
                                    { key: 'card' as const, icon: CreditCard, label: 'Tarjeta', color: 'blue' },
                                    { key: 'prize' as const, icon: Gift, label: 'Premio', color: 'amber' },
                                ]).map(({ key, icon: Icon, label, color }) => (
                                    <button
                                        key={key}
                                        onClick={() => setPaymentMethod(key)}
                                        className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-[11px] font-bold transition-all ${
                                            paymentMethod === key
                                                ? `border-${color}-500 bg-${color}-50 text-${color}-700`
                                                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                        }`}
                                        style={paymentMethod === key ? {
                                            borderColor: color === 'emerald' ? '#10b981' : color === 'blue' ? '#3b82f6' : '#f59e0b',
                                            backgroundColor: color === 'emerald' ? '#ecfdf5' : color === 'blue' ? '#eff6ff' : '#fffbeb',
                                            color: color === 'emerald' ? '#047857' : color === 'blue' ? '#1d4ed8' : '#b45309',
                                        } : {}}
                                    >
                                        <Icon size={16} />
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {paymentMethod === 'prize' && (
                                <p className="text-[10px] text-amber-600 font-medium -mt-1">
                                    El importe a pagar en caja se fuerza a 0 € (coste cero).
                                </p>
                            )}

                            {/* ── Notes ── */}
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Notas (opcional)</label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Ej: Promoción verano 2026"
                                    rows={2}
                                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-[#00726b] focus:border-transparent outline-none resize-none"
                                />
                            </div>
                        </>
                    )}

                    {/* ── Confirmation summary ── */}
                    {selectedPlayer && amountCents > 0 && (
                        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Resumen de operación</p>

                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Saldo a cargar</span>
                                <span className="text-sm font-bold text-gray-800">{fmt(amountCents)} €</span>
                            </div>
                            {selectedBonus && (
                                <>
                                    <div className="border-t border-dashed border-gray-200" />
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-600">Bono: {selectedBonus.name}</span>
                                        <span className="text-sm font-bold text-emerald-600">+{fmt(bonusExtraCents)} €</span>
                                    </div>
                                </>
                            )}
                            <div className="border-t border-dashed border-gray-200" />
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700">Total acreditado en Wallet</span>
                                <span className="text-sm font-bold text-emerald-600">{fmt(totalToWallet)} €</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Importe en caja</span>
                                <span className={`text-sm font-bold ${priceToPay === 0 ? 'text-amber-700' : 'text-gray-800'}`}>
                                    {fmt(priceToPay)} €
                                </span>
                            </div>
                            {selectedBonus?.physical_item && (
                                <>
                                    <div className="border-t border-dashed border-gray-200" />
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-600">Artículo físico</span>
                                        <span className="text-xs font-medium text-orange-600">{selectedBonus.physical_item}</span>
                                    </div>
                                </>
                            )}

                            <div className="bg-gray-50 rounded-lg p-2 mt-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500">Nuevo saldo estimado</span>
                                    <span className="font-bold text-emerald-700">
                                        {fmt((balanceCents ?? 0) + totalToWallet)} €
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Messages ── */}
                    {success && (
                        <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-medium">
                            <CheckCircle size={14} /> Recarga procesada exitosamente
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-medium">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                </div>

                {/* ── Footer: submit button ── */}
                {selectedPlayer && (
                    <div className="flex-shrink-0 px-4 py-3 border-t bg-white">
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !isValid}
                            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00726b] to-[#005a4f] hover:from-[#005a4f] hover:to-[#004840] text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md active:scale-[0.98]"
                        >
                            {submitting
                                ? 'Procesando...'
                                : `Confirmar Recarga — ${fmt(totalToWallet)} € en Wallet`
                            }
                        </button>
                    </div>
                )}
            </div>

            {/* ── Alta jugador sub-modal ── */}
            {altaOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAltaOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-gray-900">Registrar nuevo jugador</h3>
                            <button onClick={() => setAltaOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleAltaSubmit} className="flex flex-col gap-3">
                            {(['first_name', 'last_name', 'phone', 'email'] as const).map(field => (
                                <input
                                    key={field}
                                    type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                                    placeholder={{ first_name: 'Nombre *', last_name: 'Apellido *', phone: 'Teléfono', email: 'Email' }[field]}
                                    value={altaForm[field]}
                                    onChange={e => setAltaForm(prev => ({ ...prev, [field]: e.target.value }))}
                                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#00726b] focus:border-transparent outline-none"
                                />
                            ))}
                            {altaError && <p className="text-xs text-red-500">{altaError}</p>}
                            <button
                                type="submit"
                                disabled={altaSubmitting}
                                className="mt-1 w-full py-2.5 rounded-lg bg-[#00726b] hover:bg-[#005a4f] text-white text-sm font-bold transition-colors disabled:opacity-60"
                            >
                                {altaSubmitting ? 'Registrando...' : 'Registrar jugador'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
