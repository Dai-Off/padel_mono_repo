import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, Video, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { learningContentService, validateVideo, VIDEO_LIMITS } from '../../../services/learningContent';
import type { CourseLesson } from '../../../types/learningContent';

interface Props {
  mode: 'create' | 'edit';
  lesson?: CourseLesson;
  courseId: string;
  clubId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function LessonFormModal({ mode, lesson, courseId, clubId, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState(lesson?.title ?? '');
  const [description, setDescription] = useState(lesson?.description ?? '');
  const [durationMin, setDurationMin] = useState(
    lesson?.duration_seconds ? Math.round(lesson.duration_seconds / 60) : 0,
  );
  const [videoUrl, setVideoUrl] = useState(lesson?.video_url ?? '');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);

  const processVideoFile = async (file: File) => {
    setValidating(true);
    try {
      await validateVideo(file, VIDEO_LIMITS.course);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error(t('learning_field_title'));

    setSaving(true);
    try {
      let finalVideoUrl = videoUrl;
      if (videoFile) {
        setUploading(true);
        finalVideoUrl = await learningContentService.uploadCourseVideo(clubId, courseId, videoFile);
        setUploading(false);
      }

      const body = {
        title: title.trim(),
        description: description.trim() || null,
        video_url: finalVideoUrl || null,
        duration_seconds: durationMin > 0 ? durationMin * 60 : null,
      };

      if (mode === 'create') {
        await learningContentService.addLesson(courseId, body);
      } else if (lesson) {
        await learningContentService.updateLesson(courseId, lesson.id, body);
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
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center overflow-y-auto py-20 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-md shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-sm font-bold text-[#1A1A1A]">
            {mode === 'create' ? t('learning_add_lesson') : t('learning_edit_lesson')}
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

          {/* Duración */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_duration')}</label>
            <input
              type="number"
              min={0}
              step={1}
              value={durationMin}
              onChange={(e) => setDurationMin(Math.max(0, Math.round(Number(e.target.value))))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          {/* Video upload */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
              {t('learning_field_video')}
              <span className="text-gray-300 font-normal ml-1">
                (máx {VIDEO_LIMITS.course.maxSizeMB}MB, {Math.floor(VIDEO_LIMITS.course.maxDurationSec / 60)} min)
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
                <button type="button" onClick={removeVideo} className="p-1 text-red-400 hover:text-red-600">
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
