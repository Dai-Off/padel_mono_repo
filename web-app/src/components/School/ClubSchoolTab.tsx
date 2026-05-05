import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Users, GraduationCap, CreditCard, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { schoolCoursesService } from '../../services/schoolCourses';
import { clubStaffService } from '../../services/clubStaff';
import { courtService } from '../../services/court';
import type {
  SchoolCourse,
  SchoolLevel,
  SchoolSport,
  SchoolWeekday,
  SchoolEnrollment,
  SchoolPrivateLesson,
  SchoolFeeRule,
  SchoolCharge,
} from '../../types/schoolCourses';
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
const TIME_BANDS = [
  { key: 'morning', label: 'Mañana' },
  { key: 'afternoon', label: 'Tarde' },
  { key: 'weekend', label: 'Fin de semana' },
] as const;

type MainTab = 'courses' | 'private' | 'fees' | 'debts';

type CourseFormState = {
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

type PrivateFormState = {
  student_name: string;
  student_email: string;
  student_phone: string;
  staff_id: string;
  court_id: string;
  price: string;
  weekday: SchoolWeekday;
  start_time: string;
  end_time: string;
  starts_on: string;
  ends_on: string;
};

const emptyCourseForm: CourseFormState = {
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

const emptyPrivateForm: PrivateFormState = {
  student_name: '',
  student_email: '',
  student_phone: '',
  staff_id: '',
  court_id: '',
  price: '',
  weekday: 'wed',
  start_time: '18:00',
  end_time: '19:00',
  starts_on: '',
  ends_on: '',
};

function scheduleText(course: SchoolCourse): string {
  return (course.days ?? [])
    .map((d) => `${WEEKDAYS.find((w) => w.key === d.weekday)?.label ?? d.weekday} ${d.start_time}-${d.end_time}`)
    .join(' · ');
}

function fullName(enrollment: SchoolEnrollment): string {
  const fromPlayer = [enrollment.player?.first_name, enrollment.player?.last_name].filter(Boolean).join(' ').trim();
  return fromPlayer || enrollment.student_name || enrollment.student_email || 'Alumno';
}

export function ClubSchoolTab({ clubId, clubResolved = true }: { clubId: string | null; clubResolved?: boolean }) {
  const [tab, setTab] = useState<MainTab>('courses');
  const [courses, setCourses] = useState<SchoolCourse[]>([]);
  const [privateLessons, setPrivateLessons] = useState<SchoolPrivateLesson[]>([]);
  const [feeRules, setFeeRules] = useState<SchoolFeeRule[]>([]);
  const [charges, setCharges] = useState<SchoolCharge[]>([]);
  const [staff, setStaff] = useState<ClubStaffMember[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPrivate, setSavingPrivate] = useState(false);

  const [courseModal, setCourseModal] = useState<{ mode: 'create' | 'edit'; course?: SchoolCourse } | null>(null);
  const [courseForm, setCourseForm] = useState<CourseFormState>(emptyCourseForm);
  const [privateModal, setPrivateModal] = useState<{ mode: 'create' | 'edit'; lesson?: SchoolPrivateLesson } | null>(null);
  const [privateForm, setPrivateForm] = useState<PrivateFormState>(emptyPrivateForm);
  const [enrollmentsModal, setEnrollmentsModal] = useState<SchoolCourse | null>(null);
  const [enrollments, setEnrollments] = useState<SchoolEnrollment[]>([]);
  const [newEnrollment, setNewEnrollment] = useState({ student_name: '', student_email: '', student_phone: '', fee: '' });
  const [addingEnrollment, setAddingEnrollment] = useState(false);
  const [deletingEnrollmentId, setDeletingEnrollmentId] = useState<string | null>(null);

  const loadCore = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const [courseRows, staffRows, courtRows, privateRows, feeRows, debtRows] = await Promise.all([
        schoolCoursesService.list(clubId),
        clubStaffService.list(clubId),
        courtService.getAll(clubId),
        schoolCoursesService.listPrivateLessons(clubId),
        schoolCoursesService.listFeeRules(clubId),
        schoolCoursesService.listCharges(clubId, { status: 'pending' }),
      ]);
      setCourses(courseRows);
      setStaff(staffRows.filter((s) => s.status === 'active'));
      setCourts(courtRows);
      setPrivateLessons(privateRows);
      setFeeRules(feeRows.filter((x) => x.is_active));
      setCharges(debtRows);
    } catch (e) {
      toast.error((e as Error).message || 'Error al cargar escuela');
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  const stats = useMemo(() => {
    return {
      courses: courses.length,
      enrolled: courses.reduce((acc, c) => acc + (c.enrolled_count ?? 0), 0),
      privateCount: privateLessons.length,
      pendingDebts: charges.filter((c) => c.status === 'pending').length,
    };
  }, [courses, privateLessons, charges]);

  const openCourseCreate = () => {
    setCourseForm({
      ...emptyCourseForm,
      staff_id: staff[0]?.id ?? '',
      court_id: courts[0]?.id ?? '',
    });
    setCourseModal({ mode: 'create' });
  };

  const openCourseEdit = (course: SchoolCourse) => {
    setCourseForm({
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
    setCourseModal({ mode: 'edit', course });
  };

  const saveCourse = async () => {
    if (!clubId) return;
    const priceValue = Number(courseForm.price);
    const capValue = Number(courseForm.capacity);
    if (!courseForm.name.trim()) return toast.error('Nombre obligatorio');
    if (!courseForm.staff_id || !courseForm.court_id) return toast.error('Staff y pista obligatorios');
    if (!courseForm.weekdays.length) return toast.error('Selecciona al menos un día');
    if (!Number.isFinite(priceValue) || priceValue < 0) return toast.error('Precio inválido');
    if (!Number.isFinite(capValue) || capValue <= 0) return toast.error('Capacidad inválida');

    setSaving(true);
    try {
      const body = {
        name: courseForm.name.trim(),
        sport: courseForm.sport,
        level: courseForm.level,
        staff_id: courseForm.staff_id,
        court_id: courseForm.court_id,
        price_cents: Math.round(priceValue * 100),
        capacity: Math.round(capValue),
        weekdays: courseForm.weekdays,
        start_time: courseForm.start_time,
        end_time: courseForm.end_time,
        starts_on: courseForm.starts_on || null,
        ends_on: courseForm.ends_on || null,
      };
      if (courseModal?.mode === 'create') {
        await schoolCoursesService.create({ club_id: clubId, ...body });
      } else if (courseModal?.course) {
        await schoolCoursesService.update(courseModal.course.id, body);
      }
      setCourseModal(null);
      await loadCore();
      toast.success('Curso guardado');
    } catch (e) {
      toast.error((e as Error).message || 'Error al guardar curso');
    } finally {
      setSaving(false);
    }
  };

  const removeCourse = async (id: string) => {
    if (!window.confirm('¿Eliminar curso?')) return;
    try {
      await schoolCoursesService.remove(id);
      await loadCore();
      toast.success('Curso eliminado');
    } catch (e) {
      toast.error((e as Error).message || 'Error al eliminar');
    }
  };

  const openEnrollments = async (course: SchoolCourse) => {
    setEnrollmentsModal(course);
    setNewEnrollment({ student_name: '', student_email: '', student_phone: '', fee: '' });
    try {
      const rows = await schoolCoursesService.listEnrollments(course.id);
      setEnrollments(rows.filter((x) => x.status !== 'cancelled'));
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo cargar alumnos');
      setEnrollments([]);
    }
  };

  const addEnrollment = async () => {
    if (!enrollmentsModal) return;
    if (addingEnrollment) return;
    if (!newEnrollment.student_name.trim() && !newEnrollment.student_email.trim()) {
      return toast.error('Nombre o email obligatorio');
    }
    const feeEuros = Number(newEnrollment.fee || '0');
    setAddingEnrollment(true);
    try {
      await schoolCoursesService.createEnrollment(enrollmentsModal.id, {
        student_name: newEnrollment.student_name || null,
        student_email: newEnrollment.student_email || null,
        student_phone: newEnrollment.student_phone || null,
        fee_cents: Math.round((Number.isFinite(feeEuros) ? Math.max(0, feeEuros) : 0) * 100),
      });
      const rows = await schoolCoursesService.listEnrollments(enrollmentsModal.id);
      setEnrollments(rows.filter((x) => x.status !== 'cancelled'));
      await loadCore();
      setNewEnrollment({ student_name: '', student_email: '', student_phone: '', fee: '' });
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo agregar alumno');
    } finally {
      setAddingEnrollment(false);
    }
  };

  const updateEnrollmentFee = async (enrollment: SchoolEnrollment, feeEuros: string) => {
    if (!enrollmentsModal) return;
    const value = Number(feeEuros);
    if (!Number.isFinite(value) || value < 0) return toast.error('Cuota inválida');
    try {
      await schoolCoursesService.updateEnrollment(enrollmentsModal.id, enrollment.id, { fee_cents: Math.round(value * 100) });
      const rows = await schoolCoursesService.listEnrollments(enrollmentsModal.id);
      setEnrollments(rows.filter((x) => x.status !== 'cancelled'));
      await loadCore();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo actualizar cuota');
    }
  };

  const cancelEnrollment = async (enrollmentId: string) => {
    if (!enrollmentsModal) return;
    if (deletingEnrollmentId) return;
    setDeletingEnrollmentId(enrollmentId);
    try {
      await schoolCoursesService.cancelEnrollment(enrollmentsModal.id, enrollmentId);
      const rows = await schoolCoursesService.listEnrollments(enrollmentsModal.id);
      setEnrollments(rows.filter((x) => x.status !== 'cancelled'));
      await loadCore();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo quitar alumno');
    } finally {
      setDeletingEnrollmentId(null);
    }
  };

  const openPrivateCreate = () => {
    setPrivateForm({
      ...emptyPrivateForm,
      staff_id: staff[0]?.id ?? '',
      court_id: courts[0]?.id ?? '',
    });
    setPrivateModal({ mode: 'create' });
  };

  const openPrivateEdit = (lesson: SchoolPrivateLesson) => {
    setPrivateForm({
      student_name: lesson.student_name ?? '',
      student_email: lesson.student_email ?? '',
      student_phone: lesson.student_phone ?? '',
      staff_id: lesson.staff_id,
      court_id: lesson.court_id,
      price: String((lesson.price_cents ?? 0) / 100),
      weekday: lesson.weekday,
      start_time: lesson.start_time,
      end_time: lesson.end_time,
      starts_on: lesson.starts_on ?? '',
      ends_on: lesson.ends_on ?? '',
    });
    setPrivateModal({ mode: 'edit', lesson });
  };

  const savePrivate = async () => {
    if (!clubId) return;
    if (savingPrivate) return;
    const priceValue = Number(privateForm.price);
    if (!privateForm.staff_id || !privateForm.court_id) return toast.error('Staff y pista obligatorios');
    if (!Number.isFinite(priceValue) || priceValue < 0) return toast.error('Precio inválido');

    setSavingPrivate(true);
    try {
      const payload = {
        club_id: clubId,
        student_name: privateForm.student_name || null,
        student_email: privateForm.student_email || null,
        student_phone: privateForm.student_phone || null,
        staff_id: privateForm.staff_id,
        court_id: privateForm.court_id,
        price_cents: Math.round(priceValue * 100),
        weekday: privateForm.weekday,
        start_time: privateForm.start_time,
        end_time: privateForm.end_time,
        starts_on: privateForm.starts_on || null,
        ends_on: privateForm.ends_on || null,
      };
      if (privateModal?.mode === 'create') {
        await schoolCoursesService.createPrivateLesson(payload);
      } else if (privateModal?.lesson) {
        await schoolCoursesService.updatePrivateLesson(privateModal.lesson.id, payload);
      }
      setPrivateModal(null);
      await loadCore();
      toast.success('Clase guardada');
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo guardar clase');
    } finally {
      setSavingPrivate(false);
    }
  };

  const removePrivate = async (id: string) => {
    if (!window.confirm('¿Eliminar clase particular?')) return;
    try {
      await schoolCoursesService.removePrivateLesson(id);
      await loadCore();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo eliminar clase');
    }
  };

  const upsertFee = async (groupSize: 2 | 3 | 4, timeBand: 'morning' | 'afternoon' | 'weekend', value: string) => {
    if (!clubId) return;
    const euros = Number(value);
    if (!Number.isFinite(euros) || euros < 0) return toast.error('Cuota inválida');
    try {
      await schoolCoursesService.upsertFeeRule({
        club_id: clubId,
        group_size: groupSize,
        time_band: timeBand,
        price_cents: Math.round(euros * 100),
      });
      await loadCore();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo guardar regla');
    }
  };

  const markDebtPaid = async (chargeId: string) => {
    try {
      await schoolCoursesService.markChargePaid(chargeId);
      await loadCore();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo marcar pago');
    }
  };

  const overdueCharges = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return charges.filter((x) => x.status === 'pending' && x.due_date < today);
  }, [charges]);

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.courses}</p>
          <p className="text-[10px] text-gray-400">Cursos</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.enrolled}</p>
          <p className="text-[10px] text-gray-400">Alumnos activos</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.privateCount}</p>
          <p className="text-[10px] text-gray-400">Particulares</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.pendingDebts}</p>
          <p className="text-[10px] text-gray-400">Cuotas pendientes</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={`px-3 py-2 rounded-xl text-xs font-semibold ${tab === 'courses' ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200'}`} onClick={() => setTab('courses')}>Cursos</button>
        <button className={`px-3 py-2 rounded-xl text-xs font-semibold ${tab === 'private' ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200'}`} onClick={() => setTab('private')}>Particulares</button>
        <button className={`px-3 py-2 rounded-xl text-xs font-semibold ${tab === 'fees' ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200'}`} onClick={() => setTab('fees')}>Cuotas</button>
        <button className={`px-3 py-2 rounded-xl text-xs font-semibold ${tab === 'debts' ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200'}`} onClick={() => setTab('debts')}>Impagos</button>
      </div>

      {tab === 'courses' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={openCourseCreate} className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold">
              <Plus className="w-3.5 h-3.5" />
              Crear curso
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {courses.map((course) => (
                <div key={course.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1A1A1A] truncate">{course.name}</p>
                      <p className="text-[10px] text-[#E31E24] font-semibold">{course.sport.toUpperCase()} · {course.level}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => openEnrollments(course)} className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50">
                        <Users className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button onClick={() => openCourseEdit(course)} className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50">
                        <Edit className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                      <button onClick={() => void removeCourse(course.id)} className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-[10px] text-gray-500">
                    <p className="flex items-center gap-1"><GraduationCap className="w-3 h-3" /> Staff: {course.staff_name ?? '-'}</p>
                    <p className="flex items-center gap-1"><Users className="w-3 h-3" /> Alumnos: {course.enrolled_count}/{course.capacity}</p>
                    <p>Pista: {course.court_name ?? '-'}</p>
                    <p>Horario: {scheduleText(course) || '-'}</p>
                    <p>Precio base: EUR {(course.price_cents / 100).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'private' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={openPrivateCreate} className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold">
              <Plus className="w-3.5 h-3.5" />
              Crear clase particular
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {privateLessons.map((lesson) => (
              <div key={lesson.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#1A1A1A]">{lesson.student_name || lesson.student_email || 'Alumno'}</p>
                    <p className="text-[10px] text-gray-500">{WEEKDAYS.find((x) => x.key === lesson.weekday)?.label} {lesson.start_time}-{lesson.end_time}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openPrivateEdit(lesson)} className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50"><Edit className="w-3.5 h-3.5 text-gray-400" /></button>
                    <button onClick={() => void removePrivate(lesson.id)} className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-gray-500">Precio: EUR {(lesson.price_cents / 100).toFixed(2)} · Desde {lesson.starts_on ?? '-'} hasta {lesson.ends_on ?? '-'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'fees' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1A1A1A]">Cuotas por tamaño de grupo y franja</p>
          {[2, 3, 4].map((size) => (
            <div key={size} className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-600">Grupo de {size} personas</p>
              <div className="grid md:grid-cols-3 gap-2">
                {TIME_BANDS.map((band) => {
                  const rule = feeRules.find((x) => x.group_size === size && x.time_band === band.key);
                  return (
                    <div key={`${size}-${band.key}`} className="rounded-xl border border-gray-200 p-2">
                      <p className="text-[10px] text-gray-500 mb-1">{band.label}</p>
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={rule ? (rule.price_cents / 100).toFixed(2) : ''}
                        placeholder="EUR"
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                        onBlur={(e) => void upsertFee(size as 2 | 3 | 4, band.key, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'debts' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Pendientes vencidos: {overdueCharges.length}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {charges.map((charge) => (
              <div key={charge.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[#1A1A1A]">{charge.student_name || 'Alumno'}</p>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${charge.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{charge.status}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Vence: {charge.due_date} · Monto: EUR {(charge.amount_cents / 100).toFixed(2)}</p>
                {charge.status === 'pending' && (
                  <button onClick={() => void markDebtPaid(charge.id)} className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1A1A1A] text-white text-[11px] font-semibold">
                    <CreditCard className="w-3.5 h-3.5" /> Marcar pagado
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {courseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-4">{courseModal.mode === 'create' ? 'Crear curso' : 'Editar curso'}</h3>
            <div className="space-y-3">
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Nombre" value={courseForm.name} onChange={(e) => setCourseForm((f) => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={courseForm.sport} onChange={(e) => setCourseForm((f) => ({ ...f, sport: e.target.value as SchoolSport }))}>
                  <option value="padel">Padel</option>
                  <option value="tenis">Tenis</option>
                </select>
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={courseForm.level} onChange={(e) => setCourseForm((f) => ({ ...f, level: e.target.value as SchoolLevel }))}>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={courseForm.staff_id} onChange={(e) => setCourseForm((f) => ({ ...f, staff_id: e.target.value }))}>
                  <option value="">Selecciona staff</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={courseForm.court_id} onChange={(e) => setCourseForm((f) => ({ ...f, court_id: e.target.value }))}>
                  <option value="">Selecciona pista</option>
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="0.01" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Precio base" value={courseForm.price} onChange={(e) => setCourseForm((f) => ({ ...f, price: e.target.value }))} />
                <input type="number" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Capacidad" value={courseForm.capacity} onChange={(e) => setCourseForm((f) => ({ ...f, capacity: e.target.value }))} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-500 mb-1">Días recurrentes</p>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const active = courseForm.weekdays.includes(d.key);
                    return (
                      <button key={d.key} type="button" onClick={() => setCourseForm((f) => ({ ...f, weekdays: active ? f.weekdays.filter((x) => x !== d.key) : [...f.weekdays, d.key] }))} className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${active ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200'}`}>
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="time" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={courseForm.start_time} onChange={(e) => setCourseForm((f) => ({ ...f, start_time: e.target.value }))} />
                <input type="time" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={courseForm.end_time} onChange={(e) => setCourseForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={courseForm.starts_on} onChange={(e) => setCourseForm((f) => ({ ...f, starts_on: e.target.value }))} />
                <input type="date" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={courseForm.ends_on} onChange={(e) => setCourseForm((f) => ({ ...f, ends_on: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={() => setCourseModal(null)} className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700">Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void saveCourse()} className="px-3.5 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-bold disabled:opacity-50">{saving ? '...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {privateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-4">{privateModal.mode === 'create' ? 'Crear clase particular' : 'Editar clase particular'}</h3>
            <div className="space-y-3">
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Alumno" value={privateForm.student_name} onChange={(e) => setPrivateForm((f) => ({ ...f, student_name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Email" value={privateForm.student_email} onChange={(e) => setPrivateForm((f) => ({ ...f, student_email: e.target.value }))} />
                <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Teléfono" value={privateForm.student_phone} onChange={(e) => setPrivateForm((f) => ({ ...f, student_phone: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={privateForm.staff_id} onChange={(e) => setPrivateForm((f) => ({ ...f, staff_id: e.target.value }))}>
                  <option value="">Selecciona staff</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={privateForm.court_id} onChange={(e) => setPrivateForm((f) => ({ ...f, court_id: e.target.value }))}>
                  <option value="">Selecciona pista</option>
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" step="0.01" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Precio" value={privateForm.price} onChange={(e) => setPrivateForm((f) => ({ ...f, price: e.target.value }))} />
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={privateForm.weekday} onChange={(e) => setPrivateForm((f) => ({ ...f, weekday: e.target.value as SchoolWeekday }))}>
                  {WEEKDAYS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
                <div className="flex items-center text-[10px] text-gray-500 font-semibold px-2">
                  Horario y fechas
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="time" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={privateForm.start_time} onChange={(e) => setPrivateForm((f) => ({ ...f, start_time: e.target.value }))} />
                <input type="time" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={privateForm.end_time} onChange={(e) => setPrivateForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={privateForm.starts_on} onChange={(e) => setPrivateForm((f) => ({ ...f, starts_on: e.target.value }))} />
                <input type="date" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={privateForm.ends_on} onChange={(e) => setPrivateForm((f) => ({ ...f, ends_on: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={() => setPrivateModal(null)} className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700">Cancelar</button>
              <button
                type="button"
                onClick={() => void savePrivate()}
                disabled={savingPrivate}
                className="px-3.5 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingPrivate ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {enrollmentsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-gray-200 p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-4">Alumnos · {enrollmentsModal.name}</h3>
            <div className="grid md:grid-cols-4 gap-2 mb-3">
              <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Nombre" value={newEnrollment.student_name} onChange={(e) => setNewEnrollment((p) => ({ ...p, student_name: e.target.value }))} />
              <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Email" value={newEnrollment.student_email} onChange={(e) => setNewEnrollment((p) => ({ ...p, student_email: e.target.value }))} />
              <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Teléfono" value={newEnrollment.student_phone} onChange={(e) => setNewEnrollment((p) => ({ ...p, student_phone: e.target.value }))} />
              <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Cuota EUR" value={newEnrollment.fee} onChange={(e) => setNewEnrollment((p) => ({ ...p, fee: e.target.value }))} />
            </div>
            <button
              onClick={() => void addEnrollment()}
              disabled={addingEnrollment}
              className="mb-4 px-3 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {addingEnrollment ? 'Agregando...' : 'Agregar alumno'}
            </button>
            <div className="space-y-2">
              {enrollments.map((enrollment) => (
                <div key={enrollment.id} className="rounded-xl border border-gray-200 p-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[#1A1A1A]">{fullName(enrollment)}</p>
                    <p className="text-[10px] text-gray-500">{enrollment.student_email || enrollment.player?.email || '-'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={(enrollment.fee_cents / 100).toFixed(2)}
                      onBlur={(e) => void updateEnrollmentFee(enrollment, e.target.value)}
                      className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => void cancelEnrollment(enrollment.id)}
                      disabled={deletingEnrollmentId !== null}
                      className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      title={deletingEnrollmentId === enrollment.id ? 'Eliminando...' : 'Eliminar alumno'}
                    >
                      {deletingEnrollmentId === enrollment.id ? (
                        <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button type="button" onClick={() => setEnrollmentsModal(null)} className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
