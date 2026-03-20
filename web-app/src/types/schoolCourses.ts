export type SchoolSport = 'padel' | 'tenis';
export type SchoolLevel =
  | 'Principiante'
  | 'Intermedio'
  | 'Avanzado'
  | 'Competicion'
  | 'Elite'
  | 'Infantil';
export type SchoolWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type SchoolCourseDay = {
  id: string;
  course_id: string;
  weekday: SchoolWeekday;
  start_time: string;
  end_time: string;
};

export type SchoolCourse = {
  id: string;
  club_id: string;
  name: string;
  sport: SchoolSport;
  level: SchoolLevel;
  staff_id: string;
  court_id: string;
  price_cents: number;
  capacity: number;
  is_active: boolean;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
  days: SchoolCourseDay[];
  enrolled_count: number;
  staff_name?: string | null;
  court_name?: string | null;
};

export type SchoolCourseSlot = {
  id: string;
  course_id: string;
  date: string;
  court_id: string;
  start_time: string;
  end_time: string;
  course_name: string;
  staff_name: string | null;
};
