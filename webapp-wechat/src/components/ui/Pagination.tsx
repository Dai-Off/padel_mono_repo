import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
    page: number;
    total: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
};

export function Pagination({ page, total, pageSize, totalItems, onPageChange }: PaginationProps) {
    if (totalItems <= 0) return null;

    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, totalItems);
    const singlePage = totalItems <= pageSize;

    return (
        <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-2">
            <p className="text-xs text-auth-secondary sm:text-sm">
                {singlePage
                    ? totalItems === 1
                        ? '1 resultado'
                        : `${totalItems} resultados`
                    : `${from}–${to} de ${totalItems}`}
            </p>
            {singlePage ? null : (
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => onPageChange(page - 1)}
                        className="inline-flex items-center gap-1 rounded-lg border border-auth-border px-3 py-1.5 text-xs text-auth-text transition enabled:hover:border-[rgba(241,143,52,0.35)] enabled:hover:text-auth-accent disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                    </button>
                    <span className="min-w-[5.5rem] text-center text-xs text-auth-muted sm:text-sm">
                        {page} / {total}
                    </span>
                    <button
                        type="button"
                        disabled={page >= total}
                        onClick={() => onPageChange(page + 1)}
                        className="inline-flex items-center gap-1 rounded-lg border border-auth-border px-3 py-1.5 text-xs text-auth-text transition enabled:hover:border-[rgba(241,143,52,0.35)] enabled:hover:text-auth-accent disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
                    >
                        Siguiente
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
