import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Users, GraduationCap, CreditCard, AlertTriangle, List } from 'lucide-react';
import { toast } from 'sonner';
import { schoolCoursesService } from '../../services/schoolCourses';
import { clubStaffService } from '../../services/clubStaff';
import { courtService } from '../../services/court';
import type {
  SchoolCourse,
  SchoolCourseInstallment,
  SchoolLevel,
  SchoolSport,
  SchoolWeekday,
  SchoolEnrollment,
  SchoolPrivateLesson,
  SchoolFeeRule,
  SchoolCharge,
  SchoolPriceType,
} from '../../types/schoolCourses';
import type { ClubStaffMember } from '../../types/clubStaff';
import type { Court } from '../../types/court';
import type { Player } from '../../types/api';
import { PlayerSearch } from '../../features/grilla/components/ReservationModal';
import { isSchoolCoachRole } from '../../lib/schoolStaffRoles';

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

type MainTab = 'courses' | 'private' | 'tariffs' | 'fees' | 'debts';

type CourseFormState = {
  name: string;
  sport: SchoolSport;
  level: SchoolLevel;
  staff_id: string;
  court_id: string;
  price_type_id: string;
  capacity: string;
  weekdays: SchoolWeekday[];
  start_time: string;
  end_time: string;
  starts_on: string;
  ends_on: string;
  installments: SchoolCourseInstallment[];
};

type PrivateFormState = {
  student_name: string;
  student_email: string;
  student_phone: string;
  staff_id: string;
  court_id: string;
  student_count: '1' | '2' | '3';
  fee_rule_id: string;
  weekday: SchoolWeekday;
  start_time: string;
  end_time: string;
  starts_on: string;
  ends_on: string;
};

function resolveTimeBand(weekday: SchoolWeekday, startTime: string): 'morning' | 'afternoon' | 'weekend' {
  if (weekday === 'sat' || weekday === 'sun') return 'weekend';
  const hour = Number(startTime.slice(0, 2));
  return Number.isFinite(hour) && hour < 14 ? 'morning' : 'afternoon';
}

function feeRuleLabel(
  rule: SchoolFeeRule,
  staffById: Map<string, string>,
): string {
  const band = TIME_BANDS.find((b) => b.key === rule.time_band)?.label ?? rule.time_band;
  const who = rule.staff_id ? staffById.get(rule.staff_id) ?? 'Profesor' : 'General club';
  return `${who} · ${rule.group_size} alumno${rule.group_size > 1 ? 's' : ''} · ${band}`;
}

function feeRuleOptionLabel(rule: SchoolFeeRule, staffById: Map<string, string>): string {
  const band = TIME_BANDS.find((b) => b.key === rule.time_band)?.label ?? rule.time_band;
  const who = rule.staff_id ? staffById.get(rule.staff_id) ?? 'Profesor' : 'General';
  return `${who} · ${rule.group_size} alum. · ${band} · ${(rule.price_cents / 100).toFixed(2)} €`;
}

function feeRulesForPrivateChoice(
  rules: SchoolFeeRule[],
  staffId: string,
  studentCount: 1 | 2 | 3,
): SchoolFeeRule[] {
  if (!staffId) return [];
  const staffRules = rules.filter((r) => r.staff_id === staffId && r.group_size === studentCount);
  const generalRules = rules.filter((r) => !r.staff_id && r.group_size === studentCount);
  return [...staffRules, ...generalRules];
}

function findFeeRuleIdForLesson(rules: SchoolFeeRule[], lesson: SchoolPrivateLesson): string {
  const count = (lesson.student_count ?? 1) as 1 | 2 | 3;
  const matches = rules.filter(
    (r) =>
      r.group_size === count &&
      r.price_cents === lesson.price_cents &&
      (!r.staff_id || r.staff_id === lesson.staff_id),
  );
  const staffRule = matches.find((r) => r.staff_id === lesson.staff_id);
  return (staffRule ?? matches[0])?.id ?? '';
}

type UsageListItem = { id: string; primary: string; secondary?: string };

type ConfirmDialogState = {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
} | null;

type UsageModalState = {
  title: string;
  subtitle: string;
  emptyText: string;
  items: UsageListItem[];
} | null;

function lessonMatchesTimeBand(lesson: SchoolPrivateLesson, timeBand: string): boolean {
  return resolveTimeBand(lesson.weekday, lesson.start_time) === timeBand;
}

function coursesForPriceType(courses: SchoolCourse[], priceTypeId: string): SchoolCourse[] {
  return courses.filter((c) => c.price_type_id === priceTypeId);
}

function privateLessonsForStaffFeeRule(
  lessons: SchoolPrivateLesson[],
  staffId: string,
  groupSize: number,
  timeBand: string,
): SchoolPrivateLesson[] {
  return lessons.filter(
    (l) =>
      l.staff_id === staffId &&
      (l.student_count ?? 1) === groupSize &&
      lessonMatchesTimeBand(l, timeBand),
  );
}

function privateLessonsForDefaultFeeRule(
  lessons: SchoolPrivateLesson[],
  feeRules: SchoolFeeRule[],
  groupSize: number,
  timeBand: string,
): SchoolPrivateLesson[] {
  return lessons.filter((l) => {
    if ((l.student_count ?? 1) !== groupSize) return false;
    if (!lessonMatchesTimeBand(l, timeBand)) return false;
    const hasStaffOverride = feeRules.some(
      (r) => r.staff_id === l.staff_id && r.group_size === groupSize && r.time_band === timeBand,
    );
    return !hasStaffOverride;
  });
}

function SchoolConfirmDialog({
  state,
  loading,
  onCancel,
  onConfirm,
}: {
  state: ConfirmDialogState;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!state) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white border border-gray-200 p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="school-confirm-title"
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
            state.danger ? 'bg-red-50' : 'bg-gray-100'
          }`}
        >
          <AlertTriangle className={`w-5 h-5 ${state.danger ? 'text-red-500' : 'text-gray-600'}`} />
        </div>
        <h3 id="school-confirm-title" className="text-sm font-bold text-[#1A1A1A]">
          {state.title}
        </h3>
        <p className="text-xs text-gray-600 mt-2 leading-relaxed">{state.description}</p>
        <div className="flex gap-2 justify-end mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 ${
              state.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1A1A1A] hover:bg-black'
            }`}
          >
            {loading ? '...' : state.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SchoolUsageModal({
  state,
  onClose,
}: {
  state: UsageModalState;
  onClose: () => void;
}) {
  if (!state) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 p-5 shadow-xl max-h-[85vh] flex flex-col">
        <h3 className="text-sm font-bold text-[#1A1A1A]">{state.title}</h3>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{state.subtitle}</p>
        <div className="mt-4 flex-1 overflow-y-auto space-y-2 min-h-0">
          {state.items.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">{state.emptyText}</p>
          ) : (
            state.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5">
                <p className="text-xs font-semibold text-[#1A1A1A]">{item.primary}</p>
                {item.secondary ? <p className="text-[10px] text-gray-500 mt-0.5">{item.secondary}</p> : null}
              </div>
            ))
          )}
        </div>
        {state.items.length > 0 ? (
          <p className="text-[10px] text-gray-400 mt-3">
            {state.items.length} registro{state.items.length === 1 ? '' : 's'} afectado
            {state.items.length === 1 ? '' : 's'}
          </p>
        ) : null}
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const emptyCourseForm: CourseFormState = {
  name: '',
  sport: 'padel',
  level: 'Principiante',
  staff_id: '',
  court_id: '',
  price_type_id: '',
  capacity: '8',
  installments: [],
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
  student_count: '1',
  fee_rule_id: '',
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
  const [priceTypes, setPriceTypes] = useState<SchoolPriceType[]>([]);
  const [newPriceTypeName, setNewPriceTypeName] = useState('');
  const [newPriceTypePrice, setNewPriceTypePrice] = useState('');
  const [newFeeStaffId, setNewFeeStaffId] = useState('');
  const [newFeeGroupSize, setNewFeeGroupSize] = useState<'1' | '2' | '3' | '4'>('2');
  const [newFeeBand, setNewFeeBand] = useState<'' | 'morning' | 'afternoon' | 'weekend'>('');
  const [newFeePrice, setNewFeePrice] = useState('');
  const [newGeneralGroupSize, setNewGeneralGroupSize] = useState<'1' | '2' | '3' | '4'>('2');
  const [newGeneralBand, setNewGeneralBand] = useState<'' | 'morning' | 'afternoon' | 'weekend'>('');
  const [newGeneralPrice, setNewGeneralPrice] = useState('');
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
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [addingEnrollment, setAddingEnrollment] = useState(false);
  const [deletingEnrollmentId, setDeletingEnrollmentId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [usageModal, setUsageModal] = useState<UsageModalState>(null);

  const loadCore = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const [courseRows, staffRows, courtRows, privateRows, feeRows, tariffRows, debtRows] = await Promise.all([
        schoolCoursesService.list(clubId),
        clubStaffService.list(clubId),
        courtService.getAll(clubId),
        schoolCoursesService.listPrivateLessons(clubId),
        schoolCoursesService.listFeeRules(clubId),
        schoolCoursesService.listPriceTypes(clubId),
        schoolCoursesService.listCharges(clubId, { status: 'pending' }),
      ]);
      setCourses(courseRows);
      setStaff(staffRows.filter((s) => s.status === 'active'));
      setCourts(courtRows);
      setPrivateLessons(privateRows);
      setFeeRules(feeRows.filter((x) => x.is_active));
      setPriceTypes(tariffRows.filter((x) => x.is_active));
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

  const coachStaff = useMemo(() => staff.filter((s) => isSchoolCoachRole(s.role)), [staff]);

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
      staff_id: coachStaff[0]?.id ?? '',
      court_id: courts[0]?.id ?? '',
      price_type_id: priceTypes[0]?.id ?? '',
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
      price_type_id: course.price_type_id ?? priceTypes[0]?.id ?? '',
      capacity: String(course.capacity ?? 8),
      weekdays: (course.days ?? []).map((d) => d.weekday),
      start_time: course.days?.[0]?.start_time ?? '19:00',
      end_time: course.days?.[0]?.end_time ?? '20:00',
      starts_on: course.starts_on ?? '',
      ends_on: course.ends_on ?? '',
      installments: course.installments ?? [],
    });
    setCourseModal({ mode: 'edit', course });
  };

  const saveCourse = async () => {
    if (!clubId) return;
    const capValue = Number(courseForm.capacity);
    if (!courseForm.name.trim()) return toast.error('Nombre obligatorio');
    if (!courseForm.staff_id || !courseForm.court_id) return toast.error('Entrenador y pista obligatorios');
    if (!isSchoolCoachRole(staff.find((s) => s.id === courseForm.staff_id)?.role)) {
      return toast.error('Solo puedes asignar cursos a entrenadores');
    }
    if (!courseForm.weekdays.length) return toast.error('Selecciona al menos un día');
    if (!courseForm.price_type_id) return toast.error('Selecciona un tipo de precio');
    if (!Number.isFinite(capValue) || capValue <= 0) return toast.error('Capacidad inválida');

    const installmentsPayload = courseForm.installments
      .filter((i) => i.due_date && i.amount_cents >= 0)
      .map((i, idx) => ({
        label: i.label,
        amount_cents: Math.round(i.amount_cents),
        due_date: i.due_date,
        sort_order: idx,
      }));

    setSaving(true);
    try {
      const body = {
        name: courseForm.name.trim(),
        sport: courseForm.sport,
        level: courseForm.level,
        staff_id: courseForm.staff_id,
        court_id: courseForm.court_id,
        price_type_id: courseForm.price_type_id,
        capacity: Math.round(capValue),
        weekdays: courseForm.weekdays,
        start_time: courseForm.start_time,
        end_time: courseForm.end_time,
        starts_on: courseForm.starts_on || null,
        ends_on: courseForm.ends_on || null,
        installments: installmentsPayload,
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

  const requestRemoveCourse = (course: SchoolCourse) => {
    setConfirmDialog({
      title: 'Eliminar curso',
      description: `¿Seguro que quieres eliminar «${course.name}»? Se borrarán inscripciones y datos asociados. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar curso',
      danger: true,
      onConfirm: async () => {
        await schoolCoursesService.remove(course.id);
        await loadCore();
        toast.success('Curso eliminado');
      },
    });
  };

  const openEnrollments = async (course: SchoolCourse) => {
    setEnrollmentsModal(course);
    setNewEnrollment({ student_name: '', student_email: '', student_phone: '', fee: '' });
    setSelectedPlayer(null);
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

    let payload: {
      player_id?: string | null;
      student_name?: string | null;
      student_email?: string | null;
      student_phone?: string | null;
      fee_cents?: number;
    } = {};

    if (selectedPlayer) {
      payload = {
        player_id: selectedPlayer.id,
        // Fallback textual info in case it is queried without joins:
        student_name: `${selectedPlayer.first_name} ${selectedPlayer.last_name}`.trim(),
        student_email: selectedPlayer.email,
        student_phone: selectedPlayer.phone,
      };
    } else {
      if (!newEnrollment.student_name.trim() && !newEnrollment.student_email.trim()) {
        return toast.error('Nombre o email obligatorio');
      }
      payload = {
        student_name: newEnrollment.student_name.trim() || null,
        student_email: newEnrollment.student_email.trim() || null,
        student_phone: newEnrollment.student_phone.trim() || null,
      };
    }

    // Default to the predefined course price
    payload.fee_cents = enrollmentsModal.price_cents;

    setAddingEnrollment(true);
    try {
      await schoolCoursesService.createEnrollment(enrollmentsModal.id, payload);
      const rows = await schoolCoursesService.listEnrollments(enrollmentsModal.id);
      setEnrollments(rows.filter((x) => x.status !== 'cancelled'));
      await loadCore();
      setNewEnrollment({ student_name: '', student_email: '', student_phone: '', fee: '' });
      setSelectedPlayer(null);
      toast.success('Alumno agregado correctamente');
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
      staff_id: coachStaff[0]?.id ?? '',
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
      student_count: String(lesson.student_count ?? 1) as '1' | '2' | '3',
      fee_rule_id: findFeeRuleIdForLesson(feeRules, lesson),
      weekday: lesson.weekday,
      start_time: lesson.start_time,
      end_time: lesson.end_time,
      starts_on: lesson.starts_on ?? '',
      ends_on: lesson.ends_on ?? '',
    });
    setPrivateModal({ mode: 'edit', lesson });
  };

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  const runConfirm = async () => {
    if (!confirmDialog) return;
    setConfirmLoading(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  const showUsagePriceType = (pt: SchoolPriceType) => {
    const linked = coursesForPriceType(courses, pt.id);
    setUsageModal({
      title: `Cursos con tarifa «${pt.name}»`,
      subtitle: 'Al cambiar el precio de esta tarifa, el importe de estos cursos se actualiza automáticamente.',
      emptyText: 'Ningún curso usa esta tarifa.',
      items: linked.map((c) => ({
        id: c.id,
        primary: c.name,
        secondary: `${c.level} · ${c.enrolled_count}/${c.capacity} alumnos · ${(c.price_cents / 100).toFixed(2)} €`,
      })),
    });
  };

  const showUsageStaffFeeRule = (rule: SchoolFeeRule) => {
    const staffId = rule.staff_id ?? '';
    const bandLabel = TIME_BANDS.find((b) => b.key === rule.time_band)?.label ?? rule.time_band;
    const staffName = staffById.get(staffId) ?? 'Profesor';
    const linked = privateLessonsForStaffFeeRule(
      privateLessons,
      staffId,
      rule.group_size,
      rule.time_band,
    );
    setUsageModal({
      title: `Clases de ${staffName}`,
      subtitle: `Particulares con ${rule.group_size} alumno${rule.group_size > 1 ? 's' : ''} en franja ${bandLabel}. Al cambiar la cuota, conviene revisar o re-guardar estas clases.`,
      emptyText: 'Ninguna clase particular coincide con esta tarifa.',
      items: linked.map((l) => ({
        id: l.id,
        primary: l.student_name || l.student_email || 'Alumno',
        secondary: `${WEEKDAYS.find((w) => w.key === l.weekday)?.label} ${l.start_time}-${l.end_time} · ${(l.price_cents / 100).toFixed(2)} €`,
      })),
    });
  };

  const showUsageDefaultFeeRule = (groupSize: 1 | 2 | 3 | 4, timeBand: 'morning' | 'afternoon' | 'weekend') => {
    const bandLabel = TIME_BANDS.find((b) => b.key === timeBand)?.label ?? timeBand;
    const linked = privateLessonsForDefaultFeeRule(privateLessons, feeRules, groupSize, timeBand);
    setUsageModal({
      title: `Tarifa general · ${groupSize} alumno${groupSize > 1 ? 's' : ''} · ${bandLabel}`,
      subtitle:
        'Clases que usan la tarifa del club (el profesor no tiene cuota propia para este tamaño y franja).',
      emptyText: 'Ninguna clase particular usa esta tarifa general.',
      items: linked.map((l) => ({
        id: l.id,
        primary: l.student_name || l.student_email || 'Alumno',
        secondary: `${staffById.get(l.staff_id) ?? 'Profesor'} · ${WEEKDAYS.find((w) => w.key === l.weekday)?.label} ${l.start_time}-${l.end_time}`,
      })),
    });
  };

  const defaultFeeRules = useMemo(() => feeRules.filter((r) => !r.staff_id), [feeRules]);
  const staffFeeRules = useMemo(() => feeRules.filter((r) => r.staff_id), [feeRules]);

  const privateFeeOptions = useMemo(() => {
    const count = Number(privateForm.student_count) as 1 | 2 | 3;
    return feeRulesForPrivateChoice(feeRules, privateForm.staff_id, count);
  }, [feeRules, privateForm.staff_id, privateForm.student_count]);

  const selectedPrivateFeeRule = useMemo(
    () => feeRules.find((r) => r.id === privateForm.fee_rule_id) ?? null,
    [feeRules, privateForm.fee_rule_id],
  );

  const savePrivate = async () => {
    if (!clubId) return;
    if (savingPrivate) return;
    if (!privateForm.staff_id || !privateForm.court_id) return toast.error('Entrenador y pista obligatorios');
    if (!isSchoolCoachRole(staff.find((s) => s.id === privateForm.staff_id)?.role)) {
      return toast.error('Solo puedes asignar clases a entrenadores');
    }
    if (!selectedPrivateFeeRule) {
      return toast.error('Selecciona la tarifa que aplica a esta clase');
    }

    setSavingPrivate(true);
    try {
      const payload = {
        club_id: clubId,
        student_name: privateForm.student_name || null,
        student_email: privateForm.student_email || null,
        student_phone: privateForm.student_phone || null,
        staff_id: privateForm.staff_id,
        court_id: privateForm.court_id,
        student_count: Number(privateForm.student_count) as 1 | 2 | 3,
        price_cents: selectedPrivateFeeRule.price_cents,
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

  const requestRemovePrivate = (lesson: SchoolPrivateLesson) => {
    const label = lesson.student_name || lesson.student_email || 'esta clase';
    setConfirmDialog({
      title: 'Eliminar clase particular',
      description: `¿Seguro que quieres eliminar la clase de «${label}»? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar clase',
      danger: true,
      onConfirm: async () => {
        await schoolCoursesService.removePrivateLesson(lesson.id);
        await loadCore();
        toast.success('Clase eliminada');
      },
    });
  };

  const addPriceType = async () => {
    if (!clubId) return;
    const name = newPriceTypeName.trim();
    const euros = Number(newPriceTypePrice);
    if (!name) return toast.error('Nombre obligatorio');
    if (!Number.isFinite(euros) || euros < 0) return toast.error('Precio inválido');
    try {
      await schoolCoursesService.createPriceType({ club_id: clubId, name, price_cents: Math.round(euros * 100) });
      setNewPriceTypeName('');
      setNewPriceTypePrice('');
      await loadCore();
      toast.success('Tarifa creada');
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo crear tarifa');
    }
  };

  const updatePriceTypePrice = async (pt: SchoolPriceType, euros: string) => {
    const value = Number(euros);
    if (!Number.isFinite(value) || value < 0) return toast.error('Precio inválido');
    try {
      await schoolCoursesService.updatePriceType(pt.id, { price_cents: Math.round(value * 100) });
      await loadCore();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo actualizar tarifa');
    }
  };

  const requestRemovePriceType = (pt: SchoolPriceType) => {
    const linked = coursesForPriceType(courses, pt.id);
    setConfirmDialog({
      title: 'Eliminar tarifa de curso',
      description:
        linked.length > 0
          ? `«${pt.name}» está asignada a ${linked.length} curso${linked.length === 1 ? '' : 's'}. Si la eliminas, esos cursos perderán la referencia a esta tarifa.`
          : `¿Eliminar la tarifa «${pt.name}»?`,
      confirmLabel: 'Eliminar tarifa',
      danger: true,
      onConfirm: async () => {
        await schoolCoursesService.removePriceType(pt.id);
        await loadCore();
        toast.success('Tarifa eliminada');
      },
    });
  };

  const upsertFee = async (
    groupSize: 1 | 2 | 3 | 4,
    timeBand: 'morning' | 'afternoon' | 'weekend',
    value: string,
    staffId?: string | null,
  ) => {
    if (!clubId) return;
    const euros = Number(value);
    if (!Number.isFinite(euros) || euros < 0) return toast.error('Cuota inválida');
    try {
      await schoolCoursesService.upsertFeeRule({
        club_id: clubId,
        staff_id: staffId || null,
        group_size: groupSize,
        time_band: timeBand,
        price_cents: Math.round(euros * 100),
      });
      await loadCore();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo guardar regla');
    }
  };

  const addGeneralFeeRule = async () => {
    if (!clubId) return;
    if (!newGeneralBand) return toast.error('Selecciona la franja horaria');
    const euros = Number(newGeneralPrice);
    if (!Number.isFinite(euros) || euros < 0) return toast.error('Indica un precio válido');
    try {
      await schoolCoursesService.upsertFeeRule({
        club_id: clubId,
        staff_id: null,
        group_size: Number(newGeneralGroupSize) as 1 | 2 | 3 | 4,
        time_band: newGeneralBand,
        price_cents: Math.round(euros * 100),
      });
      setNewGeneralPrice('');
      await loadCore();
      toast.success('Tarifa general guardada');
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo crear tarifa');
    }
  };

  const addStaffFeeRule = async () => {
    if (!clubId) return;
    if (!newFeeStaffId) return toast.error('Selecciona un entrenador');
    if (!newFeeBand) return toast.error('Selecciona la franja horaria');
    const euros = Number(newFeePrice);
    if (!Number.isFinite(euros) || euros < 0) return toast.error('Indica un precio válido');
    try {
      await schoolCoursesService.upsertFeeRule({
        club_id: clubId,
        staff_id: newFeeStaffId,
        group_size: Number(newFeeGroupSize) as 1 | 2 | 3 | 4,
        time_band: newFeeBand,
        price_cents: Math.round(euros * 100),
      });
      setNewFeePrice('');
      await loadCore();
      toast.success('Tarifa del profesor guardada');
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo crear tarifa');
    }
  };

  const requestRemoveFeeRule = (rule: SchoolFeeRule) => {
    const label = feeRuleLabel(rule, staffById);
    setConfirmDialog({
      title: 'Eliminar cuota',
      description: `¿Eliminar la cuota «${label}»? Las clases ya creadas conservan su precio actual hasta que las edites.`,
      confirmLabel: 'Eliminar cuota',
      danger: true,
      onConfirm: async () => {
        await schoolCoursesService.removeFeeRule(rule.id);
        await loadCore();
        toast.success('Cuota eliminada');
      },
    });
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
        <button className={`px-3 py-2 rounded-xl text-xs font-semibold ${tab === 'tariffs' ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200'}`} onClick={() => setTab('tariffs')}>Tarifas cursos</button>
        <button className={`px-3 py-2 rounded-xl text-xs font-semibold ${tab === 'fees' ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200'}`} onClick={() => setTab('fees')}>Cuotas particulares</button>
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
                      <button onClick={() => requestRemoveCourse(course)} className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-[10px] text-gray-500">
                    <p className="flex items-center gap-1"><GraduationCap className="w-3 h-3" /> Staff: {course.staff_name ?? '-'}</p>
                    <p className="flex items-center gap-1"><Users className="w-3 h-3" /> Alumnos: {course.enrolled_count}/{course.capacity}</p>
                    <p>Pista: {course.court_name ?? '-'}</p>
                    <p>Horario: {scheduleText(course) || '-'}</p>
                    <p>Tarifa: {course.price_type_name ?? '—'} · EUR {(course.price_cents / 100).toFixed(2)}</p>
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
                    <p className="text-[10px] text-gray-500">
                      {lesson.student_count ?? 1} alumno(s) · {WEEKDAYS.find((x) => x.key === lesson.weekday)?.label} {lesson.start_time}-{lesson.end_time}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openPrivateEdit(lesson)} className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50"><Edit className="w-3.5 h-3.5 text-gray-400" /></button>
                    <button onClick={() => requestRemovePrivate(lesson)} className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-gray-500">Precio: EUR {(lesson.price_cents / 100).toFixed(2)} · Desde {lesson.starts_on ?? '-'} hasta {lesson.ends_on ?? '-'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'tariffs' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
          <p className="text-xs font-bold text-[#1A1A1A]">Tipos de precio para cursos grupales</p>
          <p className="text-[10px] text-gray-500">Al cambiar una tarifa, todos los cursos que la usan actualizan su precio automáticamente.</p>
          <div className="grid md:grid-cols-[1fr_120px_auto] gap-2">
            <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Ej. Cursos grupales" value={newPriceTypeName} onChange={(e) => setNewPriceTypeName(e.target.value)} />
            <input type="number" step="0.01" className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="EUR/mes" value={newPriceTypePrice} onChange={(e) => setNewPriceTypePrice(e.target.value)} />
            <button type="button" onClick={() => void addPriceType()} className="rounded-xl bg-[#E31E24] px-4 py-2 text-xs font-bold text-white">Añadir</button>
          </div>
          <div className="space-y-2">
            {priceTypes.map((pt) => (
              <div key={pt.id} className="flex items-center gap-2 rounded-xl border border-gray-200 p-2">
                <span className="flex-1 text-xs font-semibold text-[#1A1A1A]">{pt.name}</span>
                <button
                  type="button"
                  title="Ver cursos afectados"
                  onClick={() => showUsagePriceType(pt)}
                  className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50 text-gray-500"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <input type="number" step="0.01" defaultValue={(pt.price_cents / 100).toFixed(2)} className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-xs" onBlur={(e) => void updatePriceTypePrice(pt, e.target.value)} />
                <button type="button" onClick={() => requestRemovePriceType(pt)} className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'fees' && (
        <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1A1A1A]">Tarifas generales</p>
          <p className="text-[10px] text-gray-500">
            Respaldo si el entrenador no tiene tarifa propia para ese tamaño y franja.
          </p>
          <div className="grid md:grid-cols-[90px_120px_100px_auto] gap-2 items-end">
            <select
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              value={newGeneralGroupSize}
              onChange={(e) => setNewGeneralGroupSize(e.target.value as '1' | '2' | '3' | '4')}
            >
              <option value="1">1 alum.</option>
              <option value="2">2 alum.</option>
              <option value="3">3 alum.</option>
              <option value="4">4 alum.</option>
            </select>
            <select
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              value={newGeneralBand}
              onChange={(e) => setNewGeneralBand(e.target.value as '' | 'morning' | 'afternoon' | 'weekend')}
            >
              <option value="">Franja</option>
              {TIME_BANDS.map((b) => (
                <option key={b.key} value={b.key}>{b.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="EUR"
              value={newGeneralPrice}
              onChange={(e) => setNewGeneralPrice(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void addGeneralFeeRule()}
              className="rounded-xl bg-[#1A1A1A] px-4 py-2 text-xs font-bold text-white whitespace-nowrap"
            >
              Añadir
            </button>
          </div>
          {defaultFeeRules.length === 0 ? (
            <p className="text-[10px] text-gray-400 py-1">Sin tarifas generales configuradas.</p>
          ) : (
            <div className="space-y-2">
              {defaultFeeRules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-2 rounded-xl border border-gray-200 p-2">
                  <span className="flex-1 text-xs font-semibold text-[#1A1A1A]">{feeRuleLabel(rule, staffById)}</span>
                  <button
                    type="button"
                    title="Ver clases afectadas"
                    onClick={() => showUsageDefaultFeeRule(rule.group_size as 1 | 2 | 3 | 4, rule.time_band)}
                    className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50 text-gray-500"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={(rule.price_cents / 100).toFixed(2)}
                    className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                    onBlur={(e) => void upsertFee(rule.group_size, rule.time_band, e.target.value, null)}
                  />
                  <button
                    type="button"
                    onClick={() => requestRemoveFeeRule(rule)}
                    className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {coachStaff.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1A1A1A]">Tarifas por entrenador</p>
          <p className="text-[10px] text-gray-500">
            Precios propios por número de alumnos y franja horaria.
          </p>
          <div className="grid md:grid-cols-[1fr_90px_120px_100px_auto] gap-2 items-end">
            <select
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              value={newFeeStaffId}
              onChange={(e) => setNewFeeStaffId(e.target.value)}
            >
              <option value="">Entrenador</option>
              {coachStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              value={newFeeGroupSize}
              onChange={(e) => setNewFeeGroupSize(e.target.value as '1' | '2' | '3' | '4')}
            >
              <option value="1">1 alum.</option>
              <option value="2">2 alum.</option>
              <option value="3">3 alum.</option>
              <option value="4">4 alum.</option>
            </select>
            <select
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              value={newFeeBand}
              onChange={(e) => setNewFeeBand(e.target.value as '' | 'morning' | 'afternoon' | 'weekend')}
            >
              <option value="">Franja</option>
              {TIME_BANDS.map((b) => (
                <option key={b.key} value={b.key}>{b.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="EUR"
              value={newFeePrice}
              onChange={(e) => setNewFeePrice(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void addStaffFeeRule()}
              className="rounded-xl bg-[#E31E24] px-4 py-2 text-xs font-bold text-white whitespace-nowrap"
            >
              Añadir
            </button>
          </div>
          {staffFeeRules.length === 0 ? (
            <p className="text-[10px] text-gray-400 py-2">Sin tarifas personalizadas por profesor.</p>
          ) : (
            <div className="space-y-2">
              {staffFeeRules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-2 rounded-xl border border-gray-200 p-2">
                  <span className="flex-1 text-xs font-semibold text-[#1A1A1A]">{feeRuleLabel(rule, staffById)}</span>
                  <button
                    type="button"
                    title="Ver clases afectadas"
                    onClick={() => showUsageStaffFeeRule(rule)}
                    className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-gray-50 text-gray-500"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={(rule.price_cents / 100).toFixed(2)}
                    className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                    onBlur={(e) =>
                      void upsertFee(rule.group_size, rule.time_band, e.target.value, rule.staff_id)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => requestRemoveFeeRule(rule)}
                    className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
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
                  <option value="">Entrenador</option>
                  {coachStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={courseForm.court_id} onChange={(e) => setCourseForm((f) => ({ ...f, court_id: e.target.value }))}>
                  <option value="">Selecciona pista</option>
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={courseForm.price_type_id} onChange={(e) => setCourseForm((f) => ({ ...f, price_type_id: e.target.value }))}>
                  <option value="">Tipo de precio</option>
                  {priceTypes.map((pt) => (
                    <option key={pt.id} value={pt.id}>{pt.name} — {(pt.price_cents / 100).toFixed(2)} €</option>
                  ))}
                </select>
                <div className="relative">
                  <input type="number" className="w-full rounded-xl border border-gray-200 px-3 py-2 pr-24 text-sm" placeholder="Capacidad" value={courseForm.capacity} onChange={(e) => setCourseForm((f) => ({ ...f, capacity: e.target.value }))} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">alumnos máx.</span>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-gray-600">Plan de cuotas (pagos)</p>
                  <button type="button" onClick={() => setCourseForm((f) => ({ ...f, installments: [...f.installments, { label: '', amount_cents: 0, due_date: '' }] }))} className="text-[10px] font-bold text-[#E31E24]">+ Añadir cuota</button>
                </div>
                {courseForm.installments.map((inst, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_90px_130px_auto] gap-2 items-center">
                    <input className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" placeholder="Concepto" value={inst.label ?? ''} onChange={(e) => setCourseForm((f) => { const next = [...f.installments]; next[idx] = { ...next[idx], label: e.target.value }; return { ...f, installments: next }; })} />
                    <input type="number" step="0.01" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" placeholder="EUR" defaultValue={inst.amount_cents ? (inst.amount_cents / 100).toFixed(2) : ''} onBlur={(e) => { const v = Number(e.target.value); if (!Number.isFinite(v) || v < 0) return; setCourseForm((f) => { const next = [...f.installments]; next[idx] = { ...next[idx], amount_cents: Math.round(v * 100) }; return { ...f, installments: next }; }); }} />
                    <input type="date" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={inst.due_date} onChange={(e) => setCourseForm((f) => { const next = [...f.installments]; next[idx] = { ...next[idx], due_date: e.target.value }; return { ...f, installments: next }; })} />
                    <button type="button" onClick={() => setCourseForm((f) => ({ ...f, installments: f.installments.filter((_, i) => i !== idx) }))} className="w-8 h-8 rounded-lg border border-gray-100 flex items-center justify-center hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                ))}
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
                <select
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={privateForm.staff_id}
                  onChange={(e) => {
                    const staffId = e.target.value;
                    const count = Number(privateForm.student_count) as 1 | 2 | 3;
                    const opts = feeRulesForPrivateChoice(feeRules, staffId, count);
                    setPrivateForm((f) => ({
                      ...f,
                      staff_id: staffId,
                      fee_rule_id: opts.some((o) => o.id === f.fee_rule_id) ? f.fee_rule_id : '',
                    }));
                  }}
                >
                  <option value="">Entrenador</option>
                  {coachStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={privateForm.court_id} onChange={(e) => setPrivateForm((f) => ({ ...f, court_id: e.target.value }))}>
                  <option value="">Selecciona pista</option>
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={privateForm.student_count}
                  onChange={(e) => {
                    const studentCount = e.target.value as '1' | '2' | '3';
                    const count = Number(studentCount) as 1 | 2 | 3;
                    const opts = feeRulesForPrivateChoice(feeRules, privateForm.staff_id, count);
                    setPrivateForm((f) => ({
                      ...f,
                      student_count: studentCount,
                      fee_rule_id: opts.some((o) => o.id === f.fee_rule_id) ? f.fee_rule_id : '',
                    }));
                  }}
                >
                  <option value="1">1 alumno</option>
                  <option value="2">2 alumnos</option>
                  <option value="3">3 alumnos</option>
                </select>
                <select
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={privateForm.fee_rule_id}
                  onChange={(e) => setPrivateForm((f) => ({ ...f, fee_rule_id: e.target.value }))}
                  disabled={!privateForm.staff_id || privateFeeOptions.length === 0}
                >
                  <option value="">
                    {!privateForm.staff_id
                      ? 'Elige entrenador'
                      : privateFeeOptions.length === 0
                        ? 'Sin tarifas'
                        : 'Tarifa'}
                  </option>
                  {privateFeeOptions.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {feeRuleOptionLabel(rule, staffById)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={privateForm.weekday} onChange={(e) => setPrivateForm((f) => ({ ...f, weekday: e.target.value as SchoolWeekday }))}>
                  {WEEKDAYS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
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
            <div className="mb-4 space-y-4">
              <PlayerSearch
                label="Buscar alumno registrado"
                placeholder="Buscar por nombre, email o teléfono..."
                selectedPlayer={selectedPlayer}
                onSelect={setSelectedPlayer}
              />

              {!selectedPlayer && (
                <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
                  <p className="text-xs font-semibold text-gray-500">¿No está en la base de datos? Registro manual:</p>
                  <div className="grid md:grid-cols-3 gap-2">
                    <input
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                      placeholder="Nombre completo"
                      value={newEnrollment.student_name}
                      onChange={(e) => setNewEnrollment((p) => ({ ...p, student_name: e.target.value }))}
                    />
                    <input
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                      placeholder="Email (opcional)"
                      value={newEnrollment.student_email}
                      onChange={(e) => setNewEnrollment((p) => ({ ...p, student_email: e.target.value }))}
                    />
                    <input
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                      placeholder="Teléfono (opcional)"
                      value={newEnrollment.student_phone}
                      onChange={(e) => setNewEnrollment((p) => ({ ...p, student_phone: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gray-50/50 rounded-xl border border-gray-100/50">
                <span className="text-xs text-gray-600 font-medium">
                  Cuota mensual predefinida: <strong className="text-gray-900">{(enrollmentsModal.price_cents / 100).toFixed(2)} €</strong>
                </span>
                <button
                  onClick={() => void addEnrollment()}
                  disabled={addingEnrollment}
                  className="px-4 py-2 rounded-xl bg-[#E31E24] text-white text-xs font-bold hover:bg-[#c1151a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {addingEnrollment ? 'Agregando...' : 'Agregar alumno'}
                </button>
              </div>
            </div>
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

      <SchoolConfirmDialog
        state={confirmDialog}
        loading={confirmLoading}
        onCancel={() => !confirmLoading && setConfirmDialog(null)}
        onConfirm={() => void runConfirm()}
      />
      <SchoolUsageModal state={usageModal} onClose={() => setUsageModal(null)} />
    </div>
  );
}
