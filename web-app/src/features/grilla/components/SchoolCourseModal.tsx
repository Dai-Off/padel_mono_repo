import { useEffect, useMemo, useState } from 'react';
import { X, Users, GraduationCap, Calendar, Award } from 'lucide-react';
import { toast } from 'sonner';
import type { SchoolCourse } from '../../../types/schoolCourses';
import { schoolCoursesService } from '../../../services/schoolCourses';

type Props = {
  isOpen: boolean;
  courseId: string | null;
  onClose: () => void;
};

const WEEKDAY_LABEL: Record<string, string> = {
  mon: 'L',
  tue: 'M',
  wed: 'X',
  thu: 'J',
  fri: 'V',
  sat: 'S',
  sun: 'D',
};

function formatDays(course: SchoolCourse): string {
  const days = course.days ?? [];
  if (!days.length) return '-';
  // Group by same time range (common case: one start/end with multiple weekdays)
  const grouped = new Map<string, Set<string>>();
  for (const d of days) {
    const key = `${d.start_time}-${d.end_time}`;
    const set = grouped.get(key) ?? new Set<string>();
    set.add(WEEKDAY_LABEL[d.weekday] ?? d.weekday);
    grouped.set(key, set);
  }
  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([range, set]) => `${Array.from(set).join('')} ${range}`)
    .join(' · ');
}

export function SchoolCourseModal({ isOpen, courseId, onClose }: Props) {
  const [course, setCourse] = useState<SchoolCourse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !courseId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const c = await schoolCoursesService.getById(courseId);
        if (!cancelled) setCourse(c);
      } catch (e) {
        toast.error((e as Error).message || 'Error al cargar curso');
        if (!cancelled) setCourse(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, courseId]);

  const subtitle = useMemo(() => {
    if (!course) return '';
    return `${course.sport.toUpperCase()} · ${course.level}`;
  }, [course]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 transition-opacity duration-300"
      onClick={onClose}
    >
      <div
        className="relative w-full h-[90vh] bg-gray-50 rounded-t-3xl shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-[900px] sm:rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 bg-white border-b border-gray-100 shrink-0">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-gray-900 leading-tight">Curso</h2>
            {course ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-0.5 bg-[#006A6A] text-white text-sm font-bold rounded-md uppercase tracking-wide">
                  {course.sport.toUpperCase()}
                </span>
                <span className="text-sm font-bold text-gray-800">{subtitle}</span>
              </div>
            ) : (
              <span className="text-sm font-bold text-gray-500">Cargando...</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 transition-colors bg-gray-100 rounded-full hover:bg-gray-200 hover:text-gray-600 flex-shrink-0"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto hidden-scrollbar">
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 border-4 border-[#006A6A] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-bold text-gray-700">Cargando detalles...</span>
            </div>
          ) : course ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Resumen</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-gray-500 font-bold flex items-center gap-2">
                      <GraduationCap className="w-4 h-4" />
                      Nombre
                    </span>
                    <span className="text-gray-900 font-bold">{course.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-gray-500 font-bold flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Alumnos
                    </span>
                    <span className="text-gray-900 font-bold">
                      {course.enrolled_count}/{course.capacity}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-gray-500 font-bold flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      Staff
                    </span>
                    <span className="text-gray-900 font-bold">{course.staff_name ?? '-'}</span>
                  </div>
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-gray-500 font-bold flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Días
                    </span>
                    <span className="text-gray-900 font-bold">{formatDays(course)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-gray-500 font-bold">Pista</span>
                    <span className="text-gray-900 font-bold">{course.court_name ?? '-'}</span>
                  </div>
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-gray-500 font-bold">Precio</span>
                    <span className="text-gray-900 font-bold">EUR {(course.price_cents / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Disponibilidad</h3>
                <div className="space-y-2 text-[13px] text-gray-700">
                  <p>
                    Se bloquea la pista en la grilla según los días/horarios del curso para las fechas dentro de su rango.
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 font-bold">Inicio</span>
                    <span className="font-bold">{course.starts_on ?? '-'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 font-bold">Fin</span>
                    <span className="font-bold">{course.ends_on ?? '-'}</span>
                  </div>
                </div>
                <div className="mt-4 text-[12px] text-gray-500">
                  Para gestionar inscripciones o editar el curso, usá “Gestion escuela” en el menú.
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-500 text-sm">
              No se encontró el curso.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

