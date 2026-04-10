import { Router } from 'express';
import { attachAuthContext } from '../middleware/attachAuthContext';

import dailyLessonRouter from './learningDailyLesson';
import coursesRouter from './learningCourses';
import clubQuestionsRouter from './learningClubQuestions';
import clubCoursesRouter from './learningClubCourses';

const router = Router();
router.use(attachAuthContext);

router.use(dailyLessonRouter);
router.use(coursesRouter);
router.use(clubQuestionsRouter);
router.use(clubCoursesRouter);

// Re-export for intra-backend use by other modules (matches, Coach IA, Season Pass)
export { getMultiplier, getPlayerStreakMultiplier } from './learningStreaks';

export default router;
