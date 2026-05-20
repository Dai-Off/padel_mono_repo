import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { learningContentService } from '../../../services/learningContent';
import { adminLearningService } from '../../../services/adminLearning';
import type { QuestionDetailStats } from '../../../types/adminLearning';

/**
 * Modal de estadísticas detalladas de una pregunta. El padre decide qué
 * servicio usar (admin o club) vía la prop `useAdminEndpoint`.
 */

interface Props {
  questionId: string;
  useAdminEndpoint?: boolean;
  onClose: () => void;
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1A1A1A', border: 'none', borderRadius: 10, fontSize: 11, color: 'white' },
  labelStyle: { color: '#9CA3AF', fontSize: 10 },
  itemStyle: { color: 'white' },
};

export function QuestionStatsModal({ questionId, useAdminEndpoint, onClose }: Props) {
  const [stats, setStats] = useState<QuestionDetailStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fn = useAdminEndpoint
        ? adminLearningService.getQuestionStats
        : learningContentService.getQuestionStats;
      const data = await fn(questionId);
      setStats(data);
    } catch (e) {
      toast.error((e as Error).message);
      onClose();
    } finally {
      setLoading(false);
    }
  }, [questionId, useAdminEndpoint, onClose]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-start justify-center overflow-y-auto px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-3xl shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-[#1A1A1A]">Estadísticas de la pregunta</h3>
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

function StatsBody({ stats }: { stats: QuestionDetailStats }) {
  const positivePct = stats.votes_up + stats.votes_down > 0
    ? Math.round((stats.votes_up / (stats.votes_up + stats.votes_down)) * 100)
    : null;
  const successPct = stats.success_rate !== null ? Math.round(stats.success_rate * 100) : null;

  return (
    <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
      {/* Aviso si hay respuestas anteriores a la última edición */}
      {stats.has_pre_edit_logs && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800">
            Esta pregunta se editó el {new Date(stats.content_updated_at).toLocaleDateString('es')}.
            Las estadísticas se muestran solo desde entonces, para que reflejen la versión actual.
          </p>
        </div>
      )}

      {stats.total_attempts === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          Aún no hay respuestas a la versión actual.
        </div>
      ) : (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumberCard label="Respuestas" value={stats.total_attempts} />
            <NumberCard label="% acierto" value={successPct !== null ? `${successPct}%` : '—'} />
            <NumberCard
              label="Tiempo medio"
              value={stats.avg_response_ms !== null ? `${(stats.avg_response_ms / 1000).toFixed(1)}s` : '—'}
            />
            <NumberCard label="% positivo" value={positivePct !== null ? `${positivePct}%` : '—'} subtitle={`👍 ${stats.votes_up} · 👎 ${stats.votes_down}`} />
          </div>

          {/* Tendencia */}
          {stats.daily_responses_30d.some((d) => d.count > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase">Respuestas últimos 30 días</h4>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.daily_responses_30d} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="qStatsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366F1" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: '#9CA3AF' }}
                      tickFormatter={(d: string) => d.slice(5)}
                      interval={Math.floor(stats.daily_responses_30d.length / 6)}
                    />
                    <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} width={28} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2} fill="url(#qStatsGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Distribución de respuestas (solo tipos con opciones discretas) */}
          {stats.answer_distribution && stats.answer_distribution.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase">Qué eligieron los jugadores</h4>
              <div className="space-y-2">
                {stats.answer_distribution.map((opt) => {
                  const total = stats.answer_distribution!.reduce((s, o) => s + o.count, 0);
                  const pct = total > 0 ? Math.round((opt.count / total) * 100) : 0;
                  return (
                    <div key={opt.key} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`flex items-center gap-1.5 ${opt.is_correct ? 'font-bold text-emerald-700' : 'text-[#1A1A1A]'}`}>
                          {opt.is_correct ? '✓' : '✗'} <span className="truncate">{opt.label || '—'}</span>
                        </span>
                        <span className="text-gray-500">
                          <span className="font-semibold">{opt.count}</span> ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${opt.is_correct ? 'bg-emerald-500' : 'bg-gray-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Acierto por nivel del jugador */}
          {stats.elo_distribution.some((b) => b.attempts > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase">Acierto por nivel del jugador</h4>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.elo_distribution.map((b) => ({
                      label: b.label,
                      pct: b.attempts > 0 ? Math.round((b.correct / b.attempts) * 100) : 0,
                      attempts: b.attempts,
                    }))}
                    margin={{ top: 6, right: 6, left: -10, bottom: 0 }}
                  >
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval={0} />
                    <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} width={28} unit="%" domain={[0, 100]} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v: number, _key, item: { payload?: { attempts?: number } }) => [`${v}% (${item?.payload?.attempts ?? 0} respuestas)`, 'Acierto']}
                    />
                    <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                      {stats.elo_distribution.map((b, i) => (
                        <Cell key={i} fill={b.attempts > 0 ? '#6366F1' : '#E5E7EB'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[9px] text-gray-300">
                Niveles que solo tienen muestra escasa pueden ser engañosos. Considera el contexto antes de actuar.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NumberCard({ label, value, subtitle }: { label: string; value: number | string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className="text-2xl font-black text-[#1A1A1A]">{typeof value === 'number' ? value.toLocaleString('es') : value}</p>
      <p className="text-[10px] text-gray-500 mt-1">{label}</p>
      {subtitle && <p className="text-[9px] text-gray-300">{subtitle}</p>}
    </div>
  );
}
