import { apiFetchWithAuth } from './api';
import type {
  SchoolCourse,
  SchoolCourseInstallment,
  SchoolLevel,
  SchoolSport,
  SchoolWeekday,
  SchoolCourseSlot,
  SchoolEnrollment,
  SchoolPrivateLesson,
  SchoolPrivateLessonSlot,
  SchoolFeeRule,
  SchoolCharge,
  SchoolPriceType,
} from '../types/schoolCourses';

type ApiOk<T> = T & { ok: true };

export const schoolCoursesService = {
  async list(clubId: string, filters?: { sport?: SchoolSport | 'all'; level?: SchoolLevel | 'all' }): Promise<SchoolCourse[]> {
    const q = new URLSearchParams({ club_id: clubId });
    if (filters?.sport && filters.sport !== 'all') q.set('sport', filters.sport);
    if (filters?.level && filters.level !== 'all') q.set('level', filters.level);
    const res = await apiFetchWithAuth<ApiOk<{ courses: SchoolCourse[] }>>(`/school-courses?${q}`);
    return res.courses ?? [];
  },

  async create(body: {
    club_id: string;
    name: string;
    sport: SchoolSport;
    level: SchoolLevel;
    staff_id: string;
    court_id: string;
    price_cents?: number;
    price_type_id?: string | null;
    capacity: number;
    weekdays: SchoolWeekday[];
    start_time: string;
    end_time: string;
    starts_on?: string | null;
    ends_on?: string | null;
    is_active?: boolean;
    installments?: SchoolCourseInstallment[];
  }): Promise<SchoolCourse> {
    const res = await apiFetchWithAuth<ApiOk<{ course: SchoolCourse }>>('/school-courses', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.course;
  },

  async update(
    id: string,
    body: Partial<{
      name: string;
      sport: SchoolSport;
      level: SchoolLevel;
      staff_id: string;
      court_id: string;
      price_cents: number;
      price_type_id: string | null;
      capacity: number;
      weekdays: SchoolWeekday[];
      start_time: string;
      end_time: string;
      starts_on: string | null;
      ends_on: string | null;
      is_active: boolean;
      installments: SchoolCourseInstallment[];
    }>
  ): Promise<SchoolCourse> {
    const res = await apiFetchWithAuth<ApiOk<{ course: SchoolCourse }>>(`/school-courses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return res.course;
  },

  async getById(id: string): Promise<SchoolCourse> {
    const res = await apiFetchWithAuth<ApiOk<{ course: SchoolCourse }>>(`/school-courses/${id}`);
    return res.course;
  },

  async remove(id: string): Promise<void> {
    await apiFetchWithAuth(`/school-courses/${id}`, { method: 'DELETE' });
  },

  async slots(clubId: string, date: string): Promise<SchoolCourseSlot[]> {
    const q = new URLSearchParams({ club_id: clubId, date });
    const res = await apiFetchWithAuth<ApiOk<{ slots: SchoolCourseSlot[] }>>(`/school-courses/slots?${q}`);
    return res.slots ?? [];
  },

  async listEnrollments(courseId: string): Promise<SchoolEnrollment[]> {
    const res = await apiFetchWithAuth<ApiOk<{ enrollments: SchoolEnrollment[] }>>(`/school-courses/${courseId}/enrollments`);
    return res.enrollments ?? [];
  },

  async createEnrollment(courseId: string, body: {
    player_id?: string | null;
    student_name?: string | null;
    student_email?: string | null;
    student_phone?: string | null;
    fee_cents?: number;
  }): Promise<SchoolEnrollment> {
    const res = await apiFetchWithAuth<ApiOk<{ enrollment: SchoolEnrollment }>>(`/school-courses/${courseId}/enrollments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.enrollment;
  },

  async updateEnrollment(courseId: string, enrollmentId: string, body: Partial<{
    student_name: string | null;
    student_email: string | null;
    student_phone: string | null;
    fee_cents: number;
    status: 'active' | 'cancelled';
  }>): Promise<SchoolEnrollment> {
    const res = await apiFetchWithAuth<ApiOk<{ enrollment: SchoolEnrollment }>>(
      `/school-courses/${courseId}/enrollments/${enrollmentId}`,
      { method: 'PUT', body: JSON.stringify(body) }
    );
    return res.enrollment;
  },

  async cancelEnrollment(courseId: string, enrollmentId: string): Promise<void> {
    await apiFetchWithAuth(`/school-courses/${courseId}/enrollments/${enrollmentId}`, { method: 'DELETE' });
  },

  async listPrivateLessons(clubId: string): Promise<SchoolPrivateLesson[]> {
    const q = new URLSearchParams({ club_id: clubId });
    const res = await apiFetchWithAuth<ApiOk<{ lessons: SchoolPrivateLesson[] }>>(`/school-private-lessons?${q}`);
    return res.lessons ?? [];
  },

  async createPrivateLesson(body: {
    club_id: string;
    student_player_id?: string | null;
    student_name?: string | null;
    student_email?: string | null;
    student_phone?: string | null;
    staff_id: string;
    court_id?: string;
    court_ids?: string[];
    students?: Array<{ name?: string | null; email?: string | null; phone?: string | null; player_id?: string | null }>;
    price_cents?: number;
    student_count?: 1 | 2 | 3 | 4;
    weekday: SchoolWeekday;
    start_time: string;
    end_time: string;
    starts_on?: string | null;
    ends_on?: string | null;
    is_active?: boolean;
  }): Promise<SchoolPrivateLesson> {
    const res = await apiFetchWithAuth<ApiOk<{ lesson: SchoolPrivateLesson }>>('/school-private-lessons', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.lesson;
  },

  async updatePrivateLesson(id: string, body: Partial<SchoolPrivateLesson>): Promise<SchoolPrivateLesson> {
    const res = await apiFetchWithAuth<ApiOk<{ lesson: SchoolPrivateLesson }>>(`/school-private-lessons/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return res.lesson;
  },

  async removePrivateLesson(id: string): Promise<void> {
    await apiFetchWithAuth(`/school-private-lessons/${id}`, { method: 'DELETE' });
  },

  async slotsPrivate(clubId: string, date: string): Promise<SchoolPrivateLessonSlot[]> {
    const q = new URLSearchParams({ club_id: clubId, date });
    const res = await apiFetchWithAuth<ApiOk<{ slots: SchoolPrivateLessonSlot[] }>>(`/school-private-lessons/slots?${q}`);
    return res.slots ?? [];
  },

  async listFeeRules(clubId: string): Promise<SchoolFeeRule[]> {
    const q = new URLSearchParams({ club_id: clubId });
    const res = await apiFetchWithAuth<ApiOk<{ rules: SchoolFeeRule[] }>>(`/school-fee-rules?${q}`);
    return res.rules ?? [];
  },

  async upsertFeeRule(body: {
    club_id: string;
    staff_id?: string | null;
    group_size: 1 | 2 | 3 | 4;
    time_band: 'morning' | 'afternoon' | 'weekend';
    price_cents: number;
    is_active?: boolean;
  }): Promise<SchoolFeeRule> {
    const res = await apiFetchWithAuth<ApiOk<{ rule: SchoolFeeRule }>>('/school-fee-rules', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.rule;
  },

  async removeFeeRule(id: string): Promise<void> {
    await apiFetchWithAuth(`/school-fee-rules/${id}`, { method: 'DELETE' });
  },

  async listCharges(clubId: string, opts?: { status?: 'pending' | 'paid' | 'cancelled'; overdue?: boolean }): Promise<SchoolCharge[]> {
    const q = new URLSearchParams({ club_id: clubId });
    if (opts?.status) q.set('status', opts.status);
    if (opts?.overdue) q.set('overdue', 'true');
    const res = await apiFetchWithAuth<ApiOk<{ charges: SchoolCharge[] }>>(`/school-payments/charges?${q}`);
    return res.charges ?? [];
  },

  async createCharge(body: {
    club_id: string;
    source_type: 'course' | 'private';
    source_id?: string | null;
    enrollment_id?: string | null;
    student_player_id?: string | null;
    student_name?: string | null;
    amount_cents: number;
    due_date: string;
  }): Promise<SchoolCharge> {
    const res = await apiFetchWithAuth<ApiOk<{ charge: SchoolCharge }>>('/school-payments/charges', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.charge;
  },

  async markChargePaid(id: string): Promise<SchoolCharge> {
    const res = await apiFetchWithAuth<ApiOk<{ charge: SchoolCharge }>>(`/school-payments/charges/${id}/mark-paid`, { method: 'PUT' });
    return res.charge;
  },

  async cancelCharge(id: string): Promise<SchoolCharge> {
    const res = await apiFetchWithAuth<ApiOk<{ charge: SchoolCharge }>>(`/school-payments/charges/${id}/cancel`, { method: 'PUT' });
    return res.charge;
  },

  async listPriceTypes(clubId: string): Promise<SchoolPriceType[]> {
    const q = new URLSearchParams({ club_id: clubId });
    const res = await apiFetchWithAuth<ApiOk<{ price_types: SchoolPriceType[] }>>(`/school-price-types?${q}`);
    return res.price_types ?? [];
  },

  async createPriceType(body: { club_id: string; name: string; price_cents: number }): Promise<SchoolPriceType> {
    const res = await apiFetchWithAuth<ApiOk<{ price_type: SchoolPriceType }>>('/school-price-types', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.price_type;
  },

  async updatePriceType(id: string, body: Partial<{ name: string; price_cents: number; is_active: boolean }>): Promise<SchoolPriceType> {
    const res = await apiFetchWithAuth<ApiOk<{ price_type: SchoolPriceType }>>(`/school-price-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return res.price_type;
  },

  async removePriceType(id: string): Promise<void> {
    await apiFetchWithAuth(`/school-price-types/${id}`, { method: 'DELETE' });
  },
};
