import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Upload, Video } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { learningContentService, validateVideo, VIDEO_LIMITS } from '../../../services/learningContent';
import type {
  Question,
  QuestionType,
  QuestionArea,
  QuestionContent,
  TestClassicContent,
  TrueFalseContent,
  MultiSelectContent,
  MatchColumnsContent,
  OrderSequenceContent,
} from '../../../types/learningContent';

const QUESTION_TYPES: QuestionType[] = ['test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence'];
const QUESTION_AREAS: QuestionArea[] = ['technique', 'tactics', 'physical', 'mental', 'rules'];

// Estado por defecto del contenido según tipo
function defaultContent(type: QuestionType): QuestionContent {
  switch (type) {
    case 'test_classic':
      return { question: '', options: ['', '', '', ''], correct_index: 0 } as TestClassicContent;
    case 'true_false':
      return { statement: '', correct_answer: true } as TrueFalseContent;
    case 'multi_select':
      return { question: '', options: ['', '', '', ''], correct_indices: [] } as MultiSelectContent;
    case 'match_columns':
      return { pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] } as MatchColumnsContent;
    case 'order_sequence':
      return { steps: ['', '', ''] } as OrderSequenceContent;
  }
}

interface Props {
  mode: 'create' | 'edit';
  question?: Question;
  clubId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function QuestionFormModal({ mode, question, clubId, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  // Campos comunes
  const [type, setType] = useState<QuestionType>(question?.type ?? 'test_classic');
  const [level, setLevel] = useState(question?.level ?? 0);
  const [area, setArea] = useState<QuestionArea>(question?.area ?? 'technique');
  const [videoUrl, setVideoUrl] = useState(question?.video_url ?? '');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Contenido (se resetea al cambiar tipo en modo crear)
  const [content, setContent] = useState<QuestionContent>(
    question?.content ?? defaultContent(type),
  );

  const handleTypeChange = (newType: QuestionType) => {
    if (newType === type) return;
    setType(newType);
    // Siempre resetear contenido al cambiar tipo (el contenido anterior no es compatible)
    setContent(defaultContent(newType));
  };

  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);

  const processVideoFile = async (file: File) => {
    setValidating(true);
    try {
      await validateVideo(file, VIDEO_LIMITS.question);
      setVideoFile(file);
      setVideoUrl(file.name);
    } catch (e) {
      toast.error((e as Error).message);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setValidating(false);
    }
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processVideoFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) processVideoFile(file);
  };

  const removeVideo = () => {
    setVideoFile(null);
    setVideoUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Validación del contenido según tipo
  const validateContent = (): string | null => {
    switch (type) {
      case 'test_classic': {
        const c = content as TestClassicContent;
        if (!c.question.trim()) return t('learning_field_question');
        if (c.options.some((o) => !o.trim())) return t('learning_field_options');
        return null;
      }
      case 'true_false': {
        const c = content as TrueFalseContent;
        if (!c.statement.trim()) return t('learning_field_statement');
        return null;
      }
      case 'multi_select': {
        const c = content as MultiSelectContent;
        if (!c.question.trim()) return t('learning_field_question');
        if (c.options.some((o) => !o.trim())) return t('learning_field_options');
        if (c.correct_indices.length < 2 || c.correct_indices.length > 3) return t('learning_field_correct_answer');
        return null;
      }
      case 'match_columns': {
        const c = content as MatchColumnsContent;
        if (c.pairs.some((p) => !p.left.trim() || !p.right.trim()))
          return `${t('learning_field_pair_left')} / ${t('learning_field_pair_right')}`;
        return null;
      }
      case 'order_sequence': {
        const c = content as OrderSequenceContent;
        if (c.steps.some((s) => !s.trim())) return t('learning_field_step');
        return null;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const contentError = validateContent();
    if (contentError) return toast.error(contentError);

    setSaving(true);
    try {
      // Si hay un archivo nuevo, subirlo primero
      let finalVideoUrl = videoUrl;

      if (videoFile) {
        setUploading(true);
        finalVideoUrl = await learningContentService.uploadQuestionVideo(clubId, videoFile);
        setUploading(false);
      }

      const body = {
        club_id: clubId,
        type,
        level,
        area,
        video_url: finalVideoUrl || null,
        content,
      };

      if (mode === 'create') {
        await learningContentService.createQuestion(body);
      } else if (question) {
        await learningContentService.updateQuestion(question.id, body);
      }
      toast.success(t('learning_save_success'));
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center overflow-y-auto py-20 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-lg shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-sm font-bold text-[#1A1A1A]">
            {mode === 'create' ? t('learning_add_question') : t('learning_edit_question')}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Tipo */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_type')}</label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              {QUESTION_TYPES.map((qt) => (
                <option key={qt} value={qt}>{t(`learning_type_${qt}`)}</option>
              ))}
            </select>
          </div>

          {/* Área y Nivel */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_area')}</label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as QuestionArea)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              >
                {QUESTION_AREAS.map((qa) => (
                  <option key={qa} value={qa}>{t(`learning_area_${qa}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_level')}</label>
              <input
                type="number"
                min={0}
                max={7}
                step={0.5}
                value={level}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  // Solo permitir incrementos de 0.5
                  const rounded = Math.round(val * 2) / 2;
                  setLevel(Math.max(0, Math.min(7, rounded)));
                }}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Video */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
              {t('learning_field_video')}
              <span className="text-gray-300 font-normal ml-1">
                (máx {VIDEO_LIMITS.question.maxSizeMB}MB, {VIDEO_LIMITS.question.maxDurationSec}s)
              </span>
            </label>
            {validating ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-indigo-200 text-xs font-bold text-indigo-400">
                <div className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                {t('learning_validating_video')}
              </div>
            ) : videoUrl ? (
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <Video className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-xs text-[#1A1A1A] truncate flex-1">
                  {videoFile ? videoFile.name : videoUrl.split('/').pop()}
                </span>
                <button
                  type="button"
                  onClick={removeVideo}
                  className="p-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full flex items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed text-xs font-bold cursor-pointer transition-all ${
                  dragging
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-500'
                    : 'border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-500'
                }`}
              >
                <Upload className="w-4 h-4" />
                {t('learning_video_dropzone')}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleVideoSelect}
              className="hidden"
            />
          </div>

          {/* Separador */}
          <div className="border-t border-gray-100" />

          {/* Contenido dinámico según tipo */}
          {type === 'test_classic' && (
            <TestClassicFields
              content={content as TestClassicContent}
              onChange={(c) => setContent(c)}
              t={t}
            />
          )}
          {type === 'true_false' && (
            <TrueFalseFields
              content={content as TrueFalseContent}
              onChange={(c) => setContent(c)}
              t={t}
            />
          )}
          {type === 'multi_select' && (
            <MultiSelectFields
              content={content as MultiSelectContent}
              onChange={(c) => setContent(c)}
              t={t}
            />
          )}
          {type === 'match_columns' && (
            <MatchColumnsFields
              content={content as MatchColumnsContent}
              onChange={(c) => setContent(c)}
              t={t}
            />
          )}
          {type === 'order_sequence' && (
            <OrderSequenceFields
              content={content as OrderSequenceContent}
              onChange={(c) => setContent(c)}
              t={t}
            />
          )}

          {/* Botones */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#1A1A1A] bg-gray-50 hover:bg-gray-100 transition-all"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#E31E24] hover:opacity-90 transition-all disabled:opacity-50"
            >
              {uploading ? `${t('learning_field_video')}...` : saving ? '...' : t('save')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes de contenido por tipo
// ---------------------------------------------------------------------------

type TFn = (key: string) => string;

function TestClassicFields({ content, onChange, t }: { content: TestClassicContent; onChange: (c: TestClassicContent) => void; t: TFn }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_question')}</label>
        <textarea
          value={content.question}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          rows={2}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_options')}</label>
        <div className="space-y-2">
          {content.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct_index"
                checked={content.correct_index === i}
                onChange={() => onChange({ ...content, correct_index: i as 0 | 1 | 2 | 3 })}
              />
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const opts = [...content.options] as [string, string, string, string];
                  opts[i] = e.target.value;
                  onChange({ ...content, options: opts });
                }}
                placeholder={`${t('learning_field_option').replace('{{n}}', String(i + 1))}`}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrueFalseFields({ content, onChange, t }: { content: TrueFalseContent; onChange: (c: TrueFalseContent) => void; t: TFn }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_statement')}</label>
        <textarea
          value={content.statement}
          onChange={(e) => onChange({ ...content, statement: e.target.value })}
          rows={2}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_correct_answer')}</label>
        <div className="flex gap-2">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => onChange({ ...content, correct_answer: val })}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                content.correct_answer === val
                  ? 'bg-[#1A1A1A] text-white'
                  : 'bg-gray-50 text-[#1A1A1A]'
              }`}
            >
              {val ? t('learning_field_true') : t('learning_field_false')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MultiSelectFields({ content, onChange, t }: { content: MultiSelectContent; onChange: (c: MultiSelectContent) => void; t: TFn }) {
  const toggleIndex = (i: number) => {
    const indices = content.correct_indices.includes(i)
      ? content.correct_indices.filter((x) => x !== i)
      : content.correct_indices.length >= 3
        ? content.correct_indices
        : [...content.correct_indices, i];
    onChange({ ...content, correct_indices: indices });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_question')}</label>
        <textarea
          value={content.question}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          rows={2}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_options')}</label>
        <div className="space-y-2">
          {content.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={content.correct_indices.includes(i)}
                onChange={() => toggleIndex(i)}
                className="rounded"
              />
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const opts = [...content.options] as [string, string, string, string];
                  opts[i] = e.target.value;
                  onChange({ ...content, options: opts });
                }}
                placeholder={`${t('learning_field_option').replace('{{n}}', String(i + 1))}`}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchColumnsFields({ content, onChange, t }: { content: MatchColumnsContent; onChange: (c: MatchColumnsContent) => void; t: TFn }) {
  const updatePair = (i: number, side: 'left' | 'right', value: string) => {
    const pairs = content.pairs.map((p, idx) => (idx === i ? { ...p, [side]: value } : p));
    onChange({ ...content, pairs });
  };

  const addPair = () => {
    if (content.pairs.length >= 5) return;
    onChange({ ...content, pairs: [...content.pairs, { left: '', right: '' }] });
  };

  const removePair = (i: number) => {
    if (content.pairs.length <= 3) return;
    onChange({ ...content, pairs: content.pairs.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-gray-500 uppercase">{t('learning_field_pair_left')} / {t('learning_field_pair_right')}</label>
        {content.pairs.length < 5 && (
          <button
            type="button"
            onClick={addPair}
            className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-3 h-3" />
            {t('learning_field_add_pair')}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {content.pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={pair.left}
              onChange={(e) => updatePair(i, 'left', e.target.value)}
              placeholder={t('learning_field_pair_left')}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <span className="text-gray-300 text-xs">&rarr;</span>
            <input
              type="text"
              value={pair.right}
              onChange={(e) => updatePair(i, 'right', e.target.value)}
              placeholder={t('learning_field_pair_right')}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            {content.pairs.length > 3 && (
              <button type="button" onClick={() => removePair(i)} className="p-1 text-red-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderSequenceFields({ content, onChange, t }: { content: OrderSequenceContent; onChange: (c: OrderSequenceContent) => void; t: TFn }) {
  const updateStep = (i: number, value: string) => {
    const steps = content.steps.map((s, idx) => (idx === i ? value : s));
    onChange({ ...content, steps });
  };

  const addStep = () => {
    if (content.steps.length >= 6) return;
    onChange({ ...content, steps: [...content.steps, ''] });
  };

  const removeStep = (i: number) => {
    if (content.steps.length <= 3) return;
    onChange({ ...content, steps: content.steps.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-gray-500 uppercase">{t('learning_field_step')}</label>
        {content.steps.length < 6 && (
          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-3 h-3" />
            {t('learning_field_add_step')}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {content.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 w-5 text-center">{i + 1}</span>
            <input
              type="text"
              value={step}
              onChange={(e) => updateStep(i, e.target.value)}
              placeholder={`${t('learning_field_step')} ${i + 1}`}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            {content.steps.length > 3 && (
              <button type="button" onClick={() => removeStep(i)} className="p-1 text-red-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
