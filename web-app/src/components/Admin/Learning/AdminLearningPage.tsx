import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { AdminHeader } from '../AdminHeader';
import { PageSpinner } from '../../Layout/PageSpinner';
import { authService } from '../../../services/auth';
import { HttpError } from '../../../services/api';
import { ReviewTab } from './ReviewTab';
import { WeMatchTab } from './WeMatchTab';
import { ModerationTab } from './ModerationTab';
import { StatsTab } from './StatsTab';

type Tab = 'review' | 'wematch' | 'moderation' | 'stats';

export const AdminLearningPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('review');
  const [pendingCount, setPendingCount] = useState(0);

  // Auth check + cargar count de pendientes
  const init = useCallback(async () => {
    try {
      const token = authService.getSession()?.access_token;
      if (!token) { navigate('/login'); return; }
      const me = await authService.getMe();
      if (!me.ok || !me.roles?.admin_id) { navigate('/'); return; }
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 401) { authService.logout(); navigate('/login'); return; }
        if (e.status === 403) { navigate('/'); return; }
      }
      toast.error(t('fetch_error'));
    } finally {
      setLoading(false);
    }
  }, [navigate, t]);

  useEffect(() => { init(); }, [init]);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'review', label: t('admin_learning_review'), badge: pendingCount > 0 ? pendingCount : undefined },
    { key: 'wematch', label: t('admin_learning_wematch') },
    { key: 'moderation', label: t('admin_learning_moderation') },
    { key: 'stats', label: t('admin_learning_stats') },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans">
        <AdminHeader />
        <PageSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <AdminHeader />

      <main className="px-4 sm:px-5 py-5 pb-20">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Título */}
          <h2 className="text-lg font-bold text-[#1A1A1A]">{t('admin_learning_title')}</h2>

          {/* Tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === tab.key
                    ? 'bg-[#1A1A1A] text-white'
                    : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
                }`}
              >
                {tab.label}
                {tab.badge && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold min-w-[18px] text-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Contenido del tab activo */}
          {activeTab === 'review' && <ReviewTab onPendingCountChange={setPendingCount} />}
          {activeTab === 'wematch' && <WeMatchTab />}
          {activeTab === 'moderation' && <ModerationTab />}
          {activeTab === 'stats' && <StatsTab />}
        </div>
      </main>
    </div>
  );
};
