type PageLoaderProps = {
    label?: string;
};

export function PageLoader({ label }: PageLoaderProps) {
    return (
        <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="relative h-10 w-10">
                    <div className="absolute inset-[-8px] rounded-full bg-auth-accent/10 blur-lg" />
                    <div className="relative h-full w-full animate-spin rounded-full border-2 border-white/10 border-t-auth-accent" />
                </div>
                {label ? <p className="text-sm text-auth-secondary">{label}</p> : null}
            </div>
        </div>
    );
}
