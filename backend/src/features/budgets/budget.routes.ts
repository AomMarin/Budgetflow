import { Router } from 'express';
import * as controller from './budget.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import {
  createBudgetValidation,
  updateBudgetValidation,
  allocateIncomeValidation,
} from './budget.validation';

const router = Router();

router.use(authenticate);

router.get('/', controller.getAll);
router.post('/', createBudgetValidation, validate, controller.create);
router.post('/allocate', allocateIncomeValidation, validate, controller.allocateIncome);
router.post('/reorder', controller.reorder);
router.get('/:id', controller.getById);
router.patch('/:id', updateBudgetValidation, validate, controller.update);
router.delete('/:id', controller.remove);

export default router;
