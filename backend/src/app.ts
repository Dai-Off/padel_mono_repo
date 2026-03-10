import dotenv from 'dotenv';

dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes';
import { webhookHandler } from './routes/payments';

const app = express();

app.use(cors());
app.use(morgan('dev'));
// Webhook Stripe debe recibir body raw para verificar firma
app.use('/payments/webhook', express.raw({ type: 'application/json' }), webhookHandler);
app.use(express.json());

app.use('/', routes);

export default app;
