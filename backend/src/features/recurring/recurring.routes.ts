import { Router } from 'express';
import * as controller from './recurring.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createRecurringValidation, updateRecurringValidation } from './recurring.validation';

const router = Router();
router.use(authenticate);

router.get('/', controller.getAll);
router.post('/', createRecurringValidation, validate, controller.create);
router.post('/process', controller.process);
router.patch('/:id', updateRecurringValidation, validate, controller.update);
router.delete('/:id', controller.remove);

export default router;
