import type { ReactNode } from 'react';

type ListPageShellProps = {
    children: ReactNode;
};

/** Pantalla fija sin scroll — header + búsqueda + card con paginado. */
export function ListPageShell({ children }: ListPageShellProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
        </div>
    );
}
