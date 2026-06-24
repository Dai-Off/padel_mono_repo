type PlaceholderPageProps = {
    title: string;
    description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
    return (
        <div className="w-full">
            <h1 className="text-2xl font-bold text-auth-text sm:text-3xl lg:text-4xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-auth-muted sm:mt-3 sm:text-base">
                {description}
            </p>
            <div className="mt-8 rounded-2xl border border-dashed border-auth-border bg-[rgba(255,255,255,0.02)] p-8 text-center sm:p-12">
                <p className="text-sm text-auth-secondary sm:text-base">
                    Esta sección estará disponible próximamente.
                </p>
            </div>
        </div>
    );
}
