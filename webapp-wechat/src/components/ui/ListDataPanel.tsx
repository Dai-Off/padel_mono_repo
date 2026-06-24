import type { ReactNode } from 'react';

type ListDataPanelProps = {
    loading: boolean;
    isEmpty: boolean;
    emptyMessage: string;
    children: ReactNode;
    footer?: ReactNode;
};

export function ListDataPanel({
    loading,
    isEmpty,
    emptyMessage,
    children,
    footer,
}: ListDataPanelProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-auth-border bg-auth-card">
            {loading ? (
                <div className="flex flex-1 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-auth-accent/25 border-t-auth-accent" />
                </div>
            ) : isEmpty ? (
                <div className="flex flex-1 items-center justify-center px-4">
                    <p className="text-center text-sm text-auth-secondary">{emptyMessage}</p>
                </div>
            ) : (
                <>
                    <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
                    {footer ? <div className="shrink-0 border-t border-auth-border">{footer}</div> : null}
                </>
            )}
        </div>
    );
}
