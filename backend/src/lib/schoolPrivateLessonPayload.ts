export type PrivateLessonStudentInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  player_id?: string | null;
};

export type NormalizedPrivateLessonPayload = {
  courtIds: string[];
  students: Array<{
    name: string | null;
    email: string | null;
    phone: string | null;
    player_id: string | null;
  }>;
  studentCount: 1 | 2 | 3 | 4;
  primaryStudent: {
    player_id: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
};

function parseStudents(raw: unknown): PrivateLessonStudentInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => ({
    name: row?.name != null ? String(row.name).trim() : null,
    email: row?.email != null ? String(row.email).trim() : null,
    phone: row?.phone != null ? String(row.phone).trim() : null,
    player_id: row?.player_id != null ? String(row.player_id).trim() : null,
  }));
}

export function normalizePrivateLessonBody(body: Record<string, unknown>): NormalizedPrivateLessonPayload | { error: string } {
  let courtIds: string[] = [];
  if (Array.isArray(body.court_ids)) {
    courtIds = body.court_ids.map((id) => String(id ?? '').trim()).filter(Boolean);
  } else if (body.court_id) {
    const single = String(body.court_id).trim();
    if (single) courtIds = [single];
  }
  if (courtIds.length === 0) {
    return { error: 'Selecciona al menos una pista' };
  }

  let studentsInput = parseStudents(body.students);
  if (studentsInput.length === 0) {
    const legacyName = String(body.student_name ?? '').trim();
    const legacyEmail = String(body.student_email ?? '').trim();
    const legacyPhone = String(body.student_phone ?? '').trim();
    const legacyPlayer = String(body.student_player_id ?? '').trim();
    if (legacyName || legacyEmail || legacyPhone || legacyPlayer) {
      studentsInput = [{
        name: legacyName || null,
        email: legacyEmail || null,
        phone: legacyPhone || null,
        player_id: legacyPlayer || null,
      }];
    }
  }

  const students = studentsInput
    .map((s) => ({
      name: s.name || null,
      email: s.email || null,
      phone: s.phone || null,
      player_id: s.player_id || null,
    }))
    .filter((s) => s.name || s.email || s.phone || s.player_id);

  if (students.length === 0) {
    return { error: 'Añade al menos un alumno' };
  }
  if (students.length > 4) {
    return { error: 'Máximo 4 alumnos por clase' };
  }

  let studentCount = Math.trunc(Number(body.student_count ?? students.length));
  if (!Number.isFinite(studentCount) || studentCount < 1) {
    studentCount = students.length;
  }
  studentCount = Math.max(students.length, Math.min(4, studentCount));
  if (![1, 2, 3, 4].includes(studentCount)) {
    return { error: 'student_count debe ser entre 1 y 4' };
  }

  const primary = students[0];
  return {
    courtIds,
    students,
    studentCount: studentCount as 1 | 2 | 3 | 4,
    primaryStudent: {
      player_id: primary.player_id,
      name: primary.name,
      email: primary.email,
      phone: primary.phone,
    },
  };
}

export function mapLessonRow(row: Record<string, unknown>): Record<string, unknown> {
  const courtIds = Array.isArray(row.court_ids)
    ? (row.court_ids as string[]).filter(Boolean)
    : row.court_id
      ? [String(row.court_id)]
      : [];
  let students: unknown[] = [];
  if (Array.isArray(row.students)) {
    students = row.students;
  } else if (typeof row.students === 'string') {
    try {
      const parsed = JSON.parse(row.students);
      if (Array.isArray(parsed)) students = parsed;
    } catch {
      students = [];
    }
  }
  if (students.length === 0 && (row.student_name || row.student_email)) {
    students = [{
      name: row.student_name ?? null,
      email: row.student_email ?? null,
      phone: row.student_phone ?? null,
      player_id: row.student_player_id ?? null,
    }];
  }
  return {
    ...row,
    court_ids: courtIds,
    court_id: courtIds[0] ?? row.court_id,
    students,
  };
}
