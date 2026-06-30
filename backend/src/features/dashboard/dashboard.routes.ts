import { Router } from 'express';
import * as controller from './dashboard.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', controller.getSummary);
router.get('/spending', controller.getSpendingByBudget);

export default router;
