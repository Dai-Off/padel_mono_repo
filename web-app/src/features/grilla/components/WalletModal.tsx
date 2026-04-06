import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Search, UserPlus, Wallet, CreditCard, Banknote, CheckCircle, AlertCircle } from 'lucide-react';
import { playerService } from '../../../services/player';
import { apiFetchWithAuth } from '../../../services/api';
import type { Player } from '../../../types/api';

interface WalletModalProps {
    clubId: string | null;
    isOpen: boolean;
    onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ clubId, isOpen, onClose }) => {
    // ── Player search state ──
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Player[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

    // ── Wallet state ──
    const [balanceCents, setBalanceCents] = useState<number | null>(null);
    const [loadingBalance, setLoadingBalance] = useState(false);
    const [amountText, setAmountText] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
    const [notes, setNotes] = useState('');

    // ── Submit state ──
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Manual player registration ──
    const [altaOpen, setAltaOpen] = useState(false);
    const [altaForm, setAltaForm] = useState({ first_name: '', last_name: '', phone: '', email: '' });
    const [altaSubmitting, setAltaSubmitting] = useState(false);
    const [altaError, setAltaError] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Reset on close/open
    useEffect(() => {
        if (!isOpen) {
            setQuery('');
            setResults([]);
            setShowResults(false);
            setSelectedPlayer(null);
            setBalanceCents(null);
            setAmountText('');
            setPaymentMethod('cash');
            setNotes('');
            setSubmitting(false);
            setSuccess(false);
            setError(null);
            setAltaOpen(false);
        }
    }, [isOpen]);

    // Fetch wallet balance when a player is selected
    const fetchBalance = useCallback(async (playerId: string) => {
        if (!clubId) return;
        setLoadingBalance(true);
        try {
            const res = await apiFetchWithAuth<any>(`/wallet/balance?player_id=${playerId}&club_id=${clubId}`);
            setBalanceCents(res.balance_cents ?? 0);
        } catch {
            setBalanceCents(0);
        } finally {
            setLoadingBalance(false);
        }
    }, [clubId]);

    const handleSelectPlayer = (player: Player) => {
        setSelectedPlayer(player);
        setShowResults(false);
        setQuery('');
        setSuccess(false);
        setError(null);
        fetchBalance(player.id);
    };

    const handleClearPlayer = () => {
        setSelectedPlayer(null);
        setBalanceCents(null);
        setAmountText('');
        setNotes('');
        setSuccess(false);
        setError(null);
    };

    const handleSearch = async () => {
        setIsSearching(true);
        try {
            const players = await playerService.getAll(query.trim() || undefined);
            setResults(players);
            setShowResults(true);
        } catch (err) {
            console.error('Error fetching players:', err);
        } finally {
            setIsSearching(false);
        }
    };

    // Debounced search on query change
    useEffect(() => {
        if (query.trim().length < 2) {
            setResults([]);
            setShowResults(false);
            return;
        }
        const timer = setTimeout(() => {
            handleSearch();
        }, 350);
        return () => clearTimeout(timer);
    }, [query]);

    const handleAltaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!altaForm.first_name.trim() || !altaForm.last_name.trim()) {
            setAltaError('Nombre y apellido son obligatorios');
            return;
        }
        setAltaSubmitting(true);
        setAltaError('');
        try {
            const payload: any = {
                first_name: altaForm.first_name.trim(),
                last_name: altaForm.last_name.trim(),
            };
            if (altaForm.email.trim()) payload.email = altaForm.email.trim();
            if (altaForm.phone.trim()) payload.phone = altaForm.phone.trim();
            const newPlayer = await playerService.createManual(payload);
            handleSelectPlayer(newPlayer);
            setAltaOpen(false);
            setAltaForm({ first_name: '', last_name: '', phone: '', email: '' });
        } catch (err: any) {
            setAltaError(err?.message || 'Error al registrar jugador');
        } finally {
            setAltaSubmitting(false);
        }
    };

    const amountCents = Math.round(parseFloat(amountText || '0') * 100);
    const isValidAmount = amountCents > 0;

    const handleSubmit = async () => {
        if (!selectedPlayer || !clubId || !isValidAmount) return;
        setSubmitting(true);
        setError(null);
        setSuccess(false);
        try {
            await apiFetchWithAuth<any>('/wallet/transactions', {
                method: 'POST',
                body: JSON.stringify({
                    player_id: selectedPlayer.id,
                    club_id: clubId,
                    amount_cents: amountCents,
                    concept: `Carga de saldo - ${paymentMethod === 'cash' ? 'Efectivo' : 'Tarjeta'}`,
                    type: 'credit',
                    notes: notes.trim() || null,
                }),
            });
            // Refresh balance
            await fetchBalance(selectedPlayer.id);
            setSuccess(true);
            setAmountText('');
            setNotes('');
        } catch (err: any) {
            setError(err?.message || 'Error al cargar saldo');
        } finally {
            setSubmitting(false);
        }
    };

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (showResults && containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showResults]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-visible"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-[#00726b] to-[#005a4f] px-4 py-2.5 flex items-center justify-between rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                            <Wallet size={15} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-sm">Wallet</h2>
                            <p className="text-white/70 text-[10px]">Cargar saldo a cuenta</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                        <X size={16} className="text-white" />
                    </button>
                </div>

                <div className="p-3.5 flex flex-col gap-3">
                    {/* ── Player Search ── */}
                    <div ref={containerRef}>
                        <label className="text-xs font-bold text-gray-700 mb-1 block">
                            Cliente / Jugador <span className="text-red-500">*</span>
                        </label>
                        {selectedPlayer ? (
                            <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                                        {selectedPlayer.first_name[0]}{selectedPlayer.last_name[0]}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-900">{selectedPlayer.first_name} {selectedPlayer.last_name}</p>
                                        <p className="text-[10px] text-gray-500">{selectedPlayer.email || selectedPlayer.phone || ''}</p>
                                    </div>
                                </div>
                                <button onClick={handleClearPlayer} className="p-1 hover:bg-emerald-100 rounded-full text-emerald-600">
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="flex gap-1.5">
                                    <div className="relative flex-1">
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                            placeholder="Buscar por nombre, email o teléfono..."
                                            className="w-full p-2 pr-9 bg-white border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#00726b] focus:border-transparent outline-none transition-all"
                                            onFocus={() => query.trim() && setShowResults(true)}
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                                            onClick={handleSearch}
                                        >
                                            <Search size={18} className="text-[#00726b] hover:text-[#005151]" />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        title="Registrar jugador nuevo"
                                        onClick={() => { setAltaOpen(true); setAltaError(''); }}
                                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#00726b] hover:bg-[#005a4f] text-white transition-colors shrink-0"
                                    >
                                        <UserPlus size={14} />
                                    </button>
                                </div>
                                {/* Results dropdown */}
                                {showResults && results.length > 0 && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                        {results.map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => handleSelectPlayer(p)}
                                                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left transition-colors"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                                                    {p.first_name[0]}{p.last_name[0]}
                                                </div>
                                                <div className="truncate">
                                                    <p className="text-sm font-bold text-gray-900 truncate">{p.first_name} {p.last_name}</p>
                                                    <p className="text-[11px] text-gray-500 truncate">{p.email}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {showResults && results.length === 0 && query.trim() && !isSearching && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-center">
                                        <p className="text-sm text-gray-500">No se encontraron jugadores</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Current balance ── */}
                    {selectedPlayer && (
                        <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-100">
                            <span className="text-xs text-gray-600 font-medium">Saldo actual</span>
                            {loadingBalance ? (
                                <span className="text-[10px] text-gray-400 animate-pulse">Cargando...</span>
                            ) : (
                                <span className={`text-sm font-bold ${(balanceCents ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {((balanceCents ?? 0) / 100).toFixed(2)} €
                                </span>
                            )}
                        </div>
                    )}

                    {/* ── Amount ── */}
                    {selectedPlayer && (
                        <div>
                            <label className="text-xs font-bold text-gray-700 mb-1 block">
                                Importe a cargar <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">€</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={amountText}
                                    onChange={(e) => setAmountText(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full pl-7 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-[#00726b] focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Payment method ── */}
                    {selectedPlayer && (
                        <div>
                            <label className="text-xs font-bold text-gray-700 mb-1 block">Método de pago</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('cash')}
                                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-xs font-bold transition-all ${
                                        paymentMethod === 'cash'
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                    }`}
                                >
                                    <Banknote size={14} />
                                    Efectivo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('card')}
                                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-xs font-bold transition-all ${
                                        paymentMethod === 'card'
                                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                    }`}
                                >
                                    <CreditCard size={14} />
                                    Tarjeta
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Notes ── */}
                    {selectedPlayer && (
                        <div>
                            <label className="text-xs font-bold text-gray-700 mb-1 block">Notas (opcional)</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Ej: Pago adelantado para próximas reservas"
                                rows={2}
                                className="w-full p-2 bg-white border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#00726b] focus:border-transparent outline-none transition-all resize-none"
                            />
                        </div>
                    )}

                    {/* ── Success message ── */}
                    {success && (
                        <div className="flex items-center gap-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs font-medium animate-in fade-in">
                            <CheckCircle size={14} />
                            Saldo cargado exitosamente
                        </div>
                    )}

                    {/* ── Error message ── */}
                    {error && (
                        <div className="flex items-center gap-1.5 p-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-medium">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}

                    {/* ── Submit button ── */}
                    {selectedPlayer && (
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !isValidAmount}
                            className="w-full py-2 rounded-lg bg-gradient-to-r from-[#00726b] to-[#005a4f] hover:from-[#005a4f] hover:to-[#004840] text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-200/50 active:scale-[0.98]"
                        >
                            {submitting
                                ? 'Procesando...'
                                : `Cargar ${isValidAmount ? (amountCents / 100).toFixed(2) + ' €' : ''} en Wallet`
                            }
                        </button>
                    )}
                </div>

                {/* ── Alta jugador sub-modal ── */}
                {altaOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAltaOpen(false)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-base font-bold text-gray-900">Registrar nuevo jugador</h3>
                                <button onClick={() => setAltaOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleAltaSubmit} className="flex flex-col gap-3">
                                {(['first_name', 'last_name', 'phone', 'email'] as const).map((field) => (
                                    <input
                                        key={field}
                                        type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                                        placeholder={{
                                            first_name: 'Nombre *',
                                            last_name: 'Apellido *',
                                            phone: 'Teléfono',
                                            email: 'Email',
                                        }[field]}
                                        value={altaForm[field]}
                                        onChange={(e) => setAltaForm(prev => ({ ...prev, [field]: e.target.value }))}
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
        </div>
    );
};
