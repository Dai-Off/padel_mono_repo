import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { learningContentService } from '../../../services/learningContent';
import type { Course } from '../../../types/learningContent';

interface Props {
  mode: 'create' | 'edit';
  course?: Course;
  clubId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CourseFormModal({ mode, course, clubId, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(course?.title ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const [eloMin, setEloMin] = useState(course?.elo_min ?? 0);
  const [eloMax, setEloMax] = useState(course?.elo_max ?? 7);
  const [pedagogicalGoal, setPedagogicalGoal] = useState(course?.pedagogical_goal ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error(t('learning_field_title'));
    if (eloMin > eloMax) return toast.error('ELO min > max');

    setSaving(true);
    try {
      const body = {
        club_id: clubId,
        title: title.trim(),
        description: description.trim() || null,
        elo_min: eloMin,
        elo_max: eloMax,
        pedagogical_goal: pedagogicalGoal.trim() || null,
      };

      if (mode === 'create') {
        await learningContentService.createCourse(body);
      } else if (course) {
        await learningContentService.updateCourse(course.id, body);
      }
      toast.success(t('learning_save_success'));
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    } finally {
      setSaving(false);
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
            {mode === 'create' ? t('learning_add_course') : t('learning_edit_course')}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Título */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Rango ELO */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_elo_min')}</label>
              <select
                value={eloMin}
                onChange={(e) => setEloMin(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_elo_max')}</label>
              <select
                value={eloMax}
                onChange={(e) => setEloMax(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Objetivo pedagógico */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_pedagogical_goal')}</label>
            <textarea
              value={pedagogicalGoal}
              onChange={(e) => setPedagogicalGoal(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
            />
          </div>

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
              disabled={saving}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#E31E24] hover:opacity-90 transition-all disabled:opacity-50"
            >
              {saving ? '...' : t('save')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
