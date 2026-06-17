import { CoachAssessment } from '../api/coachAssessment';
import type { CoachDrillSlot } from '../i18n/sections/coachDrills';

export type SkillCategory = 'technical' | 'physical' | 'mental' | 'tactical';
export type DrillDifficulty = 'Bajo' | 'Medio' | 'Alto';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export interface ProgressItem {
  key: string;
  label: string;
  actual: number;
  target: number;
  icon: string;
}

export interface RecommendedDrill {
  name: string;
  difficulty: DrillDifficulty;
  difficultyLabel: string;
  duration: string;
  sets: string;
  category: SkillCategory;
}

export interface FigmaWeeklyPlan {
  weeklyProgress: ProgressItem[];
  monthlyProgress: ProgressItem[];
  drills: RecommendedDrill[];
}

type DrillTemplateRef = {
  slot: CoachDrillSlot;
  difficulty: DrillDifficulty;
  category: SkillCategory;
};

function buildCategoryPool(category: SkillCategory): DrillTemplateRef[] {
  const slots: { slot: CoachDrillSlot; difficulty: DrillDifficulty }[] = [
    { slot: 'low1', difficulty: 'Bajo' },
    { slot: 'low2', difficulty: 'Bajo' },
    { slot: 'med1', difficulty: 'Medio' },
    { slot: 'med2', difficulty: 'Medio' },
    { slot: 'high1', difficulty: 'Alto' },
    { slot: 'high2', difficulty: 'Alto' },
  ];
  return slots.map((entry) => ({ ...entry, category }));
}

const DRILLS_POOL: Record<SkillCategory, DrillTemplateRef[]> = {
  technical: buildCategoryPool('technical'),
  physical: buildCategoryPool('physical'),
  mental: buildCategoryPool('mental'),
  tactical: buildCategoryPool('tactical'),
};

const SKILL_AREA_KEYS: Record<SkillCategory, string> = {
  technical: 'profile.coachSkillAreaTechnical',
  physical: 'profile.coachSkillAreaPhysical',
  mental: 'profile.coachSkillAreaMental',
  tactical: 'profile.coachSkillAreaTactical',
};

function difficultyLabel(t: TranslateFn, difficulty: DrillDifficulty): string {
  if (difficulty === 'Bajo') return t('profile.coachDifficultyLow');
  if (difficulty === 'Medio') return t('profile.coachDifficultyMedium');
  return t('profile.coachDifficultyHigh');
}

function resolveDrill(t: TranslateFn, ref: DrillTemplateRef): RecommendedDrill {
  const prefix = `profile.coachDrills.${ref.category}.${ref.slot}`;
  return {
    name: t(`${prefix}.name`),
    duration: t(`${prefix}.duration`),
    sets: t(`${prefix}.sets`),
    difficulty: ref.difficulty,
    difficultyLabel: difficultyLabel(t, ref.difficulty),
    category: ref.category,
  };
}

function matchesDifficulty(ref: DrillTemplateRef, isHighLevel: boolean): boolean {
  if (isHighLevel) return ref.difficulty === 'Medio' || ref.difficulty === 'Alto';
  return ref.difficulty === 'Bajo' || ref.difficulty === 'Medio';
}

export function generateFigmaWeeklyPlan(assessment: CoachAssessment, t: TranslateFn): FigmaWeeklyPlan {
  const { skills, level_number } = assessment;

  const categories: SkillCategory[] = ['technical', 'physical', 'mental', 'tactical'];
  let lowestCategory: SkillCategory = 'technical';
  let lowestValue = 101;
  categories.forEach((cat) => {
    if (skills[cat] < lowestValue) {
      lowestValue = skills[cat];
      lowestCategory = cat;
    }
  });

  const stats = assessment.stats;
  const matchesThisWeek = stats?.matchesThisWeek ?? 0;
  const matchesThisMonth = stats?.matchesThisMonth ?? stats?.matchCount ?? 0;
  const dailyLessonsThisWeek = stats?.dailyLessonsThisWeek ?? 0;
  const tournamentEnrolledCount = stats?.tournamentEnrolledCount ?? 0;
  const tournamentPlayedCount = stats?.tournamentPlayedCount ?? 0;
  const classesAttendedCount = stats?.classesAttendedCount ?? 0;
  const coursesCompletedCount = stats?.coursesCompletedCount ?? 0;

  const weeklyProgress: ProgressItem[] = [
    {
      key: 'matches',
      label: t('profile.coachProgMatchesWeek'),
      actual: matchesThisWeek,
      target: 2,
      icon: 'target',
    },
    {
      key: 'classes',
      label: t('profile.coachProgClassesAttended'),
      actual: classesAttendedCount,
      target: 1,
      icon: 'zap',
    },
    {
      key: 'lessons',
      label: t('profile.coachProgDailyLesson'),
      actual: dailyLessonsThisWeek,
      target: 5,
      icon: 'book-open',
    },
    {
      key: 'tournaments',
      label: t('profile.coachProgTournamentsEnrolled'),
      actual: tournamentEnrolledCount,
      target: 1,
      icon: 'trophy',
    },
  ];

  const monthlyProgress: ProgressItem[] = [
    {
      key: 'm_matches',
      label: t('profile.coachProgMatchesMonth'),
      actual: matchesThisMonth,
      target: Math.max(8, matchesThisMonth + 3),
      icon: 'target',
    },
    {
      key: 'm_classes',
      label: t('profile.coachProgClassesAttended'),
      actual: classesAttendedCount,
      target: 4,
      icon: 'zap',
    },
    {
      key: 'm_tournaments',
      label: t('profile.coachProgTournamentsPlayed'),
      actual: tournamentPlayedCount,
      target: 1,
      icon: 'trophy',
    },
    {
      key: 'm_courses',
      label: t('profile.coachProgCoursesCompleted'),
      actual: coursesCompletedCount,
      target: 2,
      icon: 'book-open',
    },
  ];

  const pool = DRILLS_POOL[lowestCategory] ?? DRILLS_POOL.technical;
  const isHighLevel = level_number >= 3;

  let filteredDrills = pool.filter((ref) => matchesDifficulty(ref, isHighLevel));
  if (filteredDrills.length === 0) {
    filteredDrills = pool;
  }

  const drillsResult: DrillTemplateRef[] = [...filteredDrills];
  if (drillsResult.length < 3) {
    const backupCategory: SkillCategory =
      (['technical', 'physical', 'mental', 'tactical'] as SkillCategory[]).find((c) => c !== lowestCategory) ??
      'physical';
    const backupPool = DRILLS_POOL[backupCategory];
    const filteredBackup = backupPool.filter((ref) => matchesDifficulty(ref, isHighLevel));
    filteredBackup.forEach((ref) => {
      if (drillsResult.length < 3) {
        drillsResult.push(ref);
      }
    });
  }

  return {
    weeklyProgress,
    monthlyProgress,
    drills: drillsResult.slice(0, 3).map((ref) => resolveDrill(t, ref)),
  };
}

export function generateWeeklyPlan(assessment: CoachAssessment, t: TranslateFn) {
  const figma = generateFigmaWeeklyPlan(assessment, t);
  const weakestCategory = figma.drills[0]?.category ?? 'technical';

  return {
    weeklyObjective: {
      title: t('profile.coachWeeklyObjectiveTitle'),
      description: t('profile.coachWeeklyObjectiveDescription'),
      category: weakestCategory,
    },
    drills: figma.drills.map((d) => ({
      name: d.name,
      description: t('profile.coachDrillDescription', { area: t(SKILL_AREA_KEYS[d.category]) }),
      duration: d.duration,
      category: d.category,
      icon: d.category === 'physical' ? 'fitness-outline' : 'tennisball-outline',
    })),
    weeklyGoals: figma.weeklyProgress.map((w) => `${w.label}: ${w.actual}/${w.target}`),
    coachTip: t('profile.coachTip'),
  };
}
