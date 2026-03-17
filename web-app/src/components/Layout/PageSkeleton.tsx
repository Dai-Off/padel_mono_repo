export const PageSkeleton = () => {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans">
            <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border-subtle">
                <div className="px-5 py-3.5">
                    <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-muted animate-pulse" />
                            <div className="space-y-1">
                                <div className="h-3 w-32 rounded-full bg-muted animate-pulse" />
                                <div className="h-2 w-16 rounded-full bg-muted/70 animate-pulse" />
                            </div>
                        </div>
                        <div className="h-8 w-20 rounded-xl bg-muted animate-pulse" />
                    </div>
                </div>
            </div>

            <main className="px-4 sm:px-5 py-5 pb-20">
                <div className="max-w-7xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="h-4 w-40 rounded-full bg-muted animate-pulse" />
                        <div className="h-8 w-28 rounded-xl bg-muted animate-pulse" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Array.from({ length: 6 }).map((_, idx) => (
                            <div
                                key={idx}
                                className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 animate-pulse"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="h-3 w-24 rounded-full bg-muted" />
                                    <div className="h-5 w-16 rounded-full bg-muted/80" />
                                </div>
                                <div className="space-y-2">
                                    <div className="h-2.5 w-full rounded-full bg-muted" />
                                    <div className="h-2.5 w-5/6 rounded-full bg-muted" />
                                    <div className="h-2.5 w-4/6 rounded-full bg-muted" />
                                    <div className="h-2.5 w-3/6 rounded-full bg-muted" />
                                </div>
                                <div className="h-8 w-full rounded-xl bg-muted/80" />
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};

