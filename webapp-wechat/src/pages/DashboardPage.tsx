import { useOutletContext } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

type OutletContext = { apiBase: string };

export function DashboardPage() {
    const { apiBase } = useOutletContext<OutletContext>();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">Dashboard</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Panel de administración para la app móvil. Conectado al backend compartido.
                </p>
            </div>

            <div className="rounded-xl border border-border-subtle bg-card p-6">
                <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                    <div>
                        <p className="font-medium">Proyecto inicializado</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            API: <code className="rounded bg-border-subtle px-1.5 py-0.5">{apiBase}</code>
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Acá podés agregar las secciones de gestión (usuarios, notificaciones, contenido, etc.).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
