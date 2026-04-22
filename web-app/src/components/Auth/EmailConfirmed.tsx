import { CheckCircle2, ArrowRight } from 'lucide-react';

export const EmailConfirmed = () => {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#000000] px-4 selection:bg-[#F18F34]/30">
            {/* Background decorative elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#F18F34]/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#F18F34]/5 blur-[120px]" />
            </div>

            <div className="w-full max-w-md relative">
                {/* Logo top spacing */}
                <div className="flex justify-center mb-12">
                    <img 
                        src="https://oxowmfhnorxnabhzkcmi.supabase.co/storage/v1/object/public/public-assets/imagen_2026-04-22_105702379.png" 
                        alt="WeMatch" 
                        className="h-12 w-auto"
                    />
                </div>

                <div className="w-full rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl p-10 text-center shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
                    <div className="flex flex-col items-center gap-6 mb-8">
                        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#F18F34]/20 to-[#F18F34]/5 flex items-center justify-center border border-[#F18F34]/20">
                            <CheckCircle2 className="w-10 h-10 text-[#F18F34]" />
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold text-white tracking-tight">
                                ¡Email confirmado!
                            </h1>
                            <div className="h-1 w-12 bg-[#F18F34] mx-auto rounded-full" />
                        </div>
                    </div>

                    <p className="text-base text-white/70 leading-relaxed mb-10">
                        Tu cuenta ha sido activada con éxito. Ya puedes volver a la aplicación móvil para empezar a jugar.
                    </p>

                    <div className="space-y-4">
                        <button 
                            onClick={() => window.close()}
                            className="group w-full py-4 px-6 rounded-2xl bg-[#F18F34] text-black font-bold text-sm transition-all duration-300 hover:bg-[#ff9d47] hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            Volver a la App
                            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                        </button>
                        
                        <p className="text-xs text-white/30 uppercase tracking-[0.2em] font-medium">
                            WeMatch Padel Community
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

