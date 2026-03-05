import { useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, ArrowRight, X, User, Building2, MapPin, Phone, Mail,
    Hash, ChevronDown, Globe, CheckCircle2, Trophy, Clock, CreditCard,
    Shield, Camera, Upload, Sun, Moon, Zap, FileText, Sparkles,
    Check, Circle, Loader2, Eye
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { submitClubApplication, uploadClubApplicationImage, type ClubApplicationPayload } from '../../services/clubApplication';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s+()-]{8,20}$/;

function validateLead(data: LeadFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.firstName?.trim() || data.firstName.trim().length < 2) errors.push('Nombre (mín. 2 caracteres)');
  if (!data.lastName?.trim() || data.lastName.trim().length < 2) errors.push('Apellidos (mín. 2 caracteres)');
  if (!data.clubName?.trim() || data.clubName.trim().length < 2) errors.push('Nombre del club (mín. 2 caracteres)');
  if (!data.city?.trim() || data.city.trim().length < 2) errors.push('Ciudad (mín. 2 caracteres)');
  if (!data.country?.trim() || data.country.trim().length < 2) errors.push('País obligatorio');
  if (!data.phone?.trim()) errors.push('Teléfono obligatorio');
  else if (!PHONE_REGEX.test(data.phone.replace(/\s/g, ''))) errors.push('Teléfono no válido');
  if (!data.email?.trim()) errors.push('Email obligatorio');
  else if (!EMAIL_REGEX.test(data.email.trim())) errors.push('Email no válido');
  const num = parseInt(data.numCourts, 10);
  if (!data.numCourts || isNaN(num) || num < 1 || num > 99) errors.push('Número de pistas (1-99)');
  if (!data.sports?.length) errors.push('Selecciona al menos un deporte');
  return { valid: errors.length === 0, errors };
}

const COUNTRIES = ['España', 'México', 'Argentina', 'Chile', 'Colombia', 'Perú', 'Ecuador', 'Uruguay', 'Portugal', 'Italia', 'Francia', 'Alemania', 'Reino Unido', 'Suecia', 'Países Bajos', 'EAU', 'Qatar', 'Otro'];
const SPORTS = ['Padel', 'Tenis', 'Pickleball', 'Squash', 'Badminton'];
const HERO_IMG = 'https://images.unsplash.com/photo-1643026548555-2f7adf8ec678?w=1080&q=80';

const inputBase = 'bg-white/[0.05] border-none rounded-lg text-[13px] text-white placeholder-white/15 focus:bg-white/[0.08] focus:ring-1 focus:ring-white/[0.08] transition-all outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield]';
const labelBase = 'block text-[10px] font-semibold text-white/25 uppercase tracking-[0.1em] mb-1.5';

function DarkInput({
    label,
    icon: Icon,
    value,
    onChange,
    placeholder,
    type = 'text',
    required = true,
    id,
}: {
    label: string;
    icon?: React.ElementType;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    type?: string;
    required?: boolean;
    id?: string;
}) {
    return (
        <div>
            <label className={labelBase} htmlFor={id}>{label}{required && <span className="text-[#E31E24]/60"> *</span>}</label>
            <div className="relative group">
                {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/12 group-focus-within:text-white/30 transition-colors" />}
                <input
                    id={id}
                    type={type}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={`w-full ${Icon ? 'pl-9' : 'pl-3.5'} pr-3.5 py-2.5 min-h-[44px] ${inputBase}`}
                />
            </div>
        </div>
    );
}

function DarkSelect({
    label,
    icon: Icon,
    value,
    onChange,
    options,
    placeholder,
    id,
}: {
    label: string;
    icon?: React.ElementType;
    value: string;
    onChange: (v: string) => void;
    options: string[];
    placeholder: string;
    id?: string;
}) {
    return (
        <div>
            <label className={labelBase} htmlFor={id}>{label}<span className="text-[#E31E24]/60"> *</span></label>
            <div className="relative group">
                {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/12 group-focus-within:text-white/30 transition-colors" />}
                <select
                    id={id}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className={`w-full ${Icon ? 'pl-9' : 'pl-3.5'} pr-8 py-2.5 min-h-[44px] appearance-none ${inputBase}`}
                >
                    <option value="" className="bg-[#1A1A1A]">{placeholder}</option>
                    {options.map(o => <option key={o} value={o} className="bg-[#1A1A1A]">{o}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/12 pointer-events-none" />
            </div>
        </div>
    );
}

function ImageUploadSlot({ label, url, onUpload }: { label: string; url: string | null | undefined; onUpload: (file: File) => Promise<void> }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
            setError('Solo JPEG, PNG, WebP o GIF');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError('Máx. 5 MB');
            return;
        }
        setError(null);
        setLoading(true);
        try {
            await onUpload(file);
        } catch {
            setError('Error al subir');
        } finally {
            setLoading(false);
            e.target.value = '';
        }
    };
    return (
        <label className="aspect-square min-h-[72px] sm:min-h-0 rounded-lg bg-white/[0.04] flex flex-col items-center justify-center gap-1 text-white/12 hover:bg-white/[0.07] hover:text-white/25 active:bg-white/[0.06] transition-all touch-manipulation cursor-pointer overflow-hidden relative">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" ref={inputRef} onChange={handleChange} disabled={loading} />
            {url ? (
                <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : loading ? (
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-white/40" />
            ) : (
                <>
                    {label === 'Logo' ? <Camera className="w-4 h-4 sm:w-5 sm:h-5" /> : <Upload className="w-4 h-4 sm:w-5 sm:h-5" />}
                    <span className="text-[7px] sm:text-[8px] font-semibold relative z-10">{label}</span>
                </>
            )}
            {error && <span className="absolute bottom-0 left-0 right-0 text-[8px] text-red-400 bg-black/60 py-0.5">{error}</span>}
        </label>
    );
}

function StepBar({ currentStep }: { currentStep: number }) {
    return (
        <div className="flex items-center gap-1.5 w-full">
            {[0, 1, 2].map(i => (
                <div key={i} className="flex-1">
                    <div className={`h-[2px] rounded-full transition-all duration-500 ${
                        i < currentStep ? 'bg-white/50' : i === currentStep ? 'bg-white/20' : 'bg-white/[0.05]'
                    }`} />
                </div>
            ))}
        </div>
    );
}

interface LeadFormData {
    firstName: string;
    lastName: string;
    clubName: string;
    city: string;
    country: string;
    phone: string;
    email: string;
    numCourts: string;
    sports: string[];
}

interface CourtConfig {
    id: string;
    name: string;
    type: 'cristal' | 'muro' | 'quick' | 'clay' | 'hard';
    covered: boolean;
    lighting: boolean;
    sport: string;
}

interface ManagerFormData {
    officialName: string;
    fullAddress: string;
    description: string;
    logo: string | null;
    photos: string[];
    courts: CourtConfig[];
    openTime: string;
    closeTime: string;
    slotDuration: '60' | '90' | '120';
    pricing: { label: string; price: string }[];
    bookingWindow: string;
    cancellationPolicy: string;
    taxId: string;
    fiscalAddress: string;
    stripeConnected: boolean;
}

type Plan = 'standard' | 'professional' | 'champion' | 'master';

interface ActivationData {
    selectedPlan: Plan | null;
    stripeVerified: boolean;
    inventoryReady: boolean;
    supportReview: 'pending' | 'in_review' | 'approved';
}

const COURT_TYPES: { id: CourtConfig['type']; label: string; sports: string[] }[] = [
    { id: 'cristal', label: 'Cristal', sports: ['Padel'] },
    { id: 'muro', label: 'Muro', sports: ['Padel'] },
    { id: 'quick', label: 'Pista rápida', sports: ['Tenis', 'Pickleball'] },
    { id: 'clay', label: 'Tierra batida', sports: ['Tenis'] },
    { id: 'hard', label: 'Dura', sports: ['Tenis', 'Pickleball'] },
];

const PLANS: { id: Plan; name: string; price: string; priceNote?: string; features: string[]; support: string; popular: boolean; accent: string }[] = [
    { id: 'standard', name: 'Standard', price: '38', features: ['Gestión de reservas', 'Chat con jugadores', 'Informes básicos', 'Partidos abiertos', 'Pagos online'], support: '48h', popular: false, accent: '#6B7280' },
    { id: 'professional', name: 'Professional', price: '88', features: ['Todo lo de Standard', 'Sistema POS (TPV)', 'Monedero de club', 'Categorías de usuario', 'Visualización avanzada de pistas'], support: '8h', popular: false, accent: '#3B82F6' },
    { id: 'champion', name: 'Champion', price: '', priceNote: 'Consultar', features: ['Todo lo de Professional', 'Gestión de academias', 'Cursos y clases', 'Membresías y ligas', 'Facturación', 'Campañas de marketing'], support: '4h', popular: true, accent: '#F59E0B' },
    { id: 'master', name: 'Master', price: '276', features: ['Todo lo de Champion', 'Integraciones API', 'Gestión multi-entidad', 'Prioridad máxima'], support: 'Prioritario', popular: false, accent: '#8B5CF6' },
];

const DEFAULT_PRICING = [
    { label: 'Mañana (8-14h)', price: '22' },
    { label: 'Tarde (14-18h)', price: '28' },
    { label: 'Prime (18-21h)', price: '36' },
    { label: 'Noche (21-23h)', price: '30' },
];

function LeadPhase({
    data,
    onChange,
    onNext,
    t,
}: {
    data: LeadFormData;
    onChange: (d: LeadFormData) => void;
    onNext: () => void;
    t: (k: string) => string;
}) {
    const [hasTriedNext, setHasTriedNext] = useState(false);
    const { valid: isValid, errors } = validateLead(data);
    const toggleSport = (s: string) => onChange({
        ...data,
        sports: data.sports.includes(s) ? data.sports.filter(x => x !== s) : [...data.sports, s],
    });

    const handleNext = () => {
        if (isValid) onNext();
        else setHasTriedNext(true);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="space-y-4"
        >
            <div className="relative -mx-5 sm:-mx-5 -mt-2 h-28 sm:h-32 overflow-hidden">
                <img src={HERO_IMG} alt="" className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-[#111]/80 to-transparent" />
                <div className="absolute bottom-2 sm:bottom-3 left-4 right-4 sm:left-5 sm:right-5">
                    <span className="text-[8px] font-bold text-[#E31E24]/80 uppercase tracking-[0.15em]">{t('registration_new_club')}</span>
                    <h2 className="text-base sm:text-lg font-black text-white leading-tight mt-0.5">{t('registration_form_title')}</h2>
                    <p className="text-[10px] text-white/30 mt-0.5">{t('registration_advisor_24h')}</p>
                </div>
            </div>

            <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <DarkInput label={t('registration_first_name')} icon={User} value={data.firstName} onChange={v => onChange({ ...data, firstName: v })} placeholder={t('registration_first_name_placeholder')} id="reg-first" />
                    <DarkInput label={t('registration_last_name')} icon={User} value={data.lastName} onChange={v => onChange({ ...data, lastName: v })} placeholder={t('registration_last_name_placeholder')} id="reg-last" />
                </div>
                <DarkInput label={t('club_name')} icon={Building2} value={data.clubName} onChange={v => onChange({ ...data, clubName: v })} placeholder={t('registration_club_name_placeholder')} id="reg-club" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <DarkInput label={t('city')} icon={MapPin} value={data.city} onChange={v => onChange({ ...data, city: v })} placeholder={t('registration_city_placeholder')} id="reg-city" />
                    <DarkSelect label={t('registration_country')} icon={Globe} value={data.country} onChange={v => onChange({ ...data, country: v })} options={COUNTRIES} placeholder={t('select_option')} id="reg-country" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <DarkInput label={t('phone')} icon={Phone} value={data.phone} onChange={v => onChange({ ...data, phone: v })} placeholder={t('registration_phone_placeholder')} type="tel" id="reg-phone" />
                    <DarkInput label={t('registration_email_corporate')} icon={Mail} value={data.email} onChange={v => onChange({ ...data, email: v })} placeholder={t('email_placeholder')} type="email" id="reg-email" />
                </div>
                <DarkInput label={t('registration_court_count')} icon={Hash} value={data.numCourts} onChange={v => onChange({ ...data, numCourts: v })} placeholder="8" type="number" id="reg-courts" />
                {hasTriedNext && errors.length > 0 && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5">
                        <p className="text-[10px] font-semibold text-red-400/90 mb-1">{t('validation_fix_errors')}</p>
                        <ul className="text-[9px] text-red-300/80 list-disc list-inside space-y-0.5">
                            {errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    </div>
                )}
                <div>
                    <label className={labelBase}>{t('registration_sport')} <span className="text-[#E31E24]/60">*</span></label>
                    <div className="flex flex-wrap gap-2">
                        {SPORTS.map(s => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => toggleSport(s)}
                                className={`min-h-[44px] min-w-[44px] px-3 py-2 rounded-full text-[10px] font-semibold transition-all touch-manipulation ${
                                    data.sports.includes(s) ? 'bg-[#E31E24] text-white' : 'bg-white/[0.05] text-white/25 hover:text-white/40 active:bg-white/10'
                                }`}
                                aria-pressed={data.sports.includes(s)}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <motion.button
                type="button"
                onClick={handleNext}
                whileTap={isValid ? { scale: 0.98 } : {}}
                className={`w-full min-h-[48px] py-3 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-all touch-manipulation ${
                    isValid ? 'text-white' : 'bg-white/[0.04] text-white/15 cursor-pointer'
                }`}
                style={isValid ? { background: 'linear-gradient(135deg, #E31E24 0%, #B91C1C 100%)' } : {}}
            >
                {t('registration_next')} <ArrowRight className="w-3.5 h-3.5" />
            </motion.button>
            <p className="text-[8px] text-white/15 text-center">{t('registration_terms_footer')}</p>
        </motion.div>
    );
}

type ManagerSubStep = 'general' | 'courts' | 'schedule' | 'policies' | 'billing';
const MANAGER_SUBSTEPS: { id: ManagerSubStep; label: string; icon: React.ElementType }[] = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'courts', label: 'Pistas', icon: Trophy },
    { id: 'schedule', label: 'Horarios', icon: Clock },
    { id: 'policies', label: 'Políticas', icon: Shield },
    { id: 'billing', label: 'Pagos', icon: CreditCard },
];

function ManagerPhase({
    data,
    onChange,
    onNext,
    onBack,
    leadData,
    t,
}: {
    data: ManagerFormData;
    onChange: (d: ManagerFormData) => void;
    onNext: () => void;
    onBack: () => void;
    leadData: LeadFormData;
    t: (k: string) => string;
}) {
    const [subStep, setSubStep] = useState<ManagerSubStep>('general');
    const currentIdx = MANAGER_SUBSTEPS.findIndex(s => s.id === subStep);
    const nextSub = () => {
        if (currentIdx < 4) setSubStep(MANAGER_SUBSTEPS[currentIdx + 1].id);
        else {
            if (data.courts.length === 0) {
                toast.error(t('validation_at_least_one_court'));
                return;
            }
            onNext();
        }
    };
    const prevSub = () => { if (currentIdx > 0) setSubStep(MANAGER_SUBSTEPS[currentIdx - 1].id); else onBack(); };
    const addCourt = () => onChange({ ...data, courts: [...data.courts, { id: `c-${Date.now()}`, name: `Pista ${data.courts.length + 1}`, type: 'cristal', covered: false, lighting: true, sport: leadData.sports[0] || 'Padel' }] });
    const updateCourt = (id: string, u: Partial<CourtConfig>) => onChange({ ...data, courts: data.courts.map(c => c.id === id ? { ...c, ...u } : c) });
    const removeCourt = (id: string) => onChange({ ...data, courts: data.courts.filter(c => c.id !== id) });

    return (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 min-h-[44px] items-center">
                {MANAGER_SUBSTEPS.map((s, i) => {
                    const active = s.id === subStep;
                    const done = i < currentIdx;
                    return (
                        <button key={s.id} type="button" onClick={() => setSubStep(s.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-medium whitespace-nowrap transition-all touch-manipulation flex-shrink-0 ${active ? 'bg-white/10 text-white' : done ? 'text-white/35' : 'text-white/15'}`}>
                            {done ? <Check className="w-2.5 h-2.5" /> : <s.icon className="w-2.5 h-2.5" />}
                            {s.label}
                        </button>
                    );
                })}
            </div>

            <AnimatePresence mode="wait">
                <motion.div key={subStep} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
                    {subStep === 'general' && (
                        <div className="space-y-2.5">
                            <p className="text-[12px] font-bold text-white/50 mb-1">Información general</p>
                            <DarkInput label="Nombre oficial" icon={Building2} value={data.officialName} onChange={v => onChange({ ...data, officialName: v })} placeholder={leadData.clubName || 'Club Deportivo S.L.'} required={false} />
                            <DarkInput label="Dirección completa" icon={MapPin} value={data.fullAddress} onChange={v => onChange({ ...data, fullAddress: v })} placeholder="C/ Ejemplo 123, 28001 Madrid" required={false} />
                            <div>
                                <label className={labelBase}>Descripción</label>
                                <textarea value={data.description} onChange={e => onChange({ ...data, description: e.target.value })} placeholder="Describe tu club..." rows={2}
                                    className={`w-full px-3.5 py-2.5 resize-none ${inputBase}`} />
                            </div>
                            <div>
                                <label className={labelBase}>Logo e imágenes</label>
                                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                    {[
                                        { key: 'logo' as const, label: 'Logo', url: data.logo },
                                        { key: 'photo0', label: 'Foto 1', url: data.photos[0] },
                                        { key: 'photo1', label: 'Foto 2', url: data.photos[1] },
                                    ].map(({ key, label, url }) => (
                                        <ImageUploadSlot
                                            key={key}
                                            label={label}
                                            url={url}
                                            onUpload={async (file) => {
                                                const res = await uploadClubApplicationImage(file);
                                                const uploadedUrl = res.url ?? '';
                                                if (key === 'logo') onChange({ ...data, logo: uploadedUrl || null });
                                                else {
                                                    const next = [...data.photos];
                                                    const idx = key === 'photo0' ? 0 : 1;
                                                    next[idx] = uploadedUrl;
                                                    onChange({ ...data, photos: next });
                                                }
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {subStep === 'courts' && (
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <p className="text-[12px] font-bold text-white/50">Pistas</p>
                                <button type="button" onClick={addCourt} className="flex items-center gap-1 px-3 py-2 rounded-full bg-white/[0.07] text-white/50 text-[9px] font-semibold hover:bg-white/[0.1] active:bg-white/[0.12] transition-all touch-manipulation min-h-[44px]">
                                    <Zap className="w-2.5 h-2.5" /> Añadir
                                </button>
                            </div>
                            {data.courts.length === 0 && (
                                <div className="text-center py-8 rounded-lg bg-white/[0.02]">
                                    <Trophy className="w-5 h-5 mx-auto mb-1.5 text-white/8" />
                                    <p className="text-[10px] text-white/15">Sin pistas. Añade una.</p>
                                </div>
                            )}
                            <div className="space-y-2 min-h-[100px] max-h-[35vh] sm:max-h-[40vh] overflow-y-auto overflow-x-hidden scrollbar-hide">
                                {data.courts.map(court => (
                                    <div key={court.id} className="p-3 rounded-lg bg-white/[0.04] space-y-2">
                                        <div className="flex items-center justify-between">
                                            <input value={court.name} onChange={e => updateCourt(court.id, { name: e.target.value })}
                                                className="text-[12px] font-bold text-white bg-transparent border-none focus:outline-none flex-1" />
                                            <button type="button" onClick={() => removeCourt(court.id)} className="w-5 h-5 rounded flex items-center justify-center text-white/15 hover:text-red-400 transition-colors">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {COURT_TYPES.filter(ct => ct.sports.includes(court.sport)).map(ct => (
                                                <button key={ct.id} type="button" onClick={() => updateCourt(court.id, { type: ct.id })}
                                                    className={`px-2 py-0.5 rounded text-[8px] font-semibold transition-all ${court.type === ct.id ? 'bg-white/10 text-white/70' : 'bg-white/[0.03] text-white/20'}`}>{ct.label}</button>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-3 text-[9px] text-white/25">
                                            {[{ key: 'covered' as const, label: 'Cubierta' }, { key: 'lighting' as const, label: 'Luz' }].map(opt => (
                                                <label key={opt.key} className="flex items-center gap-1 cursor-pointer">
                                                    <div className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center transition-all ${court[opt.key] ? 'bg-white/20' : 'bg-white/[0.06]'}`}>
                                                        {court[opt.key] && <Check className="w-2 h-2 text-white" />}
                                                    </div>
                                                    <input type="checkbox" checked={court[opt.key]} onChange={e => updateCourt(court.id, { [opt.key]: e.target.checked })} className="sr-only" />
                                                    {opt.label}
                                                </label>
                                            ))}
                                            <select value={court.sport} onChange={e => updateCourt(court.id, { sport: e.target.value, type: 'cristal' })}
                                                className="ml-auto text-[9px] bg-white/[0.05] border-none rounded px-1.5 py-0.5 text-white/30 outline-none">
                                                {leadData.sports.map(s => <option key={s} value={s} className="bg-[#1A1A1A]">{s}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {subStep === 'schedule' && (
                        <div className="space-y-2.5">
                            <p className="text-[12px] font-bold text-white/50 mb-1">Horarios y tarifas</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                    <label className={`${labelBase} flex items-center gap-1`}><Sun className="w-2.5 h-2.5" /> Apertura</label>
                                    <input type="time" value={data.openTime} onChange={e => onChange({ ...data, openTime: e.target.value })} className={`w-full px-3 py-2.5 ${inputBase}`} />
                                </div>
                                <div>
                                    <label className={`${labelBase} flex items-center gap-1`}><Moon className="w-2.5 h-2.5" /> Cierre</label>
                                    <input type="time" value={data.closeTime} onChange={e => onChange({ ...data, closeTime: e.target.value })} className={`w-full px-3 py-2.5 ${inputBase}`} />
                                </div>
                            </div>
                            <div>
                                <label className={labelBase}>Duración del turno</label>
                                <div className="flex gap-1.5">
                                    {(['60', '90', '120'] as const).map(d => (
                                        <button key={d} type="button" onClick={() => onChange({ ...data, slotDuration: d })}
                                            className={`flex-1 min-h-[44px] py-2 rounded-lg text-[10px] font-semibold transition-all touch-manipulation ${data.slotDuration === d ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-white/20 active:bg-white/[0.06]'}`}>{d} min</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className={labelBase}>Tarifas por franja</label>
                                <div className="space-y-1">
                                    {data.pricing.map((p, i) => (
                                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03]">
                                            <span className="text-[9px] text-white/20 font-medium flex-1 truncate">{p.label}</span>
                                            <div className="relative w-14">
                                                <input type="number" value={p.price}
                                                    onChange={e => { const np = [...data.pricing]; np[i] = { ...p, price: e.target.value }; onChange({ ...data, pricing: np }); }}
                                                    className="w-full pl-1 pr-4 py-1 bg-white/[0.05] border-none rounded text-[10px] text-right font-bold text-white focus:bg-white/[0.1] outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield]" />
                                                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[7px] text-white/12 font-bold">€</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {subStep === 'policies' && (
                        <div className="space-y-2.5">
                            <p className="text-[12px] font-bold text-white/50 mb-1">Políticas de reserva</p>
                            <DarkSelect label="Ventana de reserva" icon={Clock} value={data.bookingWindow} onChange={v => onChange({ ...data, bookingWindow: v })} options={['7 días', '14 días', '21 días', '30 días', '60 días']} placeholder="Selecciona" />
                            <DarkSelect label="Política de cancelación" icon={Shield} value={data.cancellationPolicy} onChange={v => onChange({ ...data, cancellationPolicy: v })} options={['Sin penalización', '2 horas antes', '6 horas antes', '12 horas antes', '24 horas antes', '48 horas antes']} placeholder="Selecciona" />
                            <div className="p-2.5 rounded-lg bg-white/[0.03] flex items-start gap-2">
                                <Sparkles className="w-3 h-3 text-amber-400/40 mt-0.5 flex-shrink-0" />
                                <p className="text-[9px] text-white/20 leading-relaxed">
                                    <span className="font-semibold text-white/30">Consejo:</span> Cancelación de 12h+ reduce no-shows un 40%.
                                </p>
                            </div>
                        </div>
                    )}

                    {subStep === 'billing' && (
                        <div className="space-y-2.5">
                            <p className="text-[12px] font-bold text-white/50 mb-1">Facturación y pagos</p>
                            <DarkInput label="CIF / NIF" icon={FileText} value={data.taxId} onChange={v => onChange({ ...data, taxId: v })} placeholder="B12345678" required={false} />
                            <DarkInput label="Dirección fiscal" icon={MapPin} value={data.fiscalAddress} onChange={v => onChange({ ...data, fiscalAddress: v })} placeholder="C/ Fiscal 1, 28001 Madrid" required={false} />
                            <div>
                                <label className={labelBase}>Conexión Stripe <span className="text-[#E31E24]/60">*</span></label>
                                <button type="button" onClick={() => onChange({ ...data, stripeConnected: !data.stripeConnected })}
                                    className={`w-full min-h-[48px] p-3 rounded-lg transition-all flex items-center gap-3 touch-manipulation ${data.stripeConnected ? 'bg-emerald-500/[0.07]' : 'bg-white/[0.04] hover:bg-white/[0.06] active:bg-white/[0.08]'}`}>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${data.stripeConnected ? 'bg-emerald-500/12' : 'bg-white/[0.06]'}`}>
                                        {data.stripeConnected ? <CheckCircle2 className="w-4 h-4 text-emerald-400/80" /> : <CreditCard className="w-4 h-4 text-white/15" />}
                                    </div>
                                    <div className="text-left">
                                        <p className={`text-[11px] font-semibold ${data.stripeConnected ? 'text-emerald-300/70' : 'text-white/35'}`}>
                                            {data.stripeConnected ? 'Stripe conectado' : 'Conectar con Stripe'}
                                        </p>
                                        <p className="text-[8px] text-white/12 mt-0.5">{data.stripeConnected ? 'Cuenta verificada' : 'Obligatorio para cobros'}</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <div className="flex gap-2 pt-2 sm:pt-1">
                <button type="button" onClick={prevSub} className="w-12 h-12 sm:w-11 sm:h-11 min-h-[48px] sm:min-h-0 py-2.5 rounded-lg bg-white/[0.05] text-white/25 flex items-center justify-center hover:bg-white/[0.08] active:bg-white/[0.06] transition-all touch-manipulation flex-shrink-0">
                    <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={nextSub} className="flex-1 min-h-[48px] py-2.5 rounded-lg text-white text-[12px] font-semibold flex items-center justify-center gap-1.5 touch-manipulation" style={{ background: 'linear-gradient(135deg, #E31E24, #B91C1C)' }}>
                    {currentIdx < 4 ? t('registration_next') : t('registration_finish')} <ArrowRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </motion.div>
    );
}

function ActivationPhase({
    data,
    onChange,
    onBack,
    onFinish,
    managerData,
    leadData,
    t,
}: {
    data: ActivationData;
    onChange: (d: ActivationData) => void;
    onBack: () => void;
    onFinish: () => void;
    managerData: ManagerFormData;
    leadData: LeadFormData;
    t: (k: string) => string;
}) {
    const [submitting, setSubmitting] = useState(false);
    const checklist = [
        { label: t('activation_plan'), done: !!data.selectedPlan, key: 'plan' },
        { label: t('activation_stripe'), done: data.stripeVerified || managerData.stripeConnected, key: 'stripe' },
        { label: t('activation_inventory'), done: data.inventoryReady || (managerData.courts.length > 0 && managerData.pricing.some(p => Number(p.price) > 0)), key: 'inv' },
        { label: t('activation_support'), done: data.supportReview === 'approved', key: 'support' },
    ];
    const done = checklist.filter(c => c.done).length;
    const allDone = done === checklist.length;
    const handleSubmit = async () => {
        const leadValidation = validateLead(leadData);
        if (!leadValidation.valid) {
            toast.error(t('validation_fix_errors'));
            return;
        }
        setSubmitting(true);
        try {
            const payload: ClubApplicationPayload = {
                responsible_first_name: leadData.firstName.trim(),
                responsible_last_name: leadData.lastName.trim(),
                club_name: leadData.clubName.trim(),
                city: leadData.city.trim(),
                country: leadData.country.trim(),
                phone: leadData.phone.trim(),
                email: leadData.email.trim().toLowerCase(),
                court_count: Math.max(1, Math.min(99, parseInt(leadData.numCourts, 10) || 1)),
                sport: (leadData.sports[0] || 'padel').toLowerCase(),
                sports: leadData.sports.length ? leadData.sports : undefined,
                official_name: managerData.officialName?.trim() || undefined,
                full_address: managerData.fullAddress?.trim() || undefined,
                description: managerData.description?.trim() || undefined,
                logo_url: managerData.logo || undefined,
                photo_urls: managerData.photos.filter(Boolean).length ? managerData.photos : undefined,
                courts: managerData.courts.length ? managerData.courts.map(({ id, name, type, covered, lighting, sport: s }) => ({ id, name, type, covered, lighting, sport: s })) : undefined,
                open_time: managerData.openTime || undefined,
                close_time: managerData.closeTime || undefined,
                slot_duration_min: parseInt(managerData.slotDuration, 10) || undefined,
                pricing: managerData.pricing?.length ? managerData.pricing : undefined,
                booking_window: managerData.bookingWindow?.trim() || undefined,
                cancellation_policy: managerData.cancellationPolicy?.trim() || undefined,
                tax_id: managerData.taxId?.trim() || undefined,
                fiscal_address: managerData.fiscalAddress?.trim() || undefined,
                stripe_connected: managerData.stripeConnected,
                selected_plan: data.selectedPlan || undefined,
            };
            await submitClubApplication(payload);
            onFinish();
        } catch {
            toast.error(t('registration_error'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
            <div className="text-center pt-2">
                <div className="w-11 h-11 mx-auto mb-2 rounded-xl bg-emerald-500/8 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-emerald-400/80" />
                </div>
                <h2 className="text-[15px] font-black text-white">{t('registration_go_live')}</h2>
                <p className="text-[10px] text-white/25 mt-0.5">{t('registration_go_live_desc')}</p>
            </div>

            <div>
                <label className={labelBase}>{t('registration_choose_plan')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-1.5">
                    {PLANS.map(plan => (
                        <button key={plan.id} type="button" onClick={() => onChange({ ...data, selectedPlan: plan.id })}
                            className={`relative min-h-[44px] p-3 sm:p-2.5 rounded-lg text-left transition-all touch-manipulation ${data.selectedPlan === plan.id ? 'bg-white/[0.08] ring-1 ring-white/10' : 'bg-white/[0.03] hover:bg-white/[0.05] active:bg-white/[0.06]'}`}>
                            {plan.popular && (
                                <span className="absolute -top-1 right-1.5 px-1.5 py-px text-[6px] font-black text-white rounded-full uppercase" style={{ background: '#E31E24' }}>{t('registration_popular')}</span>
                            )}
                            <div className="flex items-center gap-1 mb-1">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: plan.accent }} />
                                <span className="text-[9px] font-bold text-white/50">{plan.name}</span>
                            </div>
                            <p className="text-base font-black text-white">
                                {plan.price ? <>{plan.price}<span className="text-[8px] font-normal text-white/20">€/m</span></> : <span className="text-[11px]">Consultar</span>}
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                                <Clock className="w-2 h-2 text-white/15" />
                                <span className="text-[7px] text-white/15">Soporte {plan.support}</span>
                            </div>
                            <div className="mt-1 space-y-px">
                                {plan.features.slice(0, 2).map(f => (
                                    <p key={f} className="text-[7px] text-white/18 flex items-center gap-0.5"><Check className="w-2 h-2 text-white/20" />{f}</p>
                                ))}
                                {plan.features.length > 2 && <p className="text-[7px] text-white/10">+{plan.features.length - 2} más</p>}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className={labelBase + ' mb-0'}>{t('registration_checklist')}</label>
                    <span className="text-[9px] font-bold text-white/30">{done}/{checklist.length}</span>
                </div>
                <div className="space-y-1">
                    {checklist.map(item => (
                        <div key={item.key} className={`flex items-center gap-2.5 px-3 py-2.5 sm:py-2 min-h-[44px] rounded-lg transition-all ${item.done ? 'bg-white/[0.04]' : 'bg-white/[0.02]'}`}>
                            {item.done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70 flex-shrink-0" /> : <Circle className="w-3.5 h-3.5 text-white/10 flex-shrink-0" />}
                            <span className={`text-[11px] font-medium ${item.done ? 'text-white/40' : 'text-white/20'}`}>{item.label}</span>
                            {item.key === 'support' && !item.done && (
                                <span className="ml-auto text-[7px] font-bold text-amber-400/60 bg-amber-500/8 px-1.5 py-0.5 rounded">{t('registration_pending')}</span>
                            )}
                        </div>
                    ))}
                </div>
                <div className="h-[2px] w-full bg-white/[0.03] rounded-full overflow-hidden mt-2">
                    <motion.div className="h-full rounded-full bg-white/20" initial={{ width: 0 }} animate={{ width: `${(done / checklist.length) * 100}%` }} transition={{ duration: 0.5 }} />
                </div>
            </div>

            <div className="flex gap-2 pt-2 sm:pt-0">
                <button type="button" onClick={onBack} className="w-12 h-12 sm:w-11 sm:h-11 min-h-[48px] sm:min-h-0 py-2.5 rounded-lg bg-white/[0.05] text-white/25 flex items-center justify-center active:bg-white/[0.06] transition-all touch-manipulation flex-shrink-0">
                    <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={handleSubmit} disabled={submitting} className="flex-1 min-h-[48px] py-2.5 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 text-white touch-manipulation"
                    style={{ background: allDone ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #E31E24, #B91C1C)' }}>
                    {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('registration_sending')}</> : allDone ? <><Zap className="w-3.5 h-3.5" /> {t('registration_activate_club')}</> : <><Eye className="w-3.5 h-3.5" /> {t('registration_send_review')}</>}
                </button>
            </div>
        </motion.div>
    );
}

function SuccessScreen({ clubName, onClose, t }: { clubName: string; onClose: () => void; t: (k: string) => string }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center text-center py-8 px-2 relative"
        >
            <motion.div
                className="absolute top-1/3 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)' }}
                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 3, repeat: Infinity }}
            />
            <motion.div
                className="relative w-16 h-16 rounded-full bg-emerald-500/8 flex items-center justify-center mb-4"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
            >
                <CheckCircle2 className="w-8 h-8 text-emerald-400/80" />
            </motion.div>
            <h2 className="text-lg font-black text-white">{t('registration_success_title')}</h2>
            <p className="text-[12px] text-white/30 mt-1.5 max-w-[260px] leading-relaxed">
                <span className="font-bold text-white/60">{clubName}</span> {t('registration_success_message')}
            </p>
            <div className="mt-5 p-3.5 rounded-lg bg-white/[0.03] text-left w-full max-w-[260px]">
                <p className="text-[8px] font-bold text-white/30 mb-2 uppercase tracking-wider">{t('registration_next_steps')}</p>
                <div className="space-y-2">
                    {[t('registration_step1'), t('registration_step2'), t('registration_step3')].map((text, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                            <div className="w-5 h-5 rounded bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                                <span className="text-[8px] font-black text-white/30">{i + 1}</span>
                            </div>
                            <span className="text-[10px] text-white/30">{text}</span>
                        </div>
                    ))}
                </div>
            </div>
            <button
                type="button"
                onClick={onClose}
                className="mt-5 w-full max-w-[260px] min-h-[48px] py-3 rounded-xl text-white text-[12px] font-semibold touch-manipulation"
                style={{ background: 'linear-gradient(135deg, #E31E24, #B91C1C)' }}
            >
                {t('registration_back_home')}
            </button>
        </motion.div>
    );
}

const initialManagerData: ManagerFormData = {
    officialName: '',
    fullAddress: '',
    description: '',
    logo: null,
    photos: [],
    courts: [],
    openTime: '08:00',
    closeTime: '23:00',
    slotDuration: '60',
    pricing: [...DEFAULT_PRICING],
    bookingWindow: '',
    cancellationPolicy: '',
    taxId: '',
    fiscalAddress: '',
    stripeConnected: false,
};

const initialActivationData: ActivationData = {
    selectedPlan: null,
    stripeVerified: false,
    inventoryReady: false,
    supportReview: 'pending',
};

export const ClubRegistration: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [phase, setPhase] = useState(0);
    const [leadData, setLeadData] = useState<LeadFormData>({
        firstName: '',
        lastName: '',
        clubName: '',
        city: '',
        country: '',
        phone: '',
        email: '',
        numCourts: '',
        sports: [],
    });
    const [managerData, setManagerData] = useState<ManagerFormData>(initialManagerData);
    const [activationData, setActivationData] = useState<ActivationData>(initialActivationData);

    const handleClose = useCallback(() => {
        navigate('/login');
    }, [navigate]);

    return (
        <div className="min-h-screen min-h-[100dvh] bg-[#0D0D0D] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="relative w-full max-w-md overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88vh] rounded-t-[20px] sm:rounded-[20px]"
                style={{
                    background: '#111',
                    paddingLeft: 'env(safe-area-inset-left)',
                    paddingRight: 'env(safe-area-inset-right)',
                }}
            >
                <div className="relative z-10 pt-2.5 pb-2 px-4 sm:px-5 pt-[max(0.625rem,env(safe-area-inset-top))]">
                    <div className="w-7 h-[3px] bg-white/8 rounded-full mx-auto mb-2.5" />
                    <div className="flex items-center gap-3">
                        {phase < 3 && <div className="flex-1 min-w-0"><StepBar currentStep={phase} /></div>}
                        {phase === 3 && <div className="flex-1" />}
                        <Link
                            to="/login"
                            className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-white/[0.05] flex items-center justify-center hover:bg-white/[0.08] active:bg-white/[0.1] transition-colors flex-shrink-0 touch-manipulation"
                            aria-label={t('close')}
                        >
                            <X className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-white/30" />
                        </Link>
                    </div>
                </div>

                <div className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 pb-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <AnimatePresence mode="wait">
                        {phase === 0 && (
                            <LeadPhase
                                key="lead"
                                data={leadData}
                                onChange={setLeadData}
                                onNext={() => setPhase(1)}
                                t={t}
                            />
                        )}
                        {phase === 1 && (
                            <ManagerPhase
                                key="manager"
                                data={managerData}
                                onChange={setManagerData}
                                onNext={() => setPhase(2)}
                                onBack={() => setPhase(0)}
                                leadData={leadData}
                                t={t}
                            />
                        )}
                        {phase === 2 && (
                            <ActivationPhase
                                key="activation"
                                data={activationData}
                                onChange={setActivationData}
                                onBack={() => setPhase(1)}
                                onFinish={() => setPhase(3)}
                                managerData={managerData}
                                leadData={leadData}
                                t={t}
                            />
                        )}
                        {phase === 3 && (
                            <SuccessScreen
                                key="success"
                                clubName={leadData.clubName || t('registration_your_club')}
                                onClose={handleClose}
                                t={t}
                            />
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};
