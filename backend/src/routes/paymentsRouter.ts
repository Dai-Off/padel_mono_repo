import { Router } from 'express';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdminOrPortalStaff } from '../middleware/requireClubOwnerOrAdminOrPortalStaff';
import {
  createIntentHandler,
  createIntentForNewMatchHandler,
  createIntentForTournamentHandler,
  createIntentForSeasonPassEliteHandler,
  confirmClientHandler,
  listTransactionsHandler,
  listPendingBookingsHandler,
  listClubTransactionsHandler,
  cashClosingExpectedHandler,
  getCashOpeningForDayHandler,
  createCashOpeningRecordHandler,
  listCashClosingRecordsHandler,
  createCashClosingRecordHandler,
  customerPortalHandler,
  simulateTurnPaymentHandler,
} from './payments';

const router = Router();
router.use(attachAuthContext);

router.get('/transactions', listTransactionsHandler);
router.get('/pending-bookings', listPendingBookingsHandler);
router.get('/club-transactions', requireClubOwnerOrAdminOrPortalStaff, listClubTransactionsHandler);
router.get('/cash-closing/expected', requireClubOwnerOrAdminOrPortalStaff, cashClosingExpectedHandler);
router.get('/cash-opening/today', requireClubOwnerOrAdminOrPortalStaff, getCashOpeningForDayHandler);
router.post('/cash-opening/records', requireClubOwnerOrAdminOrPortalStaff, createCashOpeningRecordHandler);
router.get('/cash-closing/records', requireClubOwnerOrAdminOrPortalStaff, listCashClosingRecordsHandler);
router.post('/cash-closing/records', requireClubOwnerOrAdminOrPortalStaff, createCashClosingRecordHandler);
router.post('/customer-portal', customerPortalHandler);
router.post('/create-intent', createIntentHandler);
router.post('/create-intent-for-new-match', createIntentForNewMatchHandler);
router.post('/create-intent-for-tournament', createIntentForTournamentHandler);
router.post('/create-intent-for-season-pass-elite', createIntentForSeasonPassEliteHandler);
router.post('/confirm-client', confirmClientHandler);
router.post('/simulate-turn-payment', simulateTurnPaymentHandler);

export default router;
