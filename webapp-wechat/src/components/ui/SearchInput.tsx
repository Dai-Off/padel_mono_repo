import { Search } from 'lucide-react';

type SearchInputProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
};

export function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
    return (
        <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-auth-secondary" />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-auth-border-input bg-auth-input py-2.5 pl-10 pr-4 text-sm text-auth-text outline-none transition auth-input-focus placeholder:text-auth-secondary"
            />
        </div>
    );
}
