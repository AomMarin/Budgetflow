import { body } from 'express-validator';

export const createRecurringValidation = [
  body('name').trim().isLength({ min: 1, max: 80 }).withMessage('Name required (max 80 chars)'),
  body('type').isIn(['INCOME', 'EXPENSE']).withMessage('Type must be INCOME or EXPENSE'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('dayOfMonth').isInt({ min: 1, max: 31 }).withMessage('Day must be 1–31'),
  body('accountId').isString().notEmpty().withMessage('Account ID required'),
  body('budgetId').optional({ nullable: true }).isString(),
  body('description').optional().isString().isLength({ max: 200 }),
];

export const updateRecurringValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 80 }),
  body('amount').optional().isFloat({ min: 0.01 }),
  body('dayOfMonth').optional().isInt({ min: 1, max: 31 }),
  body('accountId').optional().isString().notEmpty(),
  body('budgetId').optional({ nullable: true }).isString(),
  body('description').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('isActive').optional().isBoolean(),
];
