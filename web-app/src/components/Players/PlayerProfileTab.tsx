import { useCallback, useEffect, useState } from 'react';
import { Loader2, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { authService } from '../../services/auth';
import { playerService } from '../../services/player';
import { PageSpinner } from '../Layout/PageSpinner';

export function PlayerProfileTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [noPlayer, setNoPlayer] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNoPlayer(false);
    try {
      const me = await authService.getMe();
      if (!me.ok || !me.roles?.player_id) {
        setNoPlayer(true);
        return;
      }
      const p = await playerService.getMyProfile();
      setForm({
        first_name: p.first_name ?? '',
        last_name: p.last_name ?? '',
        phone: (p.phone ?? '').trim(),
      });
      setAvatarUrl(p.avatar_url ?? null);
    } catch {
      setNoPlayer(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const first = form.first_name.trim();
    const last = form.last_name.trim();
    const phone = form.phone.trim();
    if (!first || !last || phone.length < 5) {
      toast.error(t('player_profile_required'));
      return;
    }
    setSaving(true);
    try {
      const updated = await playerService.updateMyProfile({ first_name: first, last_name: last, phone });
      setForm({
        first_name: updated.first_name ?? first,
        last_name: updated.last_name ?? last,
        phone: (updated.phone ?? phone).trim(),
      });
      toast.success(t('player_profile_saved'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('error_occurred');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const p = await playerService.uploadMyAvatar(file);
      setAvatarUrl(p.avatar_url ?? null);
      toast.success(t('player_profile_avatar_ok'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('error_occurred'));
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <PageSpinner />;

  if (noPlayer) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <div className="flex items-center gap-2 font-bold text-amber-950 mb-2">
          <User className="w-5 h-5" />
          {t('player_profile_no_player_title')}
        </div>
        <p className="text-amber-900/90 leading-relaxed">{t('player_profile_no_player_body')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">{t('player_profile_title')}</h2>
        <p className="text-xs text-gray-500 mt-1">{t('player_profile_subtitle')}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-2xl bg-[#1A1A1A] overflow-hidden flex items-center justify-center text-white text-xl font-bold shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span>
              {(form.first_name[0] || '?').toUpperCase()}
              {(form.last_name[0] || '').toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <label className="block">
            <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">{t('player_profile_photo')}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="mt-1 block w-full text-xs text-gray-600"
              disabled={uploading}
              onChange={handleAvatar}
            />
          </label>
          {uploading && (
            <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('player_profile_uploading')}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-700">{t('player_profile_first')}</label>
          <input
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={form.first_name}
            onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
            required
            maxLength={80}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-700">{t('player_profile_last')}</label>
          <input
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={form.last_name}
            onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
            required
            maxLength={80}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-700">
            {t('player_profile_phone')} <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            required
            minLength={5}
            maxLength={40}
            placeholder={t('player_profile_phone_ph')}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-[#E31E24] text-white text-sm font-bold hover:opacity-95 disabled:opacity-50"
        >
          {saving ? t('player_profile_saving') : t('player_profile_save')}
        </button>
      </form>
    </div>
  );
}
