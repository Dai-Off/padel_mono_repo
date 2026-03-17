import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Loader2, Save, Building2, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { authService } from '../../services/auth';
import { clubService, type Club } from '../../services/club';

function InputField({
    label,
    value,
    onChange,
    type = 'text',
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
    placeholder?: string;
}) {
    return (
        <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#E31E24]/30 focus:border-[#E31E24]/30 text-sm text-[#1A1A1A]"
            />
        </div>
    );
}

type Status = 'loading' | 'no_club' | 'ready';

export function ClubSettingsTab() {
    const { t, i18n } = useTranslation();
    const [status, setStatus] = useState<Status>('loading');
    const [saving, setSaving] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [clubs, setClubs] = useState<Club[]>([]);
    const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
    const [form, setForm] = useState({
        name: '',
        address: '',
        city: '',
        postal_code: '',
        description: '',
        logo_url: '',
    });

    const selectedClub = selectedClubId ? clubs.find((c) => c.id === selectedClubId) ?? null : null;
    const skipNextSwitchEffect = useRef(true);

    const loadClubIntoForm = useCallback((club: Club) => {
        setForm({
            name: club.name ?? '',
            address: club.address ?? '',
            city: club.city ?? '',
            postal_code: club.postal_code ?? '',
            description: club.description ?? '',
            logo_url: club.logo_url ?? '',
        });
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setStatus('loading');
            try {
                const me = await authService.getMe();
                if (cancelled) return;
                const admin = me.ok && !!me.roles?.admin_id;
                const ownerId = me.ok && me.roles?.club_owner_id ? me.roles.club_owner_id : null;

                let list: Club[] = [];
                if (admin) {
                    list = (await clubService.getAll()) ?? [];
                } else if (ownerId) {
                    list = (await clubService.getAll(ownerId)) ?? [];
                }
                if (cancelled) return;

                setIsAdmin(admin);
                setClubs(Array.isArray(list) ? list : []);
                const first = Array.isArray(list) && list.length > 0 ? list[0] : null;
                if (first) {
                    setSelectedClubId(first.id);
                    loadClubIntoForm(first);
                    setStatus('ready');
                } else {
                    setStatus('no_club');
                }
            } catch {
                if (!cancelled) {
                    toast.error(t('fetch_error'));
                    setStatus('no_club');
                }
            }
        })();
        return () => { cancelled = true; };
    }, [t, loadClubIntoForm]);

    useEffect(() => {
        if (!selectedClubId || !selectedClub) return;
        if (skipNextSwitchEffect.current) {
            skipNextSwitchEffect.current = false;
            return;
        }
        loadClubIntoForm(selectedClub);
    }, [selectedClubId, selectedClub, loadClubIntoForm]);

    const handleLanguageChange = (lng: string) => {
        i18n.changeLanguage(lng);
        try {
            localStorage.setItem('courthub-language', lng);
        } catch {}
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClub) return;
        setSaving(true);
        try {
            await clubService.update(selectedClub.id, form);
            setClubs((prev) => prev.map((c) => (c.id === selectedClub.id ? { ...c, ...form } : c)));
            toast.success(t('save_success'));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t('error_saving'));
        } finally {
            setSaving(false);
        }
    };

    const showPanel = isAdmin && clubs.length >= 1;

    if (status === 'loading') {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-10 h-10 text-[#E31E24] animate-spin" />
                <p className="text-sm text-gray-500">{t('loading')}</p>
            </div>
        );
    }

    if (status === 'no_club') {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl border border-gray-100 bg-white p-8 text-center"
            >
                <p className="text-sm text-gray-500">{t('not_found')}</p>
            </motion.div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-6">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`space-y-5 ${showPanel ? 'lg:flex-1 min-w-0' : 'w-full'}`}
            >
            <h2 className="text-sm font-bold text-[#1A1A1A]">{t('club_settings_title')}</h2>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-xl bg-[#5B8DEE]/10 flex items-center justify-center">
                        <span className="text-sm">🌐</span>
                    </div>
                    <h3 className="text-xs font-bold text-[#1A1A1A]">{t('club_settings_language')}</h3>
                </div>
                <select
                    value={i18n.language}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#E31E24]/30 text-sm text-[#1A1A1A]"
                >
                    <option value="es">🇪🇸 Español</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="zh">🇨🇳 中文</option>
                </select>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-xl bg-[#E31E24]/10 flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-[#E31E24]" />
                        </div>
                        <h3 className="text-xs font-bold text-[#1A1A1A]">{t('club_settings_info')}</h3>
                    </div>
                    <div className="space-y-4">
                        <InputField
                            label={t('club_name')}
                            value={form.name}
                            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                            placeholder="Ej: Padel Club Madrid"
                        />
                        <InputField
                            label={t('address')}
                            value={form.address}
                            onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                            placeholder="Calle Deportiva 123"
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InputField
                                label={t('city')}
                                value={form.city}
                                onChange={(v) => setForm((f) => ({ ...f, city: v }))}
                                placeholder="Madrid"
                            />
                            <InputField
                                label={t('postal_code')}
                                value={form.postal_code}
                                onChange={(v) => setForm((f) => ({ ...f, postal_code: v }))}
                                placeholder="28001"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                                {t('club_settings_description')}
                            </label>
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder={t('club_settings_description_placeholder')}
                                rows={3}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#E31E24]/30 text-sm text-[#1A1A1A] resize-none"
                            />
                        </div>
                        <InputField
                            label="Logo URL"
                            value={form.logo_url}
                            onChange={(v) => setForm((f) => ({ ...f, logo_url: v }))}
                            placeholder="https://..."
                        />
                    </div>
                </div>

                <motion.button
                    type="submit"
                    disabled={saving}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl bg-[#E31E24] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70"
                >
                    {saving ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</>
                    ) : (
                        <><Save className="w-4 h-4" /> {t('club_settings_save')}</>
                    )}
                </motion.button>
            </form>
            </motion.div>

            {showPanel && (
                <motion.aside
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="w-full lg:w-72 flex-shrink-0"
                >
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 sticky top-4">
                        <h3 className="text-xs font-bold text-[#1A1A1A] mb-3 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            {t('club_settings_switch_club')}
                        </h3>
                        <div className="space-y-1">
                            {clubs.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setSelectedClubId(c.id)}
                                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-sm transition-all ${
                                        selectedClubId === c.id
                                            ? 'bg-[#1A1A1A] text-white'
                                            : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
                                    }`}
                                >
                                    <span className="font-semibold truncate">{c.name}</span>
                                    {selectedClubId === c.id && <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.aside>
            )}
        </div>
    );
}
