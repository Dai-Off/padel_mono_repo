type PageHeaderProps = {
    title: string;
    description: string;
    count?: number;
    compact?: boolean;
};

export function PageHeader({ title, description, count, compact }: PageHeaderProps) {
    return (
        <div
            className={`flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${
                compact ? 'mb-3 sm:mb-4' : 'mb-6 gap-4 sm:mb-8'
            }`}
        >
            <div>
                <h1 className={`font-bold text-auth-text ${compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'}`}>
                    {title}
                </h1>
                <p className={`mt-1 max-w-2xl text-auth-muted ${compact ? 'text-sm' : 'mt-1.5 text-sm sm:text-base'}`}>
                    {description}
                </p>
            </div>
            {typeof count === 'number' ? (
                <p className="text-sm text-auth-secondary">
                    {count} {count === 1 ? 'resultado' : 'resultados'}
                </p>
            ) : null}
        </div>
    );
}
