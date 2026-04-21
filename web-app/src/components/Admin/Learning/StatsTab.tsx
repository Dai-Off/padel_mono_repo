import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { adminLearningService } from '../../../services/adminLearning';
import type { LearningStats } from '../../../types/adminLearning';

export function StatsTab() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminLearningService.getStats();
      setStats(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: t('admin_learning_active_questions'), value: stats.active_questions, total: stats.total_questions, color: '#6366F1' },
    { label: t('admin_learning_active_courses'), value: stats.active_courses, total: stats.total_courses, color: '#22C55E' },
    { label: t('admin_learning_pending_courses'), value: stats.pending_courses, total: null, color: '#F59E0B' },
  ];

  return (
    <div className="space-y-6">
      {/* Cards principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl border border-gray-100 p-5"
          >
            <p className="text-2xl font-black text-[#1A1A1A]">{s.value}</p>
            {s.total !== null && (
              <p className="text-[10px] text-gray-300 -mt-0.5">/ {s.total} total</p>
            )}
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top clubes por preguntas */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-xs font-bold text-[#1A1A1A]">{t('admin_learning_top_clubs_questions')}</h3>
          {stats.questions_by_club.length === 0 ? (
            <p className="text-[10px] text-gray-400">—</p>
          ) : (
            <div className="space-y-2">
              {stats.questions_by_club.slice(0, 10).map((c, i) => (
                <div key={c.club_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-300 w-4">{i + 1}</span>
                    <span className="text-xs text-[#1A1A1A]">{c.club_name}</span>
                  </div>
                  <span className="text-xs font-bold text-[#1A1A1A]">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top clubes por cursos */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-xs font-bold text-[#1A1A1A]">{t('admin_learning_top_clubs_courses')}</h3>
          {stats.courses_by_club.length === 0 ? (
            <p className="text-[10px] text-gray-400">—</p>
          ) : (
            <div className="space-y-2">
              {stats.courses_by_club.slice(0, 10).map((c, i) => (
                <div key={c.club_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-300 w-4">{i + 1}</span>
                    <span className="text-xs text-[#1A1A1A]">{c.club_name}</span>
                  </div>
                  <span className="text-xs font-bold text-[#1A1A1A]">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
