import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Plus,
    Edit,
    Trash2,
    Mail,
    Phone,
    Clock,
    Users,
    CheckCircle,
    Award,
    Eye,
    EyeOff,
} from 'lucide-react';
import { clubStaffService } from '../../services/clubStaff';
import { PageSpinner } from '../Layout/PageSpinner';
import type { ClubStaffMember, ScheduleBlock, Weekday } from '../../types/clubStaff';
import { toast } from 'sonner';

function initials(name: string): string {
    const p = name.trim().split(/\s+/).filter(Boolean);
    if (p.length === 0) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const STAFF_ROLE_OPTIONS = [
    'Entrenador',
    'Recepcionista',
    'Administrador',
    'Coordinador',
    'Mantenimiento',
    'Ventas',
] as const;

type FormState = {
    name: string;
    role: string;
    email: string;
    phone: string;
    schedule_blocks: ScheduleBlock[];
    status: 'active' | 'inactive';
    password: string;
};

const emptyForm: FormState = {
    name: '',
    role: STAFF_ROLE_OPTIONS[0],
    email: '',
    phone: '',
    schedule_blocks: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '09:00', to: '12:00' }],
    status: 'active',
    password: '',
};

const WEEKDAYS: { key: Weekday; label: string }[] = [
    { key: 'mon', label: 'L' },
    { key: 'tue', label: 'M' },
    { key: 'wed', label: 'X' },
    { key: 'thu', label: 'J' },
    { key: 'fri', label: 'V' },
    { key: 'sat', label: 'S' },
    { key: 'sun', label: 'D' },
];

function isValidTime(v: string): boolean {
    return /^\d{2}:\d{2}$/.test(v);
}

function timeToMinutes(v: string): number {
    return Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
}

function scheduleBlocksToDisplay(blocks: ScheduleBlock[]): string | null {
    if (!blocks.length) return null;
    const order = (d: Weekday) => WEEKDAYS.findIndex((x) => x.key === d);
    const dayLabel = Object.fromEntries(WEEKDAYS.map((d) => [d.key, d.label])) as Record<Weekday, string>;

    const normalize = blocks.map((b) => ({
        days: Array.from(new Set(b.days)).sort((a, b2) => order(a) - order(b2)),
        from: b.from,
        to: b.to,
    }));

    const groups = new Map<string, { days: Weekday[]; ranges: { from: string; to: string }[] }>();
    for (const b of normalize) {
        const key = b.days.join(',');
        const cur = groups.get(key);
        if (!cur) groups.set(key, { days: b.days, ranges: [{ from: b.from, to: b.to }] });
        else cur.ranges.push({ from: b.from, to: b.to });
    }

    return Array.from(groups.values())
        .sort((a, b) => order(a.days[0] ?? 'mon') - order(b.days[0] ?? 'mon'))
        .map((g) => {
            const days = g.days.map((d) => dayLabel[d]).join('');
            const ranges = g.ranges
                .sort((a, b) => timeToMinutes(a.from) - timeToMinutes(b.from))
                .map((r) => `${r.from}-${r.to}`)
                .join(', ');
            return `${days} ${ranges}`;
        })
        .join(' · ');
}

function ScheduleEditor({
    value,
    onChange,
}: {
    value: ScheduleBlock[];
    onChange: (v: ScheduleBlock[]) => void;
}) {
    const addBlock = () => {
        onChange([...value, { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '09:00', to: '12:00' }]);
    };

    const updateBlock = (idx: number, next: Partial<ScheduleBlock>) => {
        onChange(value.map((b, i) => (i === idx ? { ...b, ...next } : b)));
    };

    const toggleDay = (idx: number, day: Weekday) => {
        const cur = value[idx];
        const has = cur.days.includes(day);
        const days = has ? cur.days.filter((d) => d !== day) : [...cur.days, day];
        updateBlock(idx, { days });
    };

    const removeBlock = (idx: number) => {
        const next = value.filter((_, i) => i !== idx);
        if (next.length === 0) {
            onChange([{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '09:00', to: '12:00' }]);
            return;
        }
        onChange(next);
    };

    return (
        <div>
            <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-gray-500">Horario</label>
                <button
                    type="button"
                    onClick={addBlock}
                    className="text-[10px] font-bold text-[#E31E24] hover:opacity-80"
                >
                    + Agregar bloque
                </button>
            </div>
            <div className="mt-2 space-y-2">
                {value.length === 0 ? (
                    <p className="text-[10px] text-gray-400">Sin horario cargado.</p>
                ) : (
                    value.map((b, idx) => (
                        <div key={idx} className="rounded-xl border border-gray-200 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] font-semibold text-gray-500">Bloque {idx + 1}</p>
                                <button
                                    type="button"
                                    onClick={() => removeBlock(idx)}
                                    className="text-[10px] font-bold text-red-600 hover:opacity-80"
                                >
                                    Quitar
                                </button>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {WEEKDAYS.map((d) => {
                                    const active = b.days.includes(d.key);
                                    return (
                                        <button
                                            key={d.key}
                                            type="button"
                                            onClick={() => toggleDay(idx, d.key)}
                                            className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${
                                                active
                                                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                            }`}
                                            aria-pressed={active}
                                        >
                                            {d.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-500">Hora desde</label>
                                    <input
                                        type="time"
                                        className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                        value={b.from}
                                        onChange={(e) => updateBlock(idx, { from: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-500">Hora hasta</label>
                                    <input
                                        type="time"
                                        className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                        value={b.to}
                                        onChange={(e) => updateBlock(idx, { to: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <p className="mt-2 text-[10px] text-gray-400">
                Ejemplo: un bloque por la mañana y otro por la tarde, marcando los días que corresponden.
            </p>
        </div>
    );
}

function PasswordField({
    label,
    value,
    onChange,
    show,
    onToggleShow,
    placeholder,
    hint,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggleShow: () => void;
    placeholder?: string;
    hint?: string;
}) {
    return (
        <div>
            <label className="text-[10px] font-semibold text-gray-500">{label}</label>
            {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
            <div className="relative mt-0.5">
                <input
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 pr-10 text-sm"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                />
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={onToggleShow}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label={show ? 'Ocultar' : 'Mostrar'}
                >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}

export function ClubStaffTab({ clubId }: { clubId: string | null }) {
    const [list, setList] = useState<ClubStaffMember[]>([]);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState<{ mode: 'create' | 'edit'; member?: ClubStaffMember } | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!clubId) return;
        setLoading(true);
        try {
            const data = await clubStaffService.list(clubId);
            setList(data);
        } catch (e) {
            toast.error((e as Error).message || 'Error al cargar personal');
            setList([]);
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        load();
    }, [load]);

    const stats = useMemo(() => {
        const total = list.length;
        const active = list.filter((m) => m.status === 'active').length;
        const coaches = list.filter((m) => /entren/i.test(m.role)).length;
        return { total, active, coaches };
    }, [list]);

    const openCreate = () => {
        setForm(emptyForm);
        setShowPassword(false);
        setModal({ mode: 'create' });
    };

    const openEdit = (m: ClubStaffMember) => {
        setForm({
            name: m.name,
            role: m.role,
            email: m.email ?? '',
            phone: m.phone ?? '',
            schedule_blocks: m.schedule_blocks ?? [],
            status: m.status,
            password: '',
        });
        setShowPassword(false);
        setModal({ mode: 'edit', member: m });
    };

    const submit = async () => {
        if (!clubId || !form.name.trim()) {
            toast.error('Nombre obligatorio');
            return;
        }
        if (modal?.mode === 'create') {
            if (!form.email.trim()) {
                toast.error('Email obligatorio');
                return;
            }
            if (form.password.length < 6) {
                toast.error('La contraseña debe tener al menos 6 caracteres');
                return;
            }
        }
        if (modal?.mode === 'edit' && form.password.trim() && form.password.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        for (const b of form.schedule_blocks) {
            if (!b.days.length) {
                toast.error('Selecciona al menos un día en cada bloque de horario');
                return;
            }
            if (!isValidTime(b.from) || !isValidTime(b.to)) {
                toast.error('Horas inválidas (usa formato HH:mm)');
                return;
            }
            if (timeToMinutes(b.from) >= timeToMinutes(b.to)) {
                toast.error('La hora "desde" debe ser menor que la hora "hasta"');
                return;
            }
        }

        setSaving(true);
        try {
            if (modal?.mode === 'create') {
                const { member, email_sent, email_error } = await clubStaffService.create({
                    club_id: clubId,
                    name: form.name.trim(),
                    password: form.password,
                    role: form.role.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim() || undefined,
                    schedule_blocks: form.schedule_blocks.length ? form.schedule_blocks : [],
                    status: form.status,
                });
                setList((prev) => [member, ...prev]);
                toast.success('Personal añadido');
                if (!email_sent) {
                    toast.warning(
                        email_error
                            ? `No se pudo enviar el email: ${email_error}`
                            : 'No se pudo enviar el email (revisa Resend / función send-email).'
                    );
                }
            } else if (modal?.member) {
                const body: Parameters<typeof clubStaffService.update>[1] = {
                    name: form.name.trim(),
                    role: form.role.trim(),
                    email: form.email.trim() || null,
                    phone: form.phone.trim() || null,
                    schedule_blocks: form.schedule_blocks.length ? form.schedule_blocks : [],
                    status: form.status,
                };
                if (form.password.trim()) body.password = form.password.trim();
                const updated = await clubStaffService.update(modal.member.id, body);
                setList((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                toast.success('Guardado');
            }
            setModal(null);
        } catch (e) {
            toast.error((e as Error).message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await clubStaffService.delete(deleteId);
            setList((prev) => prev.filter((x) => x.id !== deleteId));
            toast.success('Eliminado');
        } catch (e) {
            toast.error((e as Error).message || 'Error al eliminar');
        } finally {
            setDeleteId(null);
        }
    };

    if (!clubId) {
        return (
            <p className="text-sm text-gray-500 text-center py-12">
                No se pudo determinar el club. Vuelve a iniciar sesión.
            </p>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-[#1A1A1A]">Gestión de personal</h2>
                <button
                    type="button"
                    onClick={openCreate}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold hover:opacity-90"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Añadir personal
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-600">
                            <Users className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-lg font-black text-[#1A1A1A]">{stats.total}</p>
                            <p className="text-[10px] text-gray-400">Personal total</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-green-500/10 text-green-600">
                            <CheckCircle className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-lg font-black text-[#1A1A1A]">{stats.active}</p>
                            <p className="text-[10px] text-gray-400">Activos</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-500/10 text-red-600">
                            <Award className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-lg font-black text-[#1A1A1A]">{stats.coaches}</p>
                            <p className="text-[10px] text-gray-400">Entrenadores</p>
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <PageSpinner />
            ) : (
                <div className="space-y-3">
                    {list.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-8">Aún no hay personal registrado.</p>
                    ) : (
                        list.map((member) => (
                            <div key={member.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                                        <span className="text-white text-xs font-bold">{initials(member.name)}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1 gap-2">
                                            <p className="text-xs font-bold text-[#1A1A1A]">{member.name}</p>
                                            <span
                                                className={`text-[10px] ${member.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}
                                            >
                                                {member.status === 'active' ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-[#E31E24] font-semibold mb-2">{member.role || '—'}</p>
                                        <div className="flex flex-wrap gap-3 text-[10px] text-gray-400">
                                            {member.email && (
                                                <span className="flex items-center gap-1">
                                                    <Mail className="w-3 h-3" />
                                                    {member.email}
                                                </span>
                                            )}
                                            {member.phone && (
                                                <span className="flex items-center gap-1">
                                                    <Phone className="w-3 h-3" />
                                                    {member.phone}
                                                </span>
                                            )}
                                            {member.schedule && (
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {member.schedule}
                                                </span>
                                            )}
                                            {!member.schedule && member.schedule_blocks?.length ? (
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {scheduleBlocksToDisplay(member.schedule_blocks) ?? '—'}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => openEdit(member)}
                                            className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50"
                                        >
                                            <Edit className="w-3.5 h-3.5 text-gray-400" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeleteId(member.id)}
                                            className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 p-5 shadow-xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-sm font-bold text-[#1A1A1A] mb-4">
                            {modal.mode === 'create' ? 'Nuevo miembro' : 'Editar'}
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Nombre</label>
                                <input
                                    className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Rol</label>
                                <select
                                    className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={form.role}
                                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                                >
                                    <option value="" disabled>
                                        Selecciona un rol…
                                    </option>
                                    {STAFF_ROLE_OPTIONS.map((r) => (
                                        <option key={r} value={r}>
                                            {r}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Email</label>
                                <input
                                    type="email"
                                    className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={form.email}
                                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                />
                            </div>
                            {modal.mode === 'create' ? (
                                <PasswordField
                                    label="Contraseña de acceso"
                                    hint="Mín. 6 caracteres. Se envía por email al responsable."
                                    value={form.password}
                                    onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                                    show={showPassword}
                                    onToggleShow={() => setShowPassword((s) => !s)}
                                    placeholder="Contraseña temporal"
                                />
                            ) : (
                                <PasswordField
                                    label="Nueva contraseña"
                                    hint="Dejar vacío para no cambiar. Mín. 6 caracteres si la cambias."
                                    value={form.password}
                                    onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                                    show={showPassword}
                                    onToggleShow={() => setShowPassword((s) => !s)}
                                    placeholder="Solo si quieres cambiarla"
                                />
                            )}
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Teléfono</label>
                                <input
                                    className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={form.phone}
                                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                                />
                            </div>
                            <div>
                                <ScheduleEditor
                                    value={form.schedule_blocks}
                                    onChange={(v) => setForm((f) => ({ ...f, schedule_blocks: v }))}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500">Estado</label>
                                <select
                                    className="mt-0.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                    value={form.status}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))
                                    }
                                >
                                    <option value="active">Activo</option>
                                    <option value="inactive">Inactivo</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end mt-5">
                            <button
                                type="button"
                                onClick={() => setModal(null)}
                                className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={submit}
                                className="px-3.5 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-bold disabled:opacity-50"
                            >
                                {saving ? '…' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 p-5 shadow-xl">
                        <p className="text-sm font-semibold text-[#1A1A1A] mb-4">¿Eliminar este miembro?</p>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setDeleteId(null)}
                                className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmDelete}
                                className="px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-bold"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
