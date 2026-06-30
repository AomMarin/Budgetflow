import { Router } from 'express';
import * as controller from './transaction.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import {
  createTransactionValidation,
  updateTransactionValidation,
  transactionQueryValidation,
} from './transaction.validation';

const router = Router();

router.use(authenticate);

router.get('/', transactionQueryValidation, validate, controller.getAll);
router.post('/', createTransactionValidation, validate, controller.create);
router.post('/batch', controller.batchCreate);
router.get('/:id', controller.getById);
router.patch('/:id', updateTransactionValidation, validate, controller.update);
router.delete('/:id', controller.remove);

export default router;
