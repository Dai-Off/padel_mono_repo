import { Router } from 'express';
import {
  createIntentHandler,
  createIntentForNewMatchHandler,
  confirmClientHandler,
  listTransactionsHandler,
  customerPortalHandler,
} from './payments';

const router = Router();

router.get('/transactions', listTransactionsHandler);
router.post('/customer-portal', customerPortalHandler);
router.post('/create-intent', createIntentHandler);
router.post('/create-intent-for-new-match', createIntentForNewMatchHandler);
router.post('/confirm-client', confirmClientHandler);

export default router;
