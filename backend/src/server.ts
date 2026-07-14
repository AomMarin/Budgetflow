import cron from 'node-cron';
import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { logger } from './utils/logger';
import { runDailyJob } from './jobs/daily.job';

async function start() {
  await connectDatabase();

  cron.schedule(
    '5 0 * * *',
    () => {
      runDailyJob().catch((err) => logger.error(`Daily job failed: ${err}`));
    },
    { timezone: 'Asia/Bangkok' },
  );

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 BudgetFlow API running on http://localhost:${env.PORT}`);
    logger.info(`📚 API docs at http://localhost:${env.PORT}/api/v1/docs`);
    logger.info(`🌍 Environment: ${env.NODE_ENV}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
