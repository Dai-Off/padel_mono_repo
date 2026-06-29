import { AlertTriangle, EyeOff, Package, PackageX } from 'lucide-react';

export type StoreStockFilter = 'published' | 'low_stock' | 'out_of_stock' | 'hidden';

export function matchesStoreStockFilter(product: {
    is_active: boolean;
    stock_quantity: number;
    low_stock_threshold: number;
}, filter: StoreStockFilter): boolean {
    if (filter === 'published') return product.is_active;
    if (filter === 'hidden') return !product.is_active;
    if (filter === 'low_stock') {
        return (
            product.is_active &&
            product.stock_quantity > 0 &&
            product.stock_quantity <= product.low_stock_threshold
        );
    }
    return product.is_active && product.stock_quantity <= 0;
}

type StoreStatsCardsProps = {
    active: number;
    lowStock: number;
    outOfStock: number;
    hidden: number;
    compact?: boolean;
    stockFilter?: StoreStockFilter | null;
    onStockFilterChange?: (filter: StoreStockFilter | null) => void;
};

function StatCard({
    label,
    value,
    icon: Icon,
    tone,
    compact,
    selected,
    onClick,
}: {
    label: string;
    value: number;
    icon: typeof Package;
    tone: 'default' | 'warning' | 'danger' | 'muted';
    compact?: boolean;
    selected?: boolean;
    onClick?: () => void;
}) {
    const toneClasses = {
        default: 'text-auth-text',
        warning: 'text-amber-400',
        danger: 'text-red-400',
        muted: 'text-auth-muted',
    }[tone];

    const iconClasses = {
        default: 'bg-white/5 text-auth-muted',
        warning: 'bg-amber-500/10 text-amber-400',
        danger: 'bg-red-500/10 text-red-400',
        muted: 'bg-white/5 text-auth-secondary',
    }[tone];

    const interactive = Boolean(onClick);
    const className = compact
        ? `flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${
              selected
                  ? 'border-auth-accent/60 bg-auth-accent/10 ring-1 ring-auth-accent/40'
                  : 'border-auth-border bg-white/[0.02]'
          } ${interactive ? 'cursor-pointer hover:bg-white/[0.05]' : ''}`
        : `flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
              selected
                  ? 'border-auth-accent/60 bg-auth-accent/10 ring-1 ring-auth-accent/40'
                  : 'border-auth-border bg-white/[0.02]'
          } ${interactive ? 'cursor-pointer hover:bg-white/[0.05]' : ''}`;

    const content = (
        <>
            <div className={`flex shrink-0 items-center justify-center rounded-md ${iconClasses} ${compact ? 'h-6 w-6' : 'h-9 w-9 rounded-lg'}`}>
                <Icon className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            </div>
            <div className="min-w-0 leading-none">
                <p className={`truncate text-auth-secondary ${compact ? 'text-[10px]' : 'text-xs'}`}>{label}</p>
                <p
                    className={`font-semibold tabular-nums ${toneClasses} ${
                        compact ? 'mt-0.5 text-sm' : 'text-lg leading-tight'
                    }`}
                >
                    {value}
                </p>
            </div>
        </>
    );

    if (interactive) {
        return (
            <button type="button" onClick={onClick} className={className} aria-pressed={selected}>
                {content}
            </button>
        );
    }

    return <div className={className}>{content}</div>;
}

export function StoreStatsCards({
    active,
    lowStock,
    outOfStock,
    hidden,
    compact,
    stockFilter = null,
    onStockFilterChange,
}: StoreStatsCardsProps) {
    const toggle = (filter: StoreStockFilter) => {
        if (!onStockFilterChange) return;
        onStockFilterChange(stockFilter === filter ? null : filter);
    };

    return (
        <div
            className={
                compact
                    ? 'grid grid-cols-2 gap-1.5 sm:grid-cols-4'
                    : 'grid grid-cols-1 gap-2 xs:grid-cols-2 sm:gap-3 lg:grid-cols-4'
            }
        >
            <StatCard
                label="Publicados"
                value={active}
                icon={Package}
                tone="default"
                compact={compact}
                selected={stockFilter === 'published'}
                onClick={onStockFilterChange ? () => toggle('published') : undefined}
            />
            <StatCard
                label="Stock crítico"
                value={lowStock}
                icon={AlertTriangle}
                tone="warning"
                compact={compact}
                selected={stockFilter === 'low_stock'}
                onClick={onStockFilterChange ? () => toggle('low_stock') : undefined}
            />
            <StatCard
                label="Agotados"
                value={outOfStock}
                icon={PackageX}
                tone="danger"
                compact={compact}
                selected={stockFilter === 'out_of_stock'}
                onClick={onStockFilterChange ? () => toggle('out_of_stock') : undefined}
            />
            <StatCard
                label="Ocultos"
                value={hidden}
                icon={EyeOff}
                tone="muted"
                compact={compact}
                selected={stockFilter === 'hidden'}
                onClick={onStockFilterChange ? () => toggle('hidden') : undefined}
            />
        </div>
    );
}
