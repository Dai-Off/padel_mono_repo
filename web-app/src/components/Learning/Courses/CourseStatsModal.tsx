import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { learningContentService } from '../../../services/learningContent';
import { adminLearningService } from '../../../services/adminLearning';
import type { CourseDetailStats } from '../../../types/adminLearning';

/**
 * Modal de estadísticas detalladas de un curso. Mismo patrón que
 * QuestionStatsModal: el padre decide qué servicio usar con `useAdminEndpoint`.
 */

interface Props {
  courseId: string;
  courseTitle?: string;
  useAdminEndpoint?: boolean;
  onClose: () => void;
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1A1A1A', border: 'none', borderRadius: 10, fontSize: 11, color: 'white' },
  labelStyle: { color: '#9CA3AF', fontSize: 10 },
  itemStyle: { color: 'white' },
};

export function CourseStatsModal({ courseId, courseTitle, useAdminEndpoint, onClose }: Props) {
  const [stats, setStats] = useState<CourseDetailStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fn = useAdminEndpoint ? adminLearningService.getCourseStats : learningContentService.getCourseStats;
      const data = await fn(courseId);
      setStats(data);
    } catch (e) {
      toast.error((e as Error).message);
      onClose();
    } finally {
      setLoading(false);
    }
  }, [courseId, useAdminEndpoint, onClose]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-start justify-center overflow-y-auto px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-3xl shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-[#1A1A1A] truncate">
            Estadísticas {courseTitle ? `· ${courseTitle}` : 'del curso'}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : stats ? (
          <StatsBody stats={stats} />
        ) : null}
      </motion.div>
    </div>
  );
}

function StatsBody({ stats }: { stats: CourseDetailStats }) {
  if (stats.total_lessons === 0) {
    return (
      <div className="p-5 text-center text-gray-400 text-sm">Este curso no tiene lecciones todavía.</div>
    );
  }
  const completionPct = stats.completion_rate !== null ? Math.round(stats.completion_rate * 100) : null;
  const maxCompletions = Math.max(...stats.lesson_funnel.map((l) => l.completions), 1);

  return (
    <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumberCard label="Iniciados" value={stats.players_started} />
        <NumberCard label="Completados" value={stats.players_completed} />
        <NumberCard label="% finalización" value={completionPct !== null ? `${completionPct}%` : '—'} />
        <NumberCard label="Lecciones 30d" value={stats.lessons_completed_30d} />
      </div>

      {/* Tendencia */}
      {stats.daily_progress_30d.some((d) => d.count > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
          <h4 className="text-[10px] font-bold text-gray-500 uppercase">Progreso últimos 30 días</h4>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.daily_progress_30d} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="cStatsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: '#9CA3AF' }}
                  tickFormatter={(d: string) => d.slice(5)}
                  interval={Math.floor(stats.daily_progress_30d.length / 6)}
                />
                <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} width={24} allowDecimals={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2} fill="url(#cStatsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Funnel de lecciones */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <h4 className="text-[10px] font-bold text-gray-500 uppercase">Progreso por lección</h4>
        <div className="space-y-2">
          {stats.lesson_funnel.map((l) => {
            const widthPct = (l.completions / maxCompletions) * 100;
            return (
              <div key={l.lesson_id} className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-gray-300 font-bold w-4 shrink-0">{l.order}.</span>
                    <span className="truncate text-[#1A1A1A]">{l.title}</span>
                  </span>
                  <span className="text-gray-500 font-semibold ml-2 shrink-0">{l.completions}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${widthPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NumberCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className="text-2xl font-black text-[#1A1A1A]">{typeof value === 'number' ? value.toLocaleString('es') : value}</p>
      <p className="text-[10px] text-gray-500 mt-1">{label}</p>
    </div>
  );
}
