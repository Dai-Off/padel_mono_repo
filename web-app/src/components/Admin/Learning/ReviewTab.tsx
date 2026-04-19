import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { adminLearningService } from '../../../services/adminLearning';
import { ReviewDetailModal } from './ReviewDetailModal';
import type { AdminCourse } from '../../../types/adminLearning';

interface Props {
  onPendingCountChange: (count: number) => void;
}

export function ReviewTab({ onPendingCountChange }: Props) {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminCourse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminLearningService.getPendingCourses();
      setCourses(list);
      onPendingCountChange(list.length);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => { load(); }, [load]);

  const handleActionDone = () => {
    setSelected(null);
    load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (courses.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">{t('admin_learning_no_pending')}</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course, i) => (
          <motion.button
            key={course.id}
            type="button"
            onClick={() => setSelected(course)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="bg-white rounded-2xl border border-gray-100 p-4 text-left space-y-3 hover:border-gray-200 transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
                <h3 className="text-xs font-bold text-[#1A1A1A] truncate">{course.title}</h3>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0">
                {t('learning_status_pending_review')}
              </span>
            </div>

            <p className="text-[10px] text-gray-500">{course.club_name}</p>

            <div className="flex items-center gap-3 text-[10px] text-gray-400">
              <span>{course.lesson_count} {course.lesson_count === 1 ? t('learning_lessons_count').replace('{{count}}', '1') : t('learning_lessons_count_plural').replace('{{count}}', String(course.lesson_count))}</span>
              <span>Nv. {course.elo_min}–{course.elo_max}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(course.updated_at).toLocaleDateString()}
              </span>
            </div>
          </motion.button>
        ))}
      </div>

      {selected && (
        <ReviewDetailModal
          course={selected}
          onClose={() => setSelected(null)}
          onActionDone={handleActionDone}
        />
      )}
    </>
  );
}
