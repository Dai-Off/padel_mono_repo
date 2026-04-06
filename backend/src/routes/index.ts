import { Router } from 'express';
import authRouter from './auth';
import healthRouter from './health';
import playersRouter from './players';
import clubOwnersRouter from './clubOwners';
import clubsRouter from './clubs';
import courtsRouter from './courts';
import bookingsRouter from './bookings';
import bookingParticipantsRouter from './bookingParticipants';
import matchesRouter from './matches';
import matchScoresRouter from './matchScores';
import matchFeedbackRouter from './matchFeedback';
import matchmakingRouter from './matchmaking';
import matchPlayersRouter from './matchPlayers';
import privacyLogsRouter from './privacyLogs';
import homeRouter from './home';
import searchRouter from './search';
import clubApplicationsRouter from './clubApplications';
import paymentsRouter from './paymentsRouter';
import pricingRulesRouter from './pricingRules';
import clubStaffRouter from './clubStaff';
import reservationTypePricesRouter from './reservationTypePrices';
import inventoryRouter from './inventory';
import schoolCoursesRouter from './schoolCourses';
import clubClientsRouter from './clubClients';
import clubReviewsRouter from './clubReviews';
import tournamentsRouter from './tournaments';
import tournamentInvitesRouter from './tournamentInvites';
import leaguesRouter from './leagues';
import walletRouter from './wallet';
import bonusesRouter from './bonuses';

const router = Router();

const matchesStack = Router();
matchesStack.use(matchScoresRouter);
matchesStack.use(matchFeedbackRouter);
matchesStack.use(matchesRouter);

router.get('/', (_req, res) => {
  res.json({ message: '¡Bienvenido a la API de Padel!' });
});

router.use('/auth', authRouter);
router.use('/health', healthRouter);
router.use('/players', playersRouter);
router.use('/club-owners', clubOwnersRouter);
router.use('/clubs', clubsRouter);
router.use('/courts', courtsRouter);
router.use('/bookings', bookingsRouter);
router.use('/booking-participants', bookingParticipantsRouter);
router.use('/matches', matchesStack);
router.use('/matchmaking', matchmakingRouter);
router.use('/match-players', matchPlayersRouter);
router.use('/privacy-logs', privacyLogsRouter);
router.use('/home', homeRouter);
router.use('/search', searchRouter);
router.use('/club-applications', clubApplicationsRouter);
router.use('/payments', paymentsRouter);
router.use('/pricing-rules', pricingRulesRouter);
router.use('/club-staff', clubStaffRouter);
router.use('/reservation-type-prices', reservationTypePricesRouter);
router.use('/inventario', inventoryRouter);
router.use('/school-courses', schoolCoursesRouter);
router.use('/club-clients', clubClientsRouter);
router.use('/club-reviews', clubReviewsRouter);
router.use('/tournaments', tournamentInvitesRouter);
router.use('/tournaments', tournamentsRouter);
router.use('/leagues', leaguesRouter);
router.use('/wallet', walletRouter);
router.use('/bonuses', bonusesRouter);

export default router;

