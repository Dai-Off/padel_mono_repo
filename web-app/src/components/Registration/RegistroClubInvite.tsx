import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Mail, Building2, User, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { validateInvite, registerClubOwner } from '../../services/clubApplication';

export const RegistroClubInvite = () => {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const applicationId = searchParams.get('application_id') ?? '';
    const token = searchParams.get('token') ?? '';

    const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'already_completed' | 'completed_waiting_email'>('loading');
    const [email, setEmail] = useState('');
    const [clubName, setClubName] = useState('');
    const [responsibleName, setResponsibleName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!applicationId || !token) {
            setStatus('invalid');
            return;
        }
        let cancelled = false;
        validateInvite(applicationId, token)
            .then((data) => {
                if (cancelled) return;
                if (data.ok && data.email) {
                    setEmail(data.email);
                    setClubName(data.club_name ?? '');
                    setResponsibleName(data.responsible_name ?? '');
                    setStatus(data.already_completed ? 'already_completed' : 'valid');
                } else {
                    setStatus('invalid');
                }
            })
            .catch(() => {
                if (!cancelled) setStatus('invalid');
            });
        return () => { cancelled = true; };
    }, [applicationId, token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (password.length < 6) {
            setError(t('invite_password_min'));
            return;
        }
        if (password !== confirmPassword) {
            setError(t('invite_password_mismatch'));
            return;
        }
        setIsSubmitting(true);
        try {
            const res = await registerClubOwner(applicationId, token, password);
            if (res.ok && res.already_registered) {
                toast.info(res.message ?? t('invite_already_completed'));
                navigate('/login', { replace: true });
            } else if (res.ok) {
                toast.success(t('invite_success'));
                setStatus('completed_waiting_email');
            } else {
                setError(res.error ?? t('error_occurred'));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : t('connection_error'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (status === 'loading') {
        return (
            <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-[#E31E24] animate-spin" />
                    <p className="text-white/60 text-sm">{t('loading')}</p>
                </div>
            </div>
        );
    }

    if (status === 'invalid') {
        return (
            <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
                <motion.div
                    className="relative w-full max-w-md rounded-3xl border-2 border-red-500/50 bg-white/5 p-8 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <p className="text-red-400 font-semibold mb-4">{t('invite_invalid')}</p>
                    <p className="text-white/50 text-sm mb-6">{t('invite_invalid_help')}</p>
                    <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="px-6 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20"
                    >
                        {t('login')}
                    </button>
                </motion.div>
            </div>
        );
    }

    if (status === 'already_completed') {
        return (
            <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
                <motion.div
                    className="relative w-full max-w-md rounded-3xl border-2 border-green-500/50 bg-white/5 p-8 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <p className="text-green-400 font-semibold mb-4">{t('invite_already_completed')}</p>
                    <p className="text-white/50 text-sm mb-6">{t('invite_already_completed_help')}</p>
                    <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="px-6 py-2.5 rounded-xl bg-[#E31E24] text-white text-sm font-semibold hover:opacity-90"
                    >
                        {t('login')}
                    </button>
                </motion.div>
            </div>
        );
    }

    if (status === 'completed_waiting_email') {
        return (
            <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
                <motion.div
                    className="relative w-full max-w-md rounded-3xl border-2 border-green-500/50 bg-white/5 p-8 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <p className="text-green-400 font-semibold mb-4">{t('invite_check_email_title')}</p>
                    <p className="text-white/50 text-sm mb-6">{t('invite_check_email_body')}</p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
            <motion.div
                className="absolute top-[10%] left-[10%] w-[40%] h-[40%] rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(227, 30, 36, 0.12) 0%, transparent 65%)' }}
            />
            <motion.div
                className="relative w-full max-w-md"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="relative overflow-hidden rounded-3xl border-2 border-[#E31E24]/80 shadow-[0_0_24px_rgba(227,30,36,0.15)] bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-xl p-8">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/10 flex items-center justify-center">
                            <CheckCircle2 className="w-8 h-8 text-green-400" />
                        </div>
                        <h1 className="text-xl font-bold text-white">{t('invite_title')}</h1>
                        <p className="text-white/50 text-sm mt-1">{t('invite_subtitle')}</p>
                    </div>

                    {(clubName || responsibleName) && (
                        <div className="mb-6 p-4 rounded-xl bg-white/[0.04] space-y-2">
                            {clubName && (
                                <div className="flex items-center gap-2 text-white/80 text-sm">
                                    <Building2 className="w-4 h-4 text-white/40" />
                                    <span>{clubName}</span>
                                </div>
                            )}
                            {responsibleName && (
                                <div className="flex items-center gap-2 text-white/80 text-sm">
                                    <User className="w-4 h-4 text-white/40" />
                                    <span>{responsibleName}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">{t('email_label')}</label>
                            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm">
                                <Mail className="w-4 h-4 text-white/30" />
                                <span>{email}</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">{t('password_label')} *</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('invite_password_placeholder')}
                                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 text-sm focus:ring-2 focus:ring-[#E31E24]/50 focus:border-[#E31E24]/50 outline-none"
                                    required
                                    minLength={6}
                                />
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">{t('invite_confirm_password')} *</label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder={t('invite_confirm_password_placeholder')}
                                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 text-sm focus:ring-2 focus:ring-[#E31E24]/50 outline-none"
                                required
                                minLength={6}
                            />
                        </div>

                        {error && (
                            <p className="text-red-400 text-sm">{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70 bg-gradient-to-r from-[#E31E24] to-[#c01a20] hover:opacity-95"
                        >
                            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isSubmitting ? t('invite_creating') : t('invite_submit')}
                        </button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
};
