import { CheckCircle2 } from 'lucide-react';

export const EmailConfirmed = () => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0D0D0D] px-4">
            <div className="w-full max-w-md rounded-3xl border border-green-500/40 bg-white/[0.04] p-8 text-center shadow-[0_0_24px_rgba(34,197,94,0.25)]">
                <div className="flex flex-col items-center gap-3 mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </div>
                    <h1 className="text-lg font-bold text-white">
                        Email verificado correctamente
                    </h1>
                </div>
                <p className="text-sm text-white/70 mb-4">
                    Tu correo se ha confirmado con éxito. Ya puedes iniciar sesión en la app móvil.
                </p>
                <p className="text-xs text-white/40">
                    Puedes cerrar esta ventana y volver a la aplicación.
                </p>
            </div>
        </div>
    );
};

