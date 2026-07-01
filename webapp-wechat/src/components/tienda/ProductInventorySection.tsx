import { useState } from 'react';
import { Loader2, Minus, Plus } from 'lucide-react';

const inputClass =
    'w-full rounded-xl border border-auth-border-input bg-auth-input px-3.5 py-2.5 text-sm text-auth-text outline-none transition auth-input-focus placeholder:text-auth-secondary';

type ProductInventorySectionProps = {
    mode: 'create' | 'edit';
    stockQuantity: string;
    onStockQuantityChange: (value: string) => void;
    lowStockThreshold: string;
    onLowStockThresholdChange: (value: string) => void;
    currentStock?: number;
    onAdjustStock?: (delta: number, note: string) => Promise<void>;
    disabled?: boolean;
};

function stockStatus(
    quantity: number,
    threshold: number
): { label: string; className: string } {
    if (quantity <= 0) {
        return { label: 'Agotado', className: 'bg-red-500/15 text-red-300' };
    }
    if (quantity <= threshold) {
        return { label: 'Stock bajo', className: 'bg-amber-500/15 text-amber-300' };
    }
    return { label: 'Disponible', className: 'bg-emerald-500/10 text-emerald-300' };
}

export function ProductInventorySection({
    mode,
    stockQuantity,
    onStockQuantityChange,
    lowStockThreshold,
    onLowStockThresholdChange,
    currentStock = 0,
    onAdjustStock,
    disabled,
}: ProductInventorySectionProps) {
    const [delta, setDelta] = useState('');
    const [note, setNote] = useState('');
    const [adjusting, setAdjusting] = useState(false);
    const [adjustError, setAdjustError] = useState<string | null>(null);

    const thresholdNum = Number(lowStockThreshold) || 0;
    const status = stockStatus(currentStock, thresholdNum);

    const applyDelta = async (value: number) => {
        if (!onAdjustStock || value === 0) return;
        if (currentStock + value < 0) {
            setAdjustError(`No podés restar más de ${currentStock} unidades`);
            return;
        }
        setAdjusting(true);
        setAdjustError(null);
        try {
            await onAdjustStock(value, note.trim());
            setDelta('');
            setNote('');
        } catch (err) {
            setAdjustError(err instanceof Error ? err.message : 'No se pudo ajustar el stock');
        } finally {
            setAdjusting(false);
        }
    };

    const handleApply = () => {
        const value = Number(delta);
        if (!Number.isInteger(value) || value === 0) {
            setAdjustError('Ingresá un número entero distinto de 0');
            return;
        }
        void applyDelta(value);
    };

    if (mode === 'create') {
        return (
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-auth-secondary">
                        Stock inicial
                    </span>
                    <input
                        value={stockQuantity}
                        onChange={(e) => onStockQuantityChange(e.target.value)}
                        inputMode="numeric"
                        placeholder="0"
                        disabled={disabled}
                        className={inputClass}
                    />
                </label>
                <label className="block">
                    <span className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-auth-secondary">
                            Alerta stock bajo
                        </span>
                        <span className="text-xs text-auth-muted">unidades</span>
                    </span>
                    <input
                        value={lowStockThreshold}
                        onChange={(e) => onLowStockThresholdChange(e.target.value)}
                        inputMode="numeric"
                        disabled={disabled}
                        className={inputClass}
                    />
                </label>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-auth-border bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-auth-border/60 pb-4">
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums text-auth-text">{currentStock}</span>
                    <span className="text-sm text-auth-muted">unidades</span>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                    {status.label}
                </span>
            </div>

            <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-auth-secondary">
                    Ajustar inventario
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    {[-10, -1, 1, 10].map((step) => (
                        <button
                            key={step}
                            type="button"
                            disabled={disabled || adjusting || (step < 0 && currentStock + step < 0)}
                            onClick={() => void applyDelta(step)}
                            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-auth-border bg-white/[0.03] px-2 text-sm font-medium text-auth-text transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-40"
                        >
                            {step > 0 ? `+${step}` : step}
                        </button>
                    ))}
                    <div className="flex min-w-[8rem] flex-1 items-center gap-1">
                        <button
                            type="button"
                            disabled={disabled || adjusting}
                            onClick={() => {
                                const n = Number(delta) || 0;
                                setDelta(String(n - 1));
                            }}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-auth-border text-auth-muted transition hover:bg-white/5"
                            aria-label="Restar uno"
                        >
                            <Minus className="h-4 w-4" />
                        </button>
                        <input
                            value={delta}
                            onChange={(e) => {
                                setDelta(e.target.value);
                                setAdjustError(null);
                            }}
                            inputMode="numeric"
                            placeholder="± cant."
                            disabled={disabled || adjusting}
                            className={`${inputClass} min-w-0 flex-1 px-2 text-center`}
                        />
                        <button
                            type="button"
                            disabled={disabled || adjusting}
                            onClick={() => {
                                const n = Number(delta) || 0;
                                setDelta(String(n + 1));
                            }}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-auth-border text-auth-muted transition hover:bg-white/5"
                            aria-label="Sumar uno"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>
                    <button
                        type="button"
                        disabled={disabled || adjusting || !delta.trim()}
                        onClick={handleApply}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-auth-accent px-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                    >
                        {adjusting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Aplicar
                    </button>
                </div>
                <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Nota del movimiento (opcional)"
                    disabled={disabled || adjusting}
                    className={`${inputClass} mt-2`}
                />
                {adjustError ? (
                    <p className="mt-2 text-xs text-auth-error">{adjustError}</p>
                ) : null}
            </div>

            <label className="mt-4 block border-t border-auth-border/60 pt-4">
                <span className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-auth-secondary">
                        Alerta cuando queden menos de
                    </span>
                    <span className="text-xs text-auth-muted">unidades</span>
                </span>
                <input
                    value={lowStockThreshold}
                    onChange={(e) => onLowStockThresholdChange(e.target.value)}
                    inputMode="numeric"
                    disabled={disabled}
                    className={inputClass}
                />
            </label>
        </div>
    );
}
