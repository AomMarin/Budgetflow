import { Router } from 'express';
import * as controller from './transfer.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { body } from 'express-validator';

const router = Router();

router.use(authenticate);

const createValidation = [
  body('fromBudgetId').isString().notEmpty().withMessage('From budget is required'),
  body('toBudgetId').isString().notEmpty().withMessage('To budget is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('description').optional().isString().trim().isLength({ max: 200 }),
];

router.get('/', controller.getAll);
router.post('/', createValidation, validate, controller.create);

export default router;
