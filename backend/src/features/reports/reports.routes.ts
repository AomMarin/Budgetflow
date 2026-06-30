import { Router } from 'express';
import * as controller from './reports.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/monthly', controller.getMonthly);
router.get('/yearly', controller.getYearly);

export default router;
