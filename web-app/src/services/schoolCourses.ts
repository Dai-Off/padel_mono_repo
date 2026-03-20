import { apiFetchWithAuth } from './api';
import type { SchoolCourse, SchoolLevel, SchoolSport, SchoolWeekday, SchoolCourseSlot } from '../types/schoolCourses';

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
    price_cents: number;
    capacity: number;
    weekdays: SchoolWeekday[];
    start_time: string;
    end_time: string;
    starts_on?: string | null;
    ends_on?: string | null;
    is_active?: boolean;
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
      capacity: number;
      weekdays: SchoolWeekday[];
      start_time: string;
      end_time: string;
      starts_on: string | null;
      ends_on: string | null;
      is_active: boolean;
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
};
