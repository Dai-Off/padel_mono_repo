import { Router } from 'express';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import {
  createIntentHandler,
  createIntentForNewMatchHandler,
  createIntentForTournamentHandler,
  confirmClientHandler,
  listTransactionsHandler,
  listClubTransactionsHandler,
  cashClosingExpectedHandler,
  getCashOpeningForDayHandler,
  createCashOpeningRecordHandler,
  listCashClosingRecordsHandler,
  createCashClosingRecordHandler,
  customerPortalHandler,
  simulateTurnPaymentHandler,
  cashMovementsHandler,
} from './payments';

const router = Router();
router.use(attachAuthContext);

router.get('/transactions', listTransactionsHandler);
router.get('/club-transactions', requireClubOwnerOrAdmin, listClubTransactionsHandler);
router.get('/cash-closing/expected', requireClubOwnerOrAdmin, cashClosingExpectedHandler);
router.get('/cash-opening/today', requireClubOwnerOrAdmin, getCashOpeningForDayHandler);
router.post('/cash-opening/records', requireClubOwnerOrAdmin, createCashOpeningRecordHandler);
router.get('/cash-closing/records', requireClubOwnerOrAdmin, listCashClosingRecordsHandler);
router.post('/cash-closing/records', requireClubOwnerOrAdmin, createCashClosingRecordHandler);
router.post('/customer-portal', customerPortalHandler);
router.post('/create-intent', createIntentHandler);
router.post('/create-intent-for-new-match', createIntentForNewMatchHandler);
router.post('/create-intent-for-tournament', createIntentForTournamentHandler);
router.post('/confirm-client', confirmClientHandler);
router.post('/simulate-turn-payment', simulateTurnPaymentHandler);
router.get('/cash-movements', requireClubOwnerOrAdmin, cashMovementsHandler);

export default router;
