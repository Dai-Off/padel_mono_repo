import { Router } from 'express';
import healthRouter from './health';
import playersRouter from './players';
import clubOwnersRouter from './clubOwners';
import clubsRouter from './clubs';
import courtsRouter from './courts';
import bookingsRouter from './bookings';
import bookingParticipantsRouter from './bookingParticipants';
import matchesRouter from './matches';
import matchPlayersRouter from './matchPlayers';
import privacyLogsRouter from './privacyLogs';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ message: '¡Bienvenido a la API de Padel!' });
});

router.use('/health', healthRouter);
router.use('/players', playersRouter);
router.use('/club-owners', clubOwnersRouter);
router.use('/clubs', clubsRouter);
router.use('/courts', courtsRouter);
router.use('/bookings', bookingsRouter);
router.use('/booking-participants', bookingParticipantsRouter);
router.use('/matches', matchesRouter);
router.use('/match-players', matchPlayersRouter);
router.use('/privacy-logs', privacyLogsRouter);

export default router;

