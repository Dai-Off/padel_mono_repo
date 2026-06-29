import type { ReactNode } from 'react';

type ListDataPanelProps = {
    loading: boolean;
    isEmpty: boolean;
    emptyMessage?: string;
    emptyContent?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    className?: string;
};

export function ListDataPanel({
    loading,
    isEmpty,
    emptyMessage,
    emptyContent,
    children,
    footer,
    className,
}: ListDataPanelProps) {
    return (
        <div
            className={[
                'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-auth-border bg-auth-card',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {loading ? (
                <div className="flex flex-1 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-auth-accent/25 border-t-auth-accent" />
                </div>
            ) : isEmpty ? (
                <div className="flex flex-1 items-center justify-center px-6 py-10">
                    {emptyContent ?? (
                        <p className="text-center text-sm text-auth-secondary">{emptyMessage}</p>
                    )}
                </div>
            ) : (
                <>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain">{children}</div>
                    {footer ? <div className="shrink-0 border-t border-auth-border">{footer}</div> : null}
                </>
            )}
        </div>
    );
}
