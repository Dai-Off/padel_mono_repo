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

export type SchoolEnrollment = {
  id: string;
  course_id: string;
  player_id: string | null;
  student_name: string | null;
  student_email: string | null;
  student_phone: string | null;
  fee_cents: number;
  status: 'active' | 'cancelled';
  created_at: string;
  updated_at: string;
  player?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

export type SchoolPrivateLesson = {
  id: string;
  club_id: string;
  student_player_id: string | null;
  student_name: string | null;
  student_email: string | null;
  student_phone: string | null;
  staff_id: string;
  court_id: string;
  price_cents: number;
  weekday: SchoolWeekday;
  start_time: string;
  end_time: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SchoolPrivateLessonSlot = {
  id: string;
  private_lesson_id: string;
  date: string;
  court_id: string;
  start_time: string;
  end_time: string;
  student_name: string | null;
  price_cents: number;
};

export type SchoolFeeRule = {
  id: string;
  club_id: string;
  group_size: 2 | 3 | 4;
  time_band: 'morning' | 'afternoon' | 'weekend';
  price_cents: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SchoolCharge = {
  id: string;
  club_id: string;
  source_type: 'course' | 'private';
  source_id: string | null;
  enrollment_id: string | null;
  student_player_id: string | null;
  student_name: string | null;
  amount_cents: number;
  due_date: string;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};
