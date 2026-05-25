import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { learningContentService } from '../../../services/learningContent';
import { LEVEL_PRESETS } from './LevelFilter';
import type { ClubLearningStats, StatBucket } from '../../../types/adminLearning';

const PALETTE_TYPE = ['#6366F1', '#22C55E', '#F59E0B', '#06B6D4', '#EC4899', '#8B5CF6'];
const PALETTE_AREA = ['#F43F5E', '#10B981', '#3B82F6', '#A855F7', '#EAB308'];

type SubTab = 'questions' | 'courses';

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1A1A1A', border: 'none', borderRadius: 10, fontSize: 11, color: 'white' },
  labelStyle: { color: '#9CA3AF', fontSize: 10 },
  itemStyle: { color: 'white' },
};

export function ClubStatsView({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<ClubLearningStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('questions');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await learningContentService.getClubStats(clubId);
      setStats(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!stats) return null;

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'questions', label: 'Preguntas' },
    { key: 'courses', label: 'Cursos' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5 flex-wrap">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === tab.key ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <motion.div key={activeSubTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
        {activeSubTab === 'questions' && <QuestionsStats stats={stats} t={t} />}
        {activeSubTab === 'courses' && <CoursesStats stats={stats} />}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-tab: Preguntas (panel club)
// ---------------------------------------------------------------------------

function QuestionsStats({ stats, t }: { stats: ClubLearningStats; t: ReturnType<typeof useTranslation>['t'] }) {
  const typeData = Object.entries(stats.by_type).map(([k, v]) => ({
    name: t(`learning_type_${k}`, k),
    value: v.count,
  })).sort((a, b) => b.value - a.value);

  const areaData = Object.entries(stats.by_area).map(([k, v]) => ({
    name: t(`learning_area_${k}`, k),
    value: v.count,
    attempts: v.attempts,
    correct: v.correct,
    successPct: v.attempts > 0 ? Math.round((v.correct / v.attempts) * 100) : null,
  })).sort((a, b) => b.value - a.value);

  const successByArea = areaData
    .filter((a) => a.attempts >= 20 && a.successPct !== null)
    .map((a) => ({ name: a.name, pct: a.successPct as number }));

  const levelByPreset = useMemo(() => {
    const out: Array<{ label: string; count: number }> = [];
    for (const preset of LEVEL_PRESETS) {
      const acc: StatBucket = { count: 0, attempts: 0, correct: 0 };
      for (const [lvl, bucket] of Object.entries(stats.by_level)) {
        const l = Number(lvl);
        if (l + 0.5 >= preset.min && l + 0.5 <= preset.max) {
          acc.count += bucket.count;
          acc.attempts += bucket.attempts;
          acc.correct += bucket.correct;
        }
      }
      out.push({ label: preset.label.split(' (')[0], count: acc.count });
    }
    return out;
  }, [stats]);

  const totalVotesClub = stats.feedback_up_total + stats.feedback_down_total;
  const clubPositiveRate = totalVotesClub > 0 ? stats.feedback_up_total / totalVotesClub : null;

  const totalAttemptsClub = Object.values(stats.by_area).reduce((s, b) => s + b.attempts, 0);
  const totalCorrectClub = Object.values(stats.by_area).reduce((s, b) => s + b.correct, 0);
  const clubSuccessRate = totalAttemptsClub > 0 ? totalCorrectClub / totalAttemptsClub : null;

  const totalWarnings = stats.warnings_by_kind.too_easy + stats.warnings_by_kind.too_hard + stats.warnings_by_kind.low_quality;

  return (
    <div className="space-y-5">
      {/* Cards superiores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SimpleStatCard label="Tus preguntas activas" value={stats.active_questions} />
        <SimpleStatCard label="Jugadores activos (7d)" value={stats.active_players_7d} />
        <SimpleStatCard label="Respuestas en 7d" value={stats.volume_last_7d} />
        <SimpleStatCard label="Respuestas en 30d" value={stats.volume_last_30d} />
      </div>

      {/* Tendencia 30d */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-xs font-bold text-[#1A1A1A]">Respuestas a tus preguntas (30 días)</h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.daily_responses_30d} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="clubVolumeGrad" x1="0" y1="0" x2="0" y2="1">
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
              <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} width={28} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2} fill="url(#clubVolumeGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Distribuciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <DistributionCard title="Tus preguntas por tipo" data={typeData} colors={PALETTE_TYPE} />
        <DistributionCard title="Tus preguntas por área" data={areaData} colors={PALETTE_AREA} />
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-xs font-bold text-[#1A1A1A]">Tus preguntas por nivel</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={levelByPreset} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval={0} />
                <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} width={28} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Calidad agregada con benchmark */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 lg:col-span-2">
          <h3 className="text-xs font-bold text-[#1A1A1A]">Tasa de acierto por área</h3>
          {successByArea.length === 0 ? (
            <p className="text-[10px] text-gray-400">Aún no hay áreas con suficientes respuestas (mín. 20).</p>
          ) : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={successByArea} layout="vertical" margin={{ top: 0, right: 10, left: 50, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#9CA3AF' }} unit="%" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#1A1A1A' }} width={60} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${Number(v) || 0}%`, 'Acierto']} />
                  <Bar dataKey="pct" fill="#6366F1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <ComparisonCard label="Acierto medio" value={clubSuccessRate} benchmark={stats.benchmark.success_rate} />
          <ComparisonCard label="Satisfacción media" value={clubPositiveRate} benchmark={stats.benchmark.positive_rate} />
        </div>
      </div>

      {/* Avisos */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-bold text-[#1A1A1A]">Avisos abiertos en tu contenido</h3>
          <span className="text-[10px] text-gray-400">{totalWarnings} en total</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <WarningStatCard label="Demasiado fáciles" value={stats.warnings_by_kind.too_easy} bg="bg-amber-50" text="text-amber-700" />
          <WarningStatCard label="Demasiado difíciles" value={stats.warnings_by_kind.too_hard} bg="bg-red-50" text="text-red-600" />
          <WarningStatCard label="Calidad cuestionable" value={stats.warnings_by_kind.low_quality} bg="bg-fuchsia-50" text="text-fuchsia-700" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-tab: Cursos (panel club)
// ---------------------------------------------------------------------------

function CoursesStats({ stats }: { stats: ClubLearningStats }) {
  const courseLevelsData = Object.entries(stats.course_levels).map(([label, count]) => ({ label, count }));
  const allLevelsZero = courseLevelsData.every((x) => x.count === 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SimpleStatCard label="Tus cursos activos" value={stats.active_courses} />
        <SimpleStatCard label="Pendientes revisión" value={stats.pending_courses} highlight={stats.pending_courses > 0} />
        <SimpleStatCard label="Lecciones completadas (7d)" value={stats.lessons_completed_7d} />
        <SimpleStatCard label="Jugadores con cursos (30d)" value={stats.course_players_30d} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumberCard label="Lecciones totales" value={stats.total_lessons_published} subtitle="en tus cursos activos" />
        <NumberCard label="Lecciones por curso" value={stats.avg_lessons_per_course !== null ? stats.avg_lessons_per_course.toFixed(1) : '—'} subtitle="media" />
        <NumberCard
          label="Duración media"
          value={stats.avg_lesson_duration_seconds !== null ? formatDuration(stats.avg_lesson_duration_seconds) : '—'}
          subtitle="por lección"
        />
        <NumberCard
          label="Cursos con vídeo"
          value={stats.courses_with_full_video_rate !== null ? `${Math.round(stats.courses_with_full_video_rate * 100)}%` : '—'}
          subtitle="todas las lecciones"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumberCard label="Cursos iniciados" value={stats.courses_started} />
        <NumberCard label="Cursos completados" value={stats.courses_completed} />
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <ComparisonCard
            label="Finalización vs media"
            value={stats.course_completion_rate}
            benchmark={stats.benchmark.completion_rate}
          />
        </div>
        <NumberCard
          label="Profundidad media"
          value={stats.avg_depth_completed !== null ? stats.avg_depth_completed.toFixed(1) : '—'}
          subtitle="lecciones por jugador"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-xs font-bold text-[#1A1A1A]">Tus cursos activos por nivel</h3>
        {allLevelsZero ? (
          <p className="text-[10px] text-gray-400">Sin cursos activos.</p>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={courseLevelsData} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9CA3AF' }} interval={0} />
                <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} width={28} allowDecimals={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function SimpleStatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-4 ${highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}
    >
      <p className="text-2xl font-black text-[#1A1A1A]">{value.toLocaleString('es')}</p>
      <p className="text-[10px] text-gray-500 mt-1">{label}</p>
    </motion.div>
  );
}

function NumberCard({ label, value, subtitle }: { label: string; value: number | string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className="text-2xl font-black text-[#1A1A1A]">
        {typeof value === 'number' ? value.toLocaleString('es') : value}
      </p>
      <p className="text-[10px] text-gray-500 mt-1">{label}</p>
      {subtitle && <p className="text-[9px] text-gray-300">{subtitle}</p>}
    </div>
  );
}

function WarningStatCard({ label, value, bg, text }: { label: string; value: number; bg: string; text: string }) {
  return (
    <div className={`rounded-xl ${bg} p-3`}>
      <p className={`text-2xl font-black ${text}`}>{value}</p>
      <p className="text-[10px] text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function ComparisonCard({ label, value, benchmark }: { label: string; value: number | null; benchmark: number | null }) {
  if (value === null) {
    return (
      <div>
        <p className="text-[10px] text-gray-500">{label}</p>
        <p className="text-2xl font-black text-gray-300">—</p>
      </div>
    );
  }
  const pct = Math.round(value * 100);
  const diff = benchmark !== null ? Math.round((value - benchmark) * 100) : null;
  const positive = diff !== null && diff > 0;
  const neutral = diff === null || diff === 0;
  return (
    <div>
      <p className="text-[10px] text-gray-500">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-black text-[#1A1A1A]">{pct}%</p>
        {diff !== null && (
          <span className={`text-[10px] font-bold ${neutral ? 'text-gray-400' : positive ? 'text-emerald-600' : 'text-red-500'}`}>
            {neutral ? '' : positive ? '▲ ' : '▼ '}
            {Math.abs(diff)} pts vs media
          </span>
        )}
      </div>
    </div>
  );
}

interface DistributionDatum { name: string; value: number; }
function DistributionCard({ title, data, colors }: { title: string; data: DistributionDatum[]; colors: string[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-xs font-bold text-[#1A1A1A]">{title}</h3>
        <p className="text-[10px] text-gray-400">Sin datos.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <h3 className="text-xs font-bold text-[#1A1A1A]">{title}</h3>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={36} outerRadius={64} paddingAngle={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip {...TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="text-[#1A1A1A]">{d.name}</span>
            </div>
            <span className="text-gray-500 font-semibold">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}
