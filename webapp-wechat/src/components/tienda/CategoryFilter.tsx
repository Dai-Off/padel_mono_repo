import type { StoreCategory } from '../../types/api';

export type CategoryFilterValue = '' | StoreCategory;

const CATEGORIES: { value: CategoryFilterValue; label: string }[] = [
    { value: '', label: 'Todas' },
    { value: 'palas', label: 'Palas' },
    { value: 'pelotas', label: 'Pelotas' },
    { value: 'calzado', label: 'Calzado' },
    { value: 'ropa', label: 'Ropa' },
    { value: 'accesorios', label: 'Accesorios' },
];

type CategoryFilterProps = {
    value: CategoryFilterValue;
    onChange: (value: CategoryFilterValue) => void;
    compact?: boolean;
};

export function CategoryFilter({ value, onChange, compact }: CategoryFilterProps) {
    return (
        <div
            className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Filtrar por categoría"
        >
            {CATEGORIES.map((item) => {
                const selected = value === item.value;
                return (
                    <button
                        key={item.value || 'all'}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onChange(item.value)}
                        className={[
                            'shrink-0 rounded-full border font-medium transition',
                            compact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
                            selected
                                ? 'border-auth-accent/50 bg-auth-accent/15 text-auth-accent'
                                : 'border-auth-border bg-white/[0.03] text-auth-muted hover:border-white/15 hover:text-auth-text',
                        ].join(' ')}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
