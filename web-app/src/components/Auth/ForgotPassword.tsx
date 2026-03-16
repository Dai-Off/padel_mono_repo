import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { authService } from '../../services/auth';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const ForgotPassword: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    try {
      const res = await authService.forgotPassword(email.trim());
      if (res.ok) {
        setSent(true);
        toast.success(t('forgot_password_sent'));
      } else {
        toast.error(res.error || t('forgot_password_error'));
      }
    } catch {
      toast.error(t('connection_error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0D0D0D] z-50 flex items-center justify-center p-5">
      <motion.div
        className="absolute top-[10%] left-[10%] w-[40%] h-[40%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(227, 30, 36, 0.12) 0%, transparent 65%)' }}
        animate={{ x: [0, 15, 0], y: [0, -10, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
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
              <h1 className="text-2xl font-black text-white tracking-tight">{t('forgot_password_title')}</h1>
              <p className="text-sm text-white/50 mt-2">{t('forgot_password_subtitle')}</p>
            </div>

            {sent ? (
              <div className="space-y-6">
                <p className="text-white/80 text-sm text-center">{t('forgot_password_check_email')}</p>
                <Link
                  to="/login"
                  className="w-full py-3.5 rounded-2xl border-2 border-[#E31E24] bg-transparent text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#E31E24]/10 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('back_to_login')}
                </Link>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
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
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, rgb(227, 30, 36) 0%, rgb(192, 26, 32) 100%)' }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />}
                  <Send className="w-4 h-4" />
                  {isLoading ? t('forgot_password_sending') : t('forgot_password_submit')}
                </motion.button>
              </form>
            )}

            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full mt-4 text-white/30 py-2 rounded-xl hover:text-white/50 transition-colors text-sm flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('cancel')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
