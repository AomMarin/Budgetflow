import { body } from 'express-validator';

export const contributeValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('fromAccountId').isString().notEmpty().withMessage('Account is required'),
  // Required, not optional — see ContributeDto comment.
  body('fromBudgetId').isString().notEmpty().withMessage('กรุณาเลือกงบสำหรับเงินสมทบ'),
  body('description').optional().isString(),
];

export const spendValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('budgetId').optional().isString(),
];

export const updateSpendValidation = [
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('description').optional().trim().notEmpty().withMessage('Description is required'),
  body('date').optional().isISO8601().withMessage('Valid date is required'),
  body('budgetId').optional({ nullable: true }).isString(),
];
