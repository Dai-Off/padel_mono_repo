import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { getSupabaseClient, parseHashParams } from '../../lib/supabase';

type Status = 'loading' | 'ready' | 'invalid' | 'success';

export const ResetPassword: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('invalid');
      return;
    }
    const params = parseHashParams();
    const accessToken = params.access_token;
    const refreshToken = params.refresh_token;
    const type = params.type;
    if (type === 'recovery' && accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(() => {
          window.history.replaceState(null, '', window.location.pathname);
          setStatus('ready');
        })
        .catch(() => setStatus('invalid'));
    } else {
      const search = new URLSearchParams(window.location.search);
      const tokenHash = search.get('token_hash');
      const queryType = search.get('type');
      if (tokenHash && queryType === 'recovery') {
        supabase.auth
          .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
          .then(() => {
            window.history.replaceState(null, '', window.location.pathname);
            setStatus('ready');
          })
          .catch(() => setStatus('invalid'));
      } else {
        setStatus('invalid');
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t('reset_password_min_length'));
      return;
    }
    if (password !== confirm) {
      toast.error(t('reset_password_mismatch'));
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      setStatus('success');
      toast.success(t('reset_password_success'));
      setTimeout(() => navigate('/login'), 2000);
    } catch {
      toast.error(t('connection_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
        <div className="w-8 h-8 border-2 border-[#E31E24]/30 border-t-[#E31E24] rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
        <motion.div
          className="relative w-full max-w-md rounded-3xl border-2 border-white/10 p-8"
          style={{ background: 'linear-gradient(170deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500" />
            <h1 className="text-xl font-bold text-white">{t('reset_password_invalid_title')}</h1>
            <p className="text-sm text-white/60">{t('reset_password_invalid_help')}</p>
            <Link
              to="/forgot-password"
              className="py-3 px-6 rounded-2xl text-white font-semibold text-sm"
              style={{ background: 'linear-gradient(135deg, rgb(227, 30, 36) 0%, rgb(192, 26, 32) 100%)' }}
            >
              {t('forgot_password_title')}
            </Link>
            <Link to="/login" className="text-white/50 hover:text-white/80 text-sm">
              {t('back_to_login')}
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
        <motion.div
          className="relative w-full max-w-md rounded-3xl border-2 border-[#E31E24]/80 p-8 text-center"
          style={{ background: 'linear-gradient(170deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%)' }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white">{t('reset_password_done')}</h1>
          <p className="text-white/60 text-sm mt-2">{t('reset_password_redirect')}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
      <motion.div
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className="relative overflow-hidden rounded-3xl border-2 border-[#E31E24]/80 shadow-[0_0_24px_rgba(227,30,36,0.15)]"
          style={{ background: 'linear-gradient(170deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%)' }}
        >
          <div className="absolute inset-0 backdrop-blur-xl" />
          <div className="relative z-10 p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-black text-white tracking-tight">{t('reset_password_title')}</h1>
              <p className="text-sm text-white/50 mt-2">{t('reset_password_subtitle')}</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                  {t('reset_password_new')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-10 py-3.5 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-[#E31E24]/50 focus:border-[#E31E24]/50 text-white placeholder-white/20 text-sm outline-none transition-all"
                    placeholder={t('reset_password_placeholder')}
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
                <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                  {t('reset_password_confirm')}
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-[#E31E24]/50 focus:border-[#E31E24]/50 text-white placeholder-white/20 text-sm outline-none transition-all"
                  placeholder={t('reset_password_placeholder')}
                />
              </div>
              <motion.button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, rgb(227, 30, 36) 0%, rgb(192, 26, 32) 100%)' }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />}
                {isSubmitting ? t('reset_password_saving') : t('reset_password_submit')}
              </motion.button>
            </form>

            <Link to="/login" className="block mt-4 text-center text-white/40 hover:text-white/70 text-sm">
              {t('back_to_login')}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
