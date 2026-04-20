import { API_URL } from "../config";

export interface PublicCourseDay {
  id: string;
  course_id: string;
  weekday: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  start_time: string;
  end_time: string;
}

export interface PublicCourse {
  id: string;
  name: string;
  sport: "padel" | "tenis";
  level: string;
  club_id: string;
  club_name: string;
  club_address: string;
  club_city: string;
  club_logo_url: string | null;
  price_cents: number;
  capacity: number;
  enrolled_count: number;
  days: PublicCourseDay[];
  staff: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
  starts_on: string | null;
  ends_on: string | null;
}

export interface PublicCoursesResponse {
  ok: boolean;
  courses: PublicCourse[];
  error?: string;
}

export interface CourseEnrollment {
  id: string;
  course_id: string;
  player_id: string;
  student_name: string;
  student_email: string;
  student_phone: string | null;
  status: "active" | "cancelled";
  created_at: string;
  course?: PublicCourse;
}

export interface MyEnrollmentsResponse {
  ok: boolean;
  enrollments: CourseEnrollment[];
  error?: string;
}

export interface EnrollResponse {
  ok: boolean;
  enrollment?: CourseEnrollment;
  error?: string;
}

/**
 * Obtiene el listado de clases públicas disponibles.
 * @param params Filtros opcionales por deporte y nivel.
 */
export async function fetchPublicCourses(params?: {
  sport?: string;
  level?: string;
}): Promise<PublicCoursesResponse> {
  const query = new URLSearchParams();
  if (params?.sport) query.append("sport", params.sport);
  if (params?.level) query.append("level", params.level);

  const queryString = query.toString();
  const url = `${API_URL}/school-courses/public/list${
    queryString ? `?${queryString}` : ""
  }`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    return json;
  } catch (err) {
    return {
      ok: false,
      courses: [],
      error: (err as Error).message,
    };
  }
}

/**
 * Obtiene las inscripciones del jugador actual.
 */
export async function fetchMyEnrollments(token: string): Promise<MyEnrollmentsResponse> {
  try {
    const res = await fetch(`${API_URL}/school-courses/public/my-enrollments`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return await res.json();
  } catch (err) {
    return {
      ok: false,
      enrollments: [],
      error: (err as Error).message,
    };
  }
}

/**
 * Inscribe al jugador actual en un curso.
 */
export async function enrollInCourse(courseId: string, token: string): Promise<EnrollResponse> {
  try {
    const res = await fetch(`${API_URL}/school-courses/public/enroll/${courseId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return await res.json();
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
    };
  }
}
