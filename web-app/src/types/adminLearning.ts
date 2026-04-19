import type { Course, CourseLesson, Question } from './learningContent';

export interface AdminCourse extends Course {
  club_name: string;
  review_notes: string | null;
}

export interface AdminCourseWithLessons extends AdminCourse {
  lessons: CourseLesson[];
}

export interface AdminQuestion extends Omit<Question, 'club_id'> {
  club_id: string;
  club_name: string;
}

export interface ClubStat {
  club_id: string;
  club_name: string;
  count: number;
}

export interface LearningStats {
  total_questions: number;
  active_questions: number;
  total_courses: number;
  active_courses: number;
  pending_courses: number;
  questions_by_club: ClubStat[];
  courses_by_club: ClubStat[];
}
