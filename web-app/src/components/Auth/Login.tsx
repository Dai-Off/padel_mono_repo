import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, LogIn, Mail, Lock, AlertCircle, Plus } from 'lucide-react';
import { authService } from '../../services/auth';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const Login: React.FC = () => {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (sessionStorage.getItem('padel_session_expired')) {
            sessionStorage.removeItem('padel_session_expired');
            toast.error(t('session_expired'));
        }
    }, [t]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const response = await authService.login(email, password);
            if (response.ok && response.session) {
                authService.saveSession(response.session);
                toast.success(t('login_success'));
                try {
                    const me = await authService.getMe();
                    if (me.ok && me.roles?.admin_id) {
                        navigate('/admin');
                    } else {
                        navigate('/');
                    }
                } catch {
                    navigate('/');
                }
            } else {
                setError(t(response.error === 'Email o contraseña incorrectos' ? 'invalid_credentials' : 'login_error'));
                toast.error(t('invalid_credentials'));
            }
        } catch (err: any) {
            setError(t('connection_error'));
            toast.error(t('connection_error'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
            {/* Background Decorations */}
            <motion.div
                className="absolute top-[10%] left-[10%] w-[40%] h-[40%] rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(227, 30, 36, 0.12) 0%, transparent 65%)' }}
                animate={{
                    x: [0, 15, 0],
                    y: [0, -10, 0],
                    scale: [1, 1.05, 1]
                }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
                className="absolute bottom-[10%] right-[10%] w-[35%] h-[35%] rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(91, 141, 238, 0.08) 0%, transparent 65%)' }}
                animate={{
                    x: [0, -20, 0],
                    y: [0, 15, 0]
                }}
                transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />

            <motion.div
                className="relative w-full max-w-md"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="relative overflow-hidden rounded-3xl border-2 border-[#E31E24]/80 shadow-[0_0_24px_rgba(227,30,36,0.15)]"
                    style={{ background: 'linear-gradient(170deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%)' }}>
                    <div className="absolute inset-0 backdrop-blur-xl"></div>

                    <div className="relative z-10 p-8">
                        <div className="text-center mb-8">
                            <motion.div
                                className="w-20 h-20 mx-auto mb-5 rounded-2xl overflow-hidden bg-white p-2 shadow-lg shadow-white/5"
                                whileHover={{ scale: 1.05 }}
                                transition={{ type: "spring", stiffness: 300 }}
                            >
                                <img
                                    src="/logo.png"
                                    alt={t('login_title')}
                                    className="w-full h-full object-contain"
                                />
                            </motion.div>
                            <motion.h1
                                className="text-2xl font-black text-white tracking-tight"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                {t('login_title')}
                            </motion.h1>
                            <motion.p
                                className="text-xs text-white/40 mt-2"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                {t('login_subtitle')}
                            </motion.p>
                        </div>

                        <form className="space-y-5" onSubmit={handleSubmit}>
                            {/* Email Field */}
                            <div>
                                <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                                    {t('email_label')}
                                </label>
                                <div className="relative">
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-10 py-3.5 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-[#E31E24]/50 focus:border-[#E31E24]/50 text-white placeholder-white/20 text-sm outline-none transition-all"
                                        placeholder={t('email_placeholder')}
                                    />
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                </div>
                            </div>

                            {/* Password Field */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                                        {t('password_label')}
                                    </label>
                                    <Link to="/forgot-password" className="text-[10px] text-[#E31E24]/90 hover:text-[#E31E24] uppercase tracking-wider">
                                        {t('forgot_password_link')}
                                    </Link>
                                </div>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-10 py-3.5 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-[#E31E24]/50 focus:border-[#E31E24]/50 text-white placeholder-white/20 text-sm outline-none transition-all"
                                        placeholder={t('password_placeholder')}
                                    />
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="flex items-center gap-2 text-red-500 text-xs font-medium bg-red-500/10 p-3 rounded-xl border border-red-500/20"
                                    >
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        {error}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <motion.button
                                type="submit"
                                disabled={isLoading}
                                className="w-full relative overflow-hidden py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                style={{ background: 'linear-gradient(135deg, rgb(227, 30, 36) 0%, rgb(192, 26, 32) 100%)' }}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {isLoading && (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                )}
                                <LogIn className="w-4 h-4 relative z-10" />
                                <span className="relative z-10">{isLoading ? t('logging_in') : t('login_button')}</span>
                                <motion.div
                                    className="absolute inset-0 opacity-30"
                                    style={{ background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)' }}
                                    animate={{ x: ['-100%', '200%'] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                />
                            </motion.button>
                        </form>

                        <div className="flex items-center gap-3 my-6">
                            <div className="flex-1 h-px bg-white/20" />
                            <span className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/40 text-xs">o</span>
                            <div className="flex-1 h-px bg-white/20" />
                        </div>

                        <Link
                            to="/registro"
                            className="w-full py-3.5 rounded-2xl border-2 border-[#E31E24] bg-transparent text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#E31E24]/10 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            {t('register_my_club')}
                        </Link>

                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="w-full mt-4 text-white/30 py-2 rounded-xl hover:text-white/50 transition-colors text-sm"
                        >
                            {t('cancel')}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
