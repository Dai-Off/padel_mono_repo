import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { getSupabaseClient, parseHashParams } from '../../lib/supabase';

type Status = 'loading' | 'ready' | 'invalid' | 'success';

export const ResetPassword: React.FC = () => {
    const [status, setStatus] = useState<Status>('loading');
    const [errorDetail, setErrorDetail] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const init = async () => {
            try {
                const supabase = getSupabaseClient();
                if (!supabase) throw new Error('No se pudo conectar con el sistema de autenticación');

                const params = parseHashParams();
                const accessToken = params.access_token;
                const refreshToken = params.refresh_token;
                const isRecovery = params.type === 'recovery' || window.location.hash.includes('type=recovery');

                if (isRecovery && accessToken) {
                    const { error } = await supabase.auth.setSession({ 
                        access_token: accessToken, 
                        refresh_token: refreshToken || '' 
                    });
                    
                    if (error) throw error;
                    
                    // Limpiar la URL para seguridad
                    window.history.replaceState(null, '', window.location.pathname);
                    setStatus('ready');
                } else {
                    // Si no hay tokens en el fragmento o no es tipo recovery, probamos con query params (OTP)
                    const search = new URLSearchParams(window.location.search);
                    const tokenHash = search.get('token_hash');
                    if (tokenHash) {
                        const { error } = await supabase.auth.verifyOtp({ 
                            token_hash: tokenHash, 
                            type: 'recovery' 
                        });
                        if (error) throw error;
                        setStatus('ready');
                    } else {
                        throw new Error('El enlace no contiene las claves de seguridad necesarias o ya ha sido utilizado.');
                    }
                }
            } catch (err: any) {
                console.error('Reset password init error:', err);
                setErrorDetail(err.message || 'Error desconocido');
                setStatus('invalid');
            }
        };

        init();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }
        if (password !== confirm) {
            toast.error('Las contraseñas no coinciden');
            return;
        }

        const supabase = getSupabaseClient();
        if (!supabase) return;

        setIsSubmitting(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;

            setStatus('success');
            toast.success('Contraseña actualizada correctamente');
            setTimeout(() => navigate('/login'), 3000);
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar la contraseña');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (status === 'loading') {
        return (
            <div className="fixed inset-0 bg-[#000000] z-50 flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-[#F18F34]/20 border-t-[#F18F34] rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#000000] px-4 selection:bg-[#F18F34]/30">
            {/* Background decorative elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#F18F34]/5 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#F18F34]/5 blur-[120px]" />
            </div>

            <div className="w-full max-w-md relative">
                {/* Logo */}
                <div className="flex justify-center mb-10">
                    <img 
                        src="https://oxowmfhnorxnabhzkcmi.supabase.co/storage/v1/object/public/public-assets/imagen_2026-04-22_105702379.png" 
                        alt="WeMatch" 
                        className="h-10 w-auto"
                    />
                </div>

                <div className="w-full rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl p-8 text-center shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
                    <AnimatePresence mode="wait">
                        {status === 'invalid' && (
                            <motion.div 
                                key="invalid"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="space-y-6"
                            >
                                <div className="w-20 h-20 rounded-3xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 mx-auto">
                                    <AlertCircle className="w-10 h-10 text-amber-500" />
                                </div>
                                <div className="space-y-2">
                                    <h1 className="text-xl font-bold text-white">Enlace inválido o expirado</h1>
                                    <p className="text-sm text-white/50 leading-relaxed px-4">
                                        {errorDetail || 'Este enlace de recuperación ya no es válido. Por favor, solicita uno nuevo desde la aplicación.'}
                                    </p>
                                </div>
                                <div className="pt-4 space-y-4">
                                    <Link 
                                        to="/login"
                                        className="inline-flex w-full py-4 px-6 rounded-2xl bg-white/5 text-white font-semibold text-sm transition-all hover:bg-white/10 items-center justify-center gap-2"
                                    >
                                        Volver al inicio
                                    </Link>
                                </div>
                            </motion.div>
                        )}

                        {status === 'success' && (
                            <motion.div 
                                key="success"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="space-y-6"
                            >
                                <div className="w-20 h-20 rounded-3xl bg-green-500/10 flex items-center justify-center border border-green-500/20 mx-auto">
                                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                                </div>
                                <div className="space-y-2">
                                    <h1 className="text-xl font-bold text-white">¡Listo! Contraseña actualizada</h1>
                                    <p className="text-sm text-white/50 tracking-tight">Redirigiéndote al inicio de sesión...</p>
                                </div>
                            </motion.div>
                        )}

                        {status === 'ready' && (
                            <motion.div 
                                key="ready"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-left"
                            >
                                <div className="text-center mb-8">
                                    <h1 className="text-2xl font-bold text-white tracking-tight">Nueva Contraseña</h1>
                                    <p className="text-sm text-white/50 mt-2">Elige una contraseña segura que puedas recordar.</p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-1">Nueva Contraseña</label>
                                        <div className="relative group">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                required
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="w-full px-5 py-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl focus:ring-2 focus:ring-[#F18F34]/40 focus:border-[#F18F34]/40 text-white placeholder-white/10 text-sm outline-none transition-all"
                                                placeholder="Mínimo 6 caracteres"
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="p-1 text-white/20 hover:text-white/60 transition-colors"
                                                >
                                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] ml-1">Confirmar Contraseña</label>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            required
                                            value={confirm}
                                            onChange={(e) => setConfirm(e.target.value)}
                                            className="w-full px-5 py-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl focus:ring-2 focus:ring-[#F18F34]/40 focus:border-[#F18F34]/40 text-white placeholder-white/10 text-sm outline-none transition-all"
                                            placeholder="Repite tu contraseña"
                                        />
                                    </div>

                                    <button 
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="group w-full py-4 mt-4 px-6 rounded-2xl bg-[#F18F34] text-black font-bold text-sm transition-all duration-300 hover:bg-[#ff9d47] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? 'Guardando...' : 'Actualizar Contraseña'}
                                        {!isSubmitting && <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />}
                                    </button>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
