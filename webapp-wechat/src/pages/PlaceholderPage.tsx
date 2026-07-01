import { PageHeader } from '../components/ui/PageHeader';

type PlaceholderPageProps = {
    title: string;
    description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
    return (
        <div className="w-full">
            <PageHeader title={title} description={description} />
            <div className="rounded-2xl border border-dashed border-auth-border bg-[rgba(255,255,255,0.02)] p-8 text-center sm:p-12">
                <p className="text-sm text-auth-secondary sm:text-base">
                    Esta sección estará disponible próximamente.
                </p>
            </div>
        </div>
    );
}
