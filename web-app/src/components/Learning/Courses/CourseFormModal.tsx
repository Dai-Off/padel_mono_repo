import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { learningContentService } from '../../../services/learningContent';
import { clubStaffService } from '../../../services/clubStaff';
import type { Course } from '../../../types/learningContent';
import type { ClubStaffMember } from '../../../types/clubStaff';

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
  const [uploading, setUploading] = useState(false);
  const [staff, setStaff] = useState<ClubStaffMember[]>([]);

  const [title, setTitle] = useState(course?.title ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const [eloMin, setEloMin] = useState(course?.elo_min ?? 0);
  const [eloMax, setEloMax] = useState(course?.elo_max ?? 7);
  const [pedagogicalGoal, setPedagogicalGoal] = useState(course?.pedagogical_goal ?? '');
  const [staffId, setStaffId] = useState(course?.staff_id ?? '');
  const [bannerUrl, setBannerUrl] = useState(course?.banner_url ?? '');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Cargar staff del club
  useEffect(() => {
    clubStaffService.list(clubId).then((list) => {
      setStaff(list.filter((s) => s.status === 'active'));
    }).catch(() => {});
  }, [clubId]);

  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size / (1024 * 1024) > 5) {
      toast.error(t('learning_banner_too_large'));
      return;
    }
    setBannerFile(file);
    setBannerUrl(URL.createObjectURL(file));
  };

  const handleBannerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size / (1024 * 1024) > 5) {
        toast.error(t('learning_banner_too_large'));
        return;
      }
      setBannerFile(file);
      setBannerUrl(URL.createObjectURL(file));
    }
  };

  const removeBanner = () => {
    setBannerFile(null);
    setBannerUrl('');
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error(t('learning_field_title'));
    if (eloMin > eloMax) return toast.error(t('learning_field_elo_min') + ' > ' + t('learning_field_elo_max'));
    if (eloMax - eloMin > 3) return toast.error(t('learning_level_range_max'));

    setSaving(true);
    try {
      let finalBannerUrl = bannerUrl;
      if (bannerFile) {
        setUploading(true);
        finalBannerUrl = await learningContentService.uploadCourseBanner(clubId, bannerFile);
        setUploading(false);
      }

      const body = {
        club_id: clubId,
        title: title.trim(),
        description: description.trim() || null,
        banner_url: finalBannerUrl || null,
        elo_min: eloMin,
        elo_max: eloMax,
        pedagogical_goal: pedagogicalGoal.trim() || null,
        staff_id: staffId || null,
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

          {/* Banner */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
              {t('learning_field_banner')}
              <span className="text-gray-300 font-normal ml-1">(máx 5MB)</span>
            </label>
            {bannerUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200">
                <img
                  src={bannerUrl}
                  alt="Banner"
                  className="w-full h-28 object-cover"
                />
                <button
                  type="button"
                  onClick={removeBanner}
                  className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-lg text-red-400 hover:text-red-600 shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
                onDrop={handleBannerDrop}
                onClick={() => bannerInputRef.current?.click()}
                className={`w-full flex items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed text-xs font-bold cursor-pointer transition-all ${
                  dragging
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-500'
                    : 'border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-500'
                }`}
              >
                <Upload className="w-4 h-4" />
                {t('learning_banner_dropzone')}
              </div>
            )}
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              onChange={handleBannerSelect}
              className="hidden"
            />
          </div>

          {/* Coach */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_coach')}</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">{t('learning_field_coach_none')}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.role ? ` — ${s.role}` : ''}</option>
              ))}
            </select>
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

          {/* Rango de nivel */}
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_elo_min')}</label>
                <input
                  type="number"
                  min={0}
                  max={7}
                  step={0.5}
                  value={eloMin}
                  onChange={(e) => {
                    const val = Math.round(Number(e.target.value) * 2) / 2;
                    setEloMin(Math.max(0, Math.min(7, val)));
                  }}
                  className={`w-full rounded-xl border px-3 py-2 text-sm ${eloMax - eloMin > 3 || eloMin > eloMax ? 'border-red-300' : 'border-gray-200'}`}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_elo_max')}</label>
                <input
                  type="number"
                  min={0}
                  max={7}
                  step={0.5}
                  value={eloMax}
                  onChange={(e) => {
                    const val = Math.round(Number(e.target.value) * 2) / 2;
                    setEloMax(Math.max(0, Math.min(7, val)));
                  }}
                  className={`w-full rounded-xl border px-3 py-2 text-sm ${eloMax - eloMin > 3 || eloMin > eloMax ? 'border-red-300' : 'border-gray-200'}`}
                />
              </div>
            </div>
            {eloMin > eloMax && (
              <p className="text-[10px] text-red-500">{t('learning_field_elo_min')} {'>'} {t('learning_field_elo_max')}</p>
            )}
            {eloMax - eloMin > 3 && eloMin <= eloMax && (
              <p className="text-[10px] text-red-500">{t('learning_level_range_max')}</p>
            )}
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
              disabled={saving || uploading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#E31E24] hover:opacity-90 transition-all disabled:opacity-50"
            >
              {uploading ? `${t('learning_field_banner')}...` : saving ? '...' : t('save')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
