import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Users, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { schoolCoursesService } from '../../services/schoolCourses';
import { clubStaffService } from '../../services/clubStaff';
import { courtService } from '../../services/court';
import type { SchoolCourse, SchoolLevel, SchoolSport, SchoolWeekday } from '../../types/schoolCourses';
import type { ClubStaffMember } from '../../types/clubStaff';
import type { Court } from '../../types/court';

const LEVELS: SchoolLevel[] = ['Principiante', 'Intermedio', 'Avanzado', 'Competicion', 'Elite', 'Infantil'];
const WEEKDAYS: { key: SchoolWeekday; label: string }[] = [
  { key: 'mon', label: 'L' },
  { key: 'tue', label: 'M' },
  { key: 'wed', label: 'X' },
  { key: 'thu', label: 'J' },
  { key: 'fri', label: 'V' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'D' },
];

type FormState = {
  name: string;
  sport: SchoolSport;
  level: SchoolLevel;
  staff_id: string;
  court_id: string;
  price: string;
  capacity: string;
  weekdays: SchoolWeekday[];
  start_time: string;
  end_time: string;
  starts_on: string;
  ends_on: string;
};

const emptyForm: FormState = {
  name: '',
  sport: 'padel',
  level: 'Principiante',
  staff_id: '',
  court_id: '',
  price: '',
  capacity: '8',
  weekdays: ['tue', 'thu'],
  start_time: '19:00',
  end_time: '20:00',
  starts_on: '',
  ends_on: '',
};

function scheduleText(course: SchoolCourse): string {
  return (course.days ?? [])
    .map((d) => `${WEEKDAYS.find((w) => w.key === d.weekday)?.label ?? d.weekday} ${d.start_time}-${d.end_time}`)
    .join(' · ');
}

export function ClubSchoolTab({ clubId, clubResolved = true }: { clubId: string | null; clubResolved?: boolean }) {
  const [courses, setCourses] = useState<SchoolCourse[]>([]);
  const [staff, setStaff] = useState<ClubStaffMember[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sportFilter, setSportFilter] = useState<SchoolSport | 'all'>('all');
  const [levelFilter, setLevelFilter] = useState<SchoolLevel | 'all'>('all');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; course?: SchoolCourse } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const [courseRows, staffRows, courtRows] = await Promise.all([
        schoolCoursesService.list(clubId, { sport: sportFilter, level: levelFilter }),
        clubStaffService.list(clubId),
        courtService.getAll(clubId),
      ]);
      setCourses(courseRows);
      setStaff(staffRows.filter((s) => s.status === 'active'));
      setCourts(courtRows);
    } catch (e) {
      toast.error((e as Error).message || 'Error al cargar escuela');
    } finally {
      setLoading(false);
    }
  }, [clubId, sportFilter, levelFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const totalCourses = courses.length;
    const totalEnrolled = courses.reduce((acc, c) => acc + (c.enrolled_count ?? 0), 0);
    const padel = courses.filter((c) => c.sport === 'padel').length;
    const tenis = courses.filter((c) => c.sport === 'tenis').length;
    return { totalCourses, totalEnrolled, padel, tenis };
  }, [courses]);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      staff_id: staff[0]?.id ?? '',
      court_id: courts[0]?.id ?? '',
    });
    setModal({ mode: 'create' });
  };

  const openEdit = (course: SchoolCourse) => {
    setForm({
      name: course.name,
      sport: course.sport,
      level: course.level,
      staff_id: course.staff_id,
      court_id: course.court_id,
      price: String((course.price_cents ?? 0) / 100),
      capacity: String(course.capacity ?? 8),
      weekdays: (course.days ?? []).map((d) => d.weekday),
      start_time: course.days?.[0]?.start_time ?? '19:00',
      end_time: course.days?.[0]?.end_time ?? '20:00',
      starts_on: course.starts_on ?? '',
      ends_on: course.ends_on ?? '',
    });
    setModal({ mode: 'edit', course });
  };

  const toggleWeekday = (day: SchoolWeekday) => {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(day) ? f.weekdays.filter((d) => d !== day) : [...f.weekdays, day],
    }));
  };

  const submit = async () => {
    if (!clubId) return;
    if (!form.name.trim()) return toast.error('Nombre obligatorio');
    if (!form.staff_id) return toast.error('Selecciona staff');
    if (!form.court_id) return toast.error('Selecciona pista');
    if (!form.weekdays.length) return toast.error('Selecciona al menos un día');
    if (!form.start_time || !form.end_time) return toast.error('Completa horario');
    const priceValue = Number(form.price);
    if (!Number.isFinite(priceValue) || priceValue < 0) return toast.error('Precio inválido');
    const capValue = Number(form.capacity);
    if (!Number.isFinite(capValue) || capValue <= 0) return toast.error('Capacidad inválida');

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        sport: form.sport,
        level: form.level,
        staff_id: form.staff_id,
        court_id: form.court_id,
        price_cents: Math.round(priceValue * 100),
        capacity: Math.round(capValue),
        weekdays: form.weekdays,
        start_time: form.start_time,
        end_time: form.end_time,
        starts_on: form.starts_on || null,
        ends_on: form.ends_on || null,
      };
      if (modal?.mode === 'create') {
        const created = await schoolCoursesService.create({ club_id: clubId, ...body });
        setCourses((prev) => [created, ...prev]);
        toast.success('Curso creado');
      } else if (modal?.course) {
        const updated = await schoolCoursesService.update(modal.course.id, body);
        setCourses((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        toast.success('Curso actualizado');
      }
      setModal(null);
      load();
    } catch (e) {
      toast.error((e as Error).message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteId) return;
    try {
      await schoolCoursesService.remove(deleteId);
      setCourses((prev) => prev.filter((x) => x.id !== deleteId));
      setDeleteId(null);
      toast.success('Curso eliminado');
    } catch (e) {
      toast.error((e as Error).message || 'Error al eliminar');
    }
  };

  if (!clubResolved) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!clubId) return <p className="text-sm text-gray-500 text-center py-12">No se pudo determinar el club.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[#1A1A1A]">Gestion escuela</h2>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo curso
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.totalCourses}</p>
          <p className="text-[10px] text-gray-400">Cursos</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.totalEnrolled}</p>
          <p className="text-[10px] text-gray-400">Alumnos anotados</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.padel}</p>
          <p className="text-[10px] text-gray-400">Padel</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.tenis}</p>
          <p className="text-[10px] text-gray-400">Tenis</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 grid md:grid-cols-2 gap-2">
        <select
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value as SchoolSport | 'all')}
        >
          <option value="all">Todos deportes</option>
          <option value="padel">Padel</option>
          <option value="tenis">Tenis</option>
        </select>
        <select
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as SchoolLevel | 'all')}
        >
          <option value="all">Todos niveles</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No hay cursos cargados.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {courses.map((course) => (
            <div key={course.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#1A1A1A] truncate">{course.name}</p>
                  <p className="text-[10px] text-[#E31E24] font-semibold">
                    {course.sport.toUpperCase()} · {course.level}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(course)}
                    className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50"
                  >
                    <Edit className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(course.id)}
                    className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-[10px] text-gray-500">
                <p className="flex items-center gap-1"><GraduationCap className="w-3 h-3" /> Staff: {course.staff_name ?? '-'}</p>
                <p className="flex items-center gap-1"><Users className="w-3 h-3" /> Alumnos: {course.enrolled_count}/{course.capacity}</p>
                <p>Pista: {course.court_name ?? '-'}</p>
                <p>Horario: {scheduleText(course) || '-'}</p>
                <p>Precio: EUR {(course.price_cents / 100).toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-4">{modal.mode === 'create' ? 'Nuevo curso' : 'Editar curso'}</h3>
            <div className="space-y-3">
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Nombre" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.sport} onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value as SchoolSport }))}>
                  <option value="padel">Padel</option>
                  <option value="tenis">Tenis</option>
                </select>
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as SchoolLevel }))}>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.staff_id} onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}>
                  <option value="">Selecciona staff</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.court_id} onChange={(e) => setForm((f) => ({ ...f, court_id: e.target.value }))}>
                  <option value="">Selecciona pista</option>
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="0.01" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Precio" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                <input type="number" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Capacidad" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-500 mb-1">Dias</p>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const active = form.weekdays.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleWeekday(d.key)}
                        className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${active ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200'}`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="time" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
                <input type="time" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.starts_on} onChange={(e) => setForm((f) => ({ ...f, starts_on: e.target.value }))} />
                <input type="date" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.ends_on} onChange={(e) => setForm((f) => ({ ...f, ends_on: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={() => setModal(null)} className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700">Cancelar</button>
              <button type="button" disabled={saving} onClick={submit} className="px-3.5 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-bold disabled:opacity-50">{saving ? '...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 p-5 shadow-xl">
            <p className="text-sm font-semibold text-[#1A1A1A] mb-4">Eliminar este curso?</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDeleteId(null)} className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold">Cancelar</button>
              <button type="button" onClick={doDelete} className="px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-bold">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
