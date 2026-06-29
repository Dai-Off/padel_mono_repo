import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { StoreProduct } from '../../types/api';

type StockAdjustModalProps = {
    open: boolean;
    product: StoreProduct | null;
    saving?: boolean;
    onClose: () => void;
    onSubmit: (quantityDelta: number, note: string) => Promise<void>;
};

export function StockAdjustModal({ open, product, saving, onClose, onSubmit }: StockAdjustModalProps) {
    const [delta, setDelta] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setDelta('');
        setNote('');
        setError(null);
    }, [open, product?.id]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!open || !product) return null;

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const quantityDelta = Number(delta);
        if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
            setError('Ingresá un número entero distinto de 0 (positivo suma, negativo resta)');
            return;
        }
        const nextStock = product.stock_quantity + quantityDelta;
        if (nextStock < 0) {
            setError(`Stock insuficiente. Actual: ${product.stock_quantity}`);
            return;
        }
        setError(null);
        try {
            await onSubmit(quantityDelta, note.trim());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo ajustar el stock');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-md rounded-2xl border border-auth-border bg-[#141414] shadow-2xl"
            >
                <div className="flex items-center justify-between border-b border-auth-border px-5 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-auth-text">Ajustar stock</h2>
                        <p className="mt-0.5 text-sm text-auth-muted">{product.name}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-auth-muted transition hover:bg-white/5 hover:text-auth-text"
                        aria-label="Cerrar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={(e) => void handleSubmit(e)} className="px-5 py-4">
                    <p className="mb-4 text-sm text-auth-secondary">
                        Stock actual: <span className="font-medium text-auth-text">{product.stock_quantity}</span>
                    </p>

                    {error ? (
                        <p className="mb-4 rounded-xl border border-auth-error/40 bg-auth-error/10 px-3 py-2 text-sm text-auth-error">
                            {error}
                        </p>
                    ) : null}

                    <label className="mb-4 block">
                        <span className="mb-1.5 block text-sm text-auth-muted">Cantidad (+ ingreso / − egreso)</span>
                        <input
                            value={delta}
                            onChange={(e) => setDelta(e.target.value)}
                            inputMode="numeric"
                            placeholder="Ej: 10 o -2"
                            className="w-full rounded-xl border border-auth-border-input bg-auth-input px-3 py-2.5 text-auth-text outline-none focus:border-auth-accent"
                            autoFocus
                        />
                    </label>

                    <label className="mb-4 block">
                        <span className="mb-1.5 block text-sm text-auth-muted">Nota (opcional)</span>
                        <input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Ej: Reposición proveedor"
                            className="w-full rounded-xl border border-auth-border-input bg-auth-input px-3 py-2.5 text-auth-text outline-none focus:border-auth-accent"
                        />
                    </label>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="rounded-xl border border-auth-border px-4 py-2 text-sm text-auth-text transition hover:bg-white/5 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl bg-auth-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Aplicar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
