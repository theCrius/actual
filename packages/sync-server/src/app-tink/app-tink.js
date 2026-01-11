import express from 'express';

import { handleError } from '../app-gocardless/util/handle-error';
import { SecretName, secretsService } from '../services/secrets-service';
import { requestLoggerMiddleware } from '../util/middlewares';

import { tinkService } from './tink-service';

const app = express();
export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);

app.post(
  '/status',
  handleError(async (req, res) => {
    const configured = tinkService.isConfigured();

    res.send({
      status: 'ok',
      data: {
        configured,
      },
    });
  }),
);

app.post(
  '/accounts',
  handleError(async (req, res) => {
    try {
      const accounts = await tinkService.getAccounts();

      res.send({
        status: 'ok',
        data: {
          accounts,
        },
      });
    } catch (error) {
      res.send({
        status: 'ok',
        data: {
          error: error.message,
        },
      });
    }
  }),
);

app.post(
  '/transactions',
  handleError(async (req, res) => {
    const { accountId, startDate } = req.body || {};

    try {
      const result = await tinkService.getTransactions(accountId, startDate);

      res.send({
        status: 'ok',
        data: result,
      });
    } catch (error) {
      res.send({
        status: 'ok',
        data: {
          error: error.message,
        },
      });
    }
  }),
);
