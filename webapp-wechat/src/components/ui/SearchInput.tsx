import { Search } from 'lucide-react';

type SearchInputProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    className?: string;
    compact?: boolean;
};

export function SearchInput({ value, onChange, placeholder, className, compact }: SearchInputProps) {
    return (
        <div className={['relative w-full', className ?? 'sm:max-w-md'].filter(Boolean).join(' ')}>
            <Search
                className={[
                    'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-auth-secondary',
                    compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
                ].join(' ')}
            />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={[
                    'w-full rounded-lg border border-auth-border-input bg-auth-input pl-9 pr-3 text-auth-text outline-none transition auth-input-focus placeholder:text-auth-secondary',
                    compact ? 'py-1.5 text-xs' : 'rounded-xl py-2.5 pl-10 pr-4 text-sm',
                ].join(' ')}
            />
        </div>
    );
}
