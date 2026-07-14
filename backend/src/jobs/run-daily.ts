import { runDailyJob } from './daily.job';
import { logger } from '../utils/logger';

runDailyJob()
  .then(() => {
    logger.info('Daily job finished');
    process.exit(0);
  })
  .catch((err) => {
    logger.error(`Daily job crashed: ${err}`);
    process.exit(1);
  });
