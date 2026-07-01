import type { ReactNode } from 'react';

export type PageHeaderSize = 'sm' | 'md';

export function pageHeaderTitleClass(size: PageHeaderSize = 'md'): string {
    return size === 'sm'
        ? 'text-lg font-bold tracking-tight text-auth-text sm:text-xl'
        : 'text-xl font-bold tracking-tight text-auth-text sm:text-2xl';
}

type PageHeaderProps = {
    title: string;
    description?: string;
    count?: number;
    /** Márgenes reducidos en pantallas de lista fija */
    dense?: boolean;
    /** `sm` solo para Tienda; el resto de secciones usan `md` */
    size?: PageHeaderSize;
    actions?: ReactNode;
};

export function PageHeader({
    title,
    description,
    count,
    dense = false,
    size = 'md',
    actions,
}: PageHeaderProps) {
    return (
        <div
            className={`flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${
                dense ? 'mb-3 sm:mb-4' : 'mb-6 gap-4 sm:mb-8'
            }`}
        >
            <div className="min-w-0 flex-1">
                <h1 className={pageHeaderTitleClass(size)}>{title}</h1>
                {description ? (
                    <p
                        className={`mt-1 max-w-2xl text-auth-muted ${
                            dense ? 'text-sm' : 'mt-1.5 text-sm sm:text-base'
                        }`}
                    >
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            {!actions && typeof count === 'number' ? (
                <p className="text-sm text-auth-secondary">
                    {count} {count === 1 ? 'resultado' : 'resultados'}
                </p>
            ) : null}
        </div>
    );
}
