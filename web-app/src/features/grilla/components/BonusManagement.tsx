import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Gift, Tag, Package, Calendar, ToggleLeft, ToggleRight, Pencil, ChevronDown, UserRound, Search } from 'lucide-react';
import { apiFetchWithAuth } from '../../../services/api';
import { clubClientService } from '../../../services/clubClients';
import type { Player } from '../../../types/api';
import { toast } from 'sonner';
import { useVisualViewportFix } from '../hooks/useVisualViewportFix';

interface Bonus {
    id: string;
    club_id: string;
    name: string;
    description: string | null;
    category: string;
    price_to_pay: number;       // céntimos
    balance_to_add: number;     // céntimos
    physical_item: string | null;
    validity_days: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface BonusManagementProps {
    clubId: string | null;
    isOpen: boolean;
    onClose: () => void;
}

const CATEGORIES = [
    { value: 'monedero', label: 'Monedero', icon: '💰' },
    { value: 'clases', label: 'Clases', icon: '🎓' },
    { value: 'especial', label: 'Especial', icon: '⭐' },
];

const emptyForm = {
    name: '',
    description: '',
    category: 'monedero',
    price_to_pay: '',
    balance_to_add: '',
    physical_item: '',
    validity_days: '',
};

type FormState = typeof emptyForm;

export const BonusManagement: React.FC<BonusManagementProps> = ({ clubId, isOpen, onClose }) => {
    const vvStyle = useVisualViewportFix(isOpen);
    const [bonuses, setBonuses] = useState<Bonus[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [giftFor, setGiftFor] = useState<Bonus | null>(null);
    const [giftRecipient, setGiftRecipient] = useState<Player | null>(null);
    const [giftSearchQuery, setGiftSearchQuery] = useState('');
    const [giftSearchResults, setGiftSearchResults] = useState<Player[]>([]);
    const [giftSearchOpen, setGiftSearchOpen] = useState(false);
    const [giftSearchBusy, setGiftSearchBusy] = useState(false);
    const giftSearchRef = useRef<HTMLDivElement>(null);
    const [giftClassSessions, setGiftClassSessions] = useState('1');
    const [giftBusy, setGiftBusy] = useState(false);
    const [giftError, setGiftError] = useState<string | null>(null);

    const fetchBonuses = useCallback(async () => {
        if (!clubId) return;
        setLoading(true);
        try {
            const res = await apiFetchWithAuth<any>(`/bonuses?club_id=${clubId}`);
            if (res.ok) setBonuses(res.data ?? []);
        } catch (err) {
            console.error('Error fetching bonuses:', err);
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        if (isOpen) fetchBonuses();
    }, [isOpen, fetchBonuses]);

    useEffect(() => {
        if (!giftFor || !clubId) return;
        const q = giftSearchQuery.trim();
        if (q.length < 2) {
            setGiftSearchResults([]);
            setGiftSearchOpen(false);
            return;
        }
        let cancelled = false;
        const t = window.setTimeout(async () => {
            setGiftSearchBusy(true);
            try {
                const list = await clubClientService.list(clubId, { q });
                if (cancelled) return;
                setGiftSearchResults(list);
                setGiftSearchOpen(true);
            } catch {
                if (!cancelled) setGiftSearchResults([]);
            } finally {
                if (!cancelled) setGiftSearchBusy(false);
            }
        }, 320);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [giftSearchQuery, giftFor, clubId]);

    useEffect(() => {
        if (!giftFor) return;
        const onDoc = (e: MouseEvent) => {
            if (giftSearchRef.current && !giftSearchRef.current.contains(e.target as Node)) {
                setGiftSearchOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [giftFor]);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setError(null);
        setShowForm(true);
    };

    const openEdit = (b: Bonus) => {
        setEditingId(b.id);
        setForm({
            name: b.name,
            description: b.description || '',
            category: b.category,
            price_to_pay: (b.price_to_pay / 100).toString(),
            balance_to_add: (b.balance_to_add / 100).toString(),
            physical_item: b.physical_item || '',
            validity_days: b.validity_days?.toString() || '',
        });
        setError(null);
        setShowForm(true);
    };

    const handleToggle = async (bonus: Bonus) => {
        try {
            const res = await apiFetchWithAuth<any>(`/bonuses/${bonus.id}/toggle`, { method: 'PATCH' });
            if (res.ok && res.data) {
                setBonuses(prev => prev.map(b => b.id === bonus.id ? res.data : b));
            }
        } catch (err) {
            console.error('Error toggling bonus:', err);
        }
    };

    const validate = (): string | null => {
        if (!form.name.trim()) return 'El nombre es obligatorio';
        const price = parseFloat(form.price_to_pay);
        const balance = parseFloat(form.balance_to_add);
        if (isNaN(price) || price < 0) return 'El precio debe ser un número válido ≥ 0';
        if (isNaN(balance) || balance < 0) return 'El saldo debe ser un número válido ≥ 0';
        if (balance < price) return 'El saldo a añadir debe ser ≥ al precio a pagar';
        if (form.validity_days && (isNaN(Number(form.validity_days)) || Number(form.validity_days) < 1)) {
            return 'Los días de vigencia deben ser un número ≥ 1';
        }
        return null;
    };

    const handleSave = async () => {
        const validationError = validate();
        if (validationError) { setError(validationError); return; }

        setSaving(true);
        setError(null);

        const payload = {
            club_id: clubId,
            name: form.name.trim(),
            description: form.description.trim() || null,
            category: form.category,
            price_to_pay: Math.round(parseFloat(form.price_to_pay) * 100),
            balance_to_add: Math.round(parseFloat(form.balance_to_add) * 100),
            physical_item: form.physical_item.trim() || null,
            validity_days: form.validity_days ? parseInt(form.validity_days) : null,
        };

        try {
            if (editingId) {
                const res = await apiFetchWithAuth<any>(`/bonuses/${editingId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
                if (res.ok && res.data) {
                    setBonuses(prev => prev.map(b => b.id === editingId ? res.data : b));
                } else {
                    throw new Error(res.error || 'Error al actualizar');
                }
            } else {
                const res = await apiFetchWithAuth<any>('/bonuses', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                if (res.ok && res.data) {
                    setBonuses(prev => [res.data, ...prev]);
                } else {
                    throw new Error(res.error || 'Error al crear');
                }
            }
            setShowForm(false);
            setEditingId(null);
            setForm(emptyForm);
        } catch (err: any) {
            setError(err.message || 'Error inesperado');
        } finally {
            setSaving(false);
        }
    };

    const filteredBonuses = filterCategory === 'all'
        ? bonuses
        : bonuses.filter(b => b.category === filterCategory);

    const categoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label ?? cat;
    const categoryIcon = (cat: string) => CATEGORIES.find(c => c.value === cat)?.icon ?? '🎁';

    const formatCents = (cents: number) => (cents / 100).toFixed(2);

    const openGift = (b: Bonus) => {
        setGiftFor(b);
        setGiftRecipient(null);
        setGiftSearchQuery('');
        setGiftSearchResults([]);
        setGiftSearchOpen(false);
        setGiftClassSessions('1');
        setGiftError(null);
    };

    const submitGift = async () => {
        if (!giftFor) return;
        const pid = giftRecipient?.id?.trim();
        if (!pid) {
            setGiftError('Busca por nombre o teléfono y selecciona un cliente del club.');
            return;
        }
        setGiftBusy(true);
        setGiftError(null);
        try {
            const body: Record<string, unknown> = { player_id: pid };
            if (giftFor.category === 'clases') {
                const n = Math.max(1, Math.trunc(Number(giftClassSessions) || 1));
                body.class_sessions = n;
            }
            await apiFetchWithAuth(`/bonuses/${giftFor.id}/gift-to-player`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            toast.success('Regalo aplicado al jugador');
            setGiftFor(null);
        } catch (e: unknown) {
            setGiftError(e instanceof Error ? e.message : 'No se pudo aplicar el regalo');
        } finally {
            setGiftBusy(false);
        }
    };

    const bonusPercent = (b: Bonus) => {
        if (b.price_to_pay === 0) return '∞';
        return Math.round(((b.balance_to_add - b.price_to_pay) / b.price_to_pay) * 100);
    };

    if (!isOpen) return null;

    return (
        <div style={vvStyle} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 transition-opacity duration-300">
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative flex flex-col w-full h-[100dvh] bg-gray-50 rounded-t-3xl shadow-2xl sm:h-[90dvh] sm:max-h-[90dvh] sm:w-[780px] sm:rounded-2xl animate-slide-up sm:animate-fade-scale-in overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-[#005bc5] to-[#0073e6] text-white rounded-t-3xl sm:rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <Gift className="w-6 h-6" />
                        <div>
                            <h2 className="text-lg font-bold leading-tight">Gestión de Bonos</h2>
                            <p className="text-xs text-blue-100">{bonuses.length} bono{bonuses.length !== 1 ? 's' : ''} configurado{bonuses.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between gap-2 px-5 py-3 border-b bg-white">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <select
                                value={filterCategory}
                                onChange={e => setFilterCategory(e.target.value)}
                                className="appearance-none text-xs font-medium bg-gray-100 border border-gray-200 rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                            >
                                <option value="all">Todas las categorías</option>
                                {CATEGORIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#005bc5] text-white text-xs font-bold rounded-lg hover:bg-[#004fa8] transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Nuevo Bono
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                        </div>
                    ) : filteredBonuses.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <Gift className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p className="font-medium">No hay bonos {filterCategory !== 'all' ? `en "${categoryLabel(filterCategory)}"` : 'configurados'}</p>
                            <p className="text-xs mt-1">Crea tu primer bono pulsando "Nuevo Bono"</p>
                        </div>
                    ) : (
                        filteredBonuses.map(bonus => (
                            <div
                                key={bonus.id}
                                className={`group relative bg-white rounded-xl border transition-all hover:shadow-md ${bonus.is_active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-60'}`}
                            >
                                <div className="flex items-stretch">
                                    {/* Category stripe */}
                                    <div className={`w-1.5 rounded-l-xl flex-shrink-0 ${
                                        bonus.category === 'monedero' ? 'bg-emerald-500' :
                                        bonus.category === 'clases' ? 'bg-purple-500' :
                                        'bg-amber-500'
                                    }`} />

                                    <div className="flex-1 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm">{categoryIcon(bonus.category)}</span>
                                                    <h3 className="font-bold text-sm text-gray-800 truncate">{bonus.name}</h3>
                                                    {!bonus.is_active && (
                                                        <span className="px-1.5 py-0.5 bg-red-50 text-red-500 text-[10px] font-bold rounded">INACTIVO</span>
                                                    )}
                                                </div>
                                                {bonus.description && (
                                                    <p className="text-xs text-gray-500 line-clamp-1 mb-2">{bonus.description}</p>
                                                )}

                                                {/* Stats row */}
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                                    <div className="flex items-center gap-1">
                                                        <Tag className="w-3 h-3 text-gray-400" />
                                                        <span className="text-xs text-gray-600">
                                                            Paga: <strong className="text-gray-800">{formatCents(bonus.price_to_pay)} €</strong>
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Gift className="w-3 h-3 text-emerald-500" />
                                                        <span className="text-xs text-gray-600">
                                                            Recibe: <strong className="text-emerald-700">{formatCents(bonus.balance_to_add)} €</strong>
                                                        </span>
                                                    </div>
                                                    <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded">
                                                        +{bonusPercent(bonus)}%
                                                    </span>
                                                    {bonus.physical_item && (
                                                        <div className="flex items-center gap-1">
                                                            <Package className="w-3 h-3 text-orange-400" />
                                                            <span className="text-[10px] text-gray-500">{bonus.physical_item}</span>
                                                        </div>
                                                    )}
                                                    {bonus.validity_days && (
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="w-3 h-3 text-blue-400" />
                                                            <span className="text-[10px] text-gray-500">{bonus.validity_days} días</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => openGift(bonus)}
                                                    className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                                    title="Regalar a jugador"
                                                >
                                                    <UserRound className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => openEdit(bonus)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Editar"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleToggle(bonus)}
                                                    className={`p-1.5 rounded-lg transition-colors ${bonus.is_active
                                                        ? 'text-emerald-500 hover:bg-emerald-50'
                                                        : 'text-gray-400 hover:bg-gray-100'
                                                    }`}
                                                    title={bonus.is_active ? 'Desactivar' : 'Activar'}
                                                >
                                                    {bonus.is_active
                                                        ? <ToggleRight className="w-5 h-5" />
                                                        : <ToggleLeft className="w-5 h-5" />
                                                    }
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Form slide-over */}
                {showForm && (
                    <div className="absolute inset-0 z-10 flex flex-col bg-gray-50 animate-slide-up">
                        {/* Form header */}
                        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-[#005bc5] to-[#0073e6] text-white">
                            <h3 className="font-bold text-base">{editingId ? 'Editar Bono' : 'Nuevo Bono'}</h3>
                            <button
                                onClick={() => { setShowForm(false); setEditingId(null); setError(null); }}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                            {error && (
                                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-medium">
                                    {error}
                                </div>
                            )}

                            {/* Name */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="Ej: Bono Monedero 50€"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Descripción</label>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="Descripción del bono..."
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent resize-none"
                                />
                            </div>

                            {/* Category */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Categoría *</label>
                                <div className="flex gap-2">
                                    {CATEGORIES.map(c => (
                                        <button
                                            key={c.value}
                                            type="button"
                                            onClick={() => setForm(f => ({ ...f, category: c.value }))}
                                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                                                form.category === c.value
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            <span>{c.icon}</span> {c.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Price + Balance row */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Precio a pagar (€) *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.price_to_pay}
                                        onChange={e => setForm(f => ({ ...f, price_to_pay: e.target.value }))}
                                        placeholder="50.00"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Saldo a añadir (€) *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.balance_to_add}
                                        onChange={e => setForm(f => ({ ...f, balance_to_add: e.target.value }))}
                                        placeholder="60.00"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                                    />
                                    {form.price_to_pay && form.balance_to_add && parseFloat(form.balance_to_add) >= parseFloat(form.price_to_pay) && parseFloat(form.price_to_pay) > 0 && (
                                        <p className="text-[10px] text-emerald-600 mt-1 font-medium">
                                            +{Math.round(((parseFloat(form.balance_to_add) - parseFloat(form.price_to_pay)) / parseFloat(form.price_to_pay)) * 100)}% de bonificación
                                        </p>
                                    )}
                                    {form.price_to_pay && form.balance_to_add && parseFloat(form.balance_to_add) < parseFloat(form.price_to_pay) && (
                                        <p className="text-[10px] text-red-500 mt-1 font-medium">
                                            El saldo debe ser ≥ al precio
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Physical item */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Artículo físico incluido</label>
                                <input
                                    type="text"
                                    value={form.physical_item}
                                    onChange={e => setForm(f => ({ ...f, physical_item: e.target.value }))}
                                    placeholder="Ej: Bote de pelotas, camiseta..."
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                                />
                            </div>

                            {/* Validity */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Vigencia (días)</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={form.validity_days}
                                    onChange={e => setForm(f => ({ ...f, validity_days: e.target.value }))}
                                    placeholder="Sin caducidad"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                                />
                            </div>
                        </div>

                        {/* Form footer */}
                        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-white">
                            <button
                                onClick={() => { setShowForm(false); setEditingId(null); setError(null); }}
                                className="px-4 py-2 text-xs font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-5 py-2 text-xs font-bold text-white bg-[#005bc5] rounded-lg hover:bg-[#004fa8] disabled:opacity-50 transition-colors"
                            >
                                {saving ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Crear Bono'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {giftFor && (
                <div className="absolute inset-0 z-[20] flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 shadow-xl p-5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-bold text-gray-800">Regalar bono</h3>
                                <p className="text-[11px] text-gray-500 mt-0.5">{giftFor.name}</p>
                            </div>
                            <button
                                type="button"
                                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                                onClick={() => !giftBusy && setGiftFor(null)}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-600">
                            Se acredita <strong>{formatCents(giftFor.balance_to_add)} €</strong> al monedero del club.
                            {giftFor.category === 'clases' ? ' Además se crea un bono de clases.' : null}
                        </p>
                        <div ref={giftSearchRef} className="relative space-y-1.5">
                            <label className="text-[10px] font-semibold text-gray-500">Cliente del club</label>
                            {!clubId ? (
                                <p className="text-[11px] text-amber-700">No hay club seleccionado; no se puede buscar clientes.</p>
                            ) : giftRecipient ? (
                                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-violet-200 bg-violet-50">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-900 truncate">
                                            {giftRecipient.first_name} {giftRecipient.last_name}
                                        </p>
                                        <p className="text-[10px] text-gray-500 truncate">
                                            {giftRecipient.phone?.trim() || giftRecipient.email || '—'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="shrink-0 p-1 rounded-lg hover:bg-violet-100 text-violet-700"
                                        onClick={() => {
                                            setGiftRecipient(null);
                                            setGiftSearchQuery('');
                                        }}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-200 px-3 py-2 pr-9 text-xs"
                                            value={giftSearchQuery}
                                            onChange={(e) => setGiftSearchQuery(e.target.value)}
                                            onFocus={() => giftSearchQuery.trim().length >= 2 && giftSearchResults.length > 0 && setGiftSearchOpen(true)}
                                            placeholder="Nombre o teléfono (mín. 2 caracteres)…"
                                            autoComplete="off"
                                        />
                                        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                    </div>
                                    {giftSearchBusy && (
                                        <p className="text-[10px] text-gray-400">Buscando…</p>
                                    )}
                                    {giftSearchOpen && giftSearchResults.length > 0 && (
                                        <div className="absolute z-50 left-0 right-0 mt-1 max-h-44 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                                            {giftSearchResults.map((p) => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    className="w-full text-left px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50"
                                                    onClick={() => {
                                                        setGiftRecipient(p);
                                                        setGiftSearchOpen(false);
                                                        setGiftSearchQuery('');
                                                        setGiftError(null);
                                                    }}
                                                >
                                                    <span className="text-xs font-semibold text-gray-900">
                                                        {p.first_name} {p.last_name}
                                                    </span>
                                                    <span className="block text-[10px] text-gray-500 truncate">
                                                        {p.phone?.trim() || p.email || '—'}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {giftSearchOpen && !giftSearchBusy && giftSearchQuery.trim().length >= 2 && giftSearchResults.length === 0 && (
                                        <p className="text-[10px] text-gray-500">No hay coincidencias en clientes del club.</p>
                                    )}
                                </>
                            )}
                        </div>
                        {giftFor.category === 'clases' && (
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Sesiones en pack</label>
                                <input
                                    type="number"
                                    min={1}
                                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
                                    value={giftClassSessions}
                                    onChange={(e) => setGiftClassSessions(e.target.value)}
                                />
                            </div>
                        )}
                        {giftError && <p className="text-[11px] text-red-600 font-medium">{giftError}</p>}
                        <div className="flex gap-2 justify-end pt-1">
                            <button
                                type="button"
                                disabled={giftBusy}
                                className="px-3 py-2 text-xs font-bold rounded-xl border border-gray-200 text-gray-600"
                                onClick={() => setGiftFor(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={giftBusy}
                                className="px-4 py-2 text-xs font-bold rounded-xl bg-violet-600 text-white disabled:opacity-50"
                                onClick={() => void submitGift()}
                            >
                                {giftBusy ? 'Aplicando…' : 'Aplicar regalo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
