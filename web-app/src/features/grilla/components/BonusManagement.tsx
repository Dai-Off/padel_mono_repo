import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Gift, Tag, Package, Calendar, ToggleLeft, ToggleRight, Pencil, ChevronDown } from 'lucide-react';
import { apiFetchWithAuth } from '../../../services/api';
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
        </div>
    );
};
