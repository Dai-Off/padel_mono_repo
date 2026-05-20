import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { learningContentService } from '../../../services/learningContent';
import { QuestionFormModal } from './QuestionFormModal';
import { WARNING_CHIP } from './warningChips';
import { WarningTypeFilter, type WarningFilter } from './WarningTypeFilter';
import type { Question, QuestionWithWarnings, WarningKind } from '../../../types/learningContent';

/**
 * Sub-tab "Avisos" del panel club. Lista las preguntas del club con al menos
 * un aviso de calidad (muy fáciles, muy difíciles, sin tracción, calidad
 * cuestionable) según la lógica centralizada del backend. Click en el preview
 * abre el modal de edición para que el club pueda corregir.
 */

interface Props {
  clubId: string;
  onCountChange: (count: number) => void;
}

function extractPreview(q: Question): string {
  if (q.type === 'puzzle') {
    const c = q.content as { statement?: string };
    return c.statement ?? '—';
  }
  const c = q.content;
  if ('question' in c && typeof c.question === 'string') return c.question;
  if ('statement' in c && typeof c.statement === 'string') return c.statement;
  if ('pairs' in c && Array.isArray(c.pairs)) return `${c.pairs.length} pares`;
  if ('steps' in c && Array.isArray(c.steps)) return `${c.steps.length} pasos`;
  return '—';
}

export function ClubWarningsView({ clubId, onCountChange }: Props) {
  const [items, setItems] = useState<QuestionWithWarnings[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Question | null>(null);
  const [filter, setFilter] = useState<WarningFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, count } = await learningContentService.getClubWarnings(clubId);
      setItems(data);
      onCountChange(count);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clubId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (items.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">Sin avisos. Todo bajo control.</div>;
  }

  const counts: Record<WarningKind, number> = { too_easy: 0, too_hard: 0, low_quality: 0 };
  for (const q of items) for (const w of q.warnings) counts[w]++;
  const visible = filter === 'all' ? items : items.filter((q) => q.warnings.includes(filter));

  return (
    <div className="space-y-3">
      <WarningTypeFilter value={filter} onChange={setFilter} counts={counts} />
      {visible.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Sin avisos de este tipo.</div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visible.map((q) => (
          <div key={q.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {q.warnings.map((w) => (
                <span
                  key={w}
                  title={WARNING_CHIP[w].description}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${WARNING_CHIP[w].bg} ${WARNING_CHIP[w].text}`}
                >
                  {WARNING_CHIP[w].icon} {WARNING_CHIP[w].label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[10px] text-gray-500">
              <span>Lv. {q.level}</span>
              <span>·</span>
              <span className={
                q.status === 'published' ? 'text-emerald-600' :
                q.status === 'draft' ? 'text-amber-600' : 'text-red-500'
              }>
                {q.status === 'published' ? 'Publicada' : q.status === 'draft' ? 'Borrador' : 'Inactiva'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEditing(q)}
              className="w-full text-left text-xs text-[#1A1A1A] line-clamp-2 hover:underline"
            >
              {extractPreview(q)}
            </button>
            {(q.attempts_count ?? 0) > 0 && (
              <div className="text-[10px] text-gray-400">
                {q.attempts_count} respuestas · {Math.round(((q.correct_count ?? 0) / (q.attempts_count ?? 1)) * 100)}% acierto
                {(q.feedback_up ?? 0) + (q.feedback_down ?? 0) > 0 && (
                  <> · 👍 {q.feedback_up} · 👎 {q.feedback_down}</>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {editing && (
        <QuestionFormModal
          mode="edit"
          question={editing}
          clubId={clubId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
