import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

type ConfirmDialogProps = {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'danger' | 'default';
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    tone = 'default',
    loading,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !loading) onCancel();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = prev;
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, loading, onCancel]);

    if (!open) return null;

    const confirmClass =
        tone === 'danger'
            ? 'bg-red-600 hover:bg-red-500'
            : 'bg-auth-accent hover:opacity-90';

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={loading ? undefined : onCancel}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-desc"
                className="w-full max-w-md rounded-2xl border border-auth-border bg-[#141414] p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id="confirm-dialog-title" className="text-lg font-semibold text-auth-text">
                    {title}
                </h2>
                <p id="confirm-dialog-desc" className="mt-2 text-sm leading-relaxed text-auth-muted">
                    {description}
                </p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className="rounded-xl border border-auth-border px-4 py-2.5 text-sm font-medium text-auth-text transition hover:bg-white/5 disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${confirmClass}`}
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
