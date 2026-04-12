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
