import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware';

import authRoutes from './features/auth/auth.routes';
import budgetRoutes from './features/budgets/budget.routes';
import transactionRoutes from './features/transactions/transaction.routes';
import transferRoutes from './features/transfers/transfer.routes';
import dashboardRoutes from './features/dashboard/dashboard.routes';
import reportsRoutes from './features/reports/reports.routes';
import importsRoutes from './features/imports/import.routes';
import accountRoutes from './features/accounts/account.routes';
import recurringRoutes from './features/recurring/recurring.routes';
import adminRoutes from './features/admin/admin.routes';
import notificationRoutes from './features/notifications/notification.routes';
import householdRoutes from './features/households/household.routes';

const app = express();

// Security
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

// Body parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
if (env.isDevelopment) {
  app.use(morgan('dev'));
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API docs
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'BudgetFlow API',
}));

// Routes
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/accounts', accountRoutes);
apiRouter.use('/budgets', budgetRoutes);
apiRouter.use('/transactions', transactionRoutes);
apiRouter.use('/transfers', transferRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/reports', reportsRoutes);
apiRouter.use('/imports', importsRoutes);
apiRouter.use('/recurring', recurringRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/households', householdRoutes);

app.use('/api/v1', apiRouter);

// Error handling (must be last)
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
