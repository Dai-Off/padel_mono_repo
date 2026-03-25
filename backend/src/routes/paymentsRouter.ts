import { Router } from 'express';
import {
  createIntentHandler,
  createIntentForNewMatchHandler,
  confirmClientHandler,
  listTransactionsHandler,
  customerPortalHandler,
  simulateTurnPaymentHandler,
} from './payments';

const router = Router();

router.get('/transactions', listTransactionsHandler);
router.post('/customer-portal', customerPortalHandler);
router.post('/create-intent', createIntentHandler);
router.post('/create-intent-for-new-match', createIntentForNewMatchHandler);
router.post('/confirm-client', confirmClientHandler);
router.post('/simulate-turn-payment', simulateTurnPaymentHandler);

export default router;
