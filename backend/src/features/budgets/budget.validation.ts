import { body } from 'express-validator';

export const createBudgetValidation = [
  body('name').trim().isLength({ min: 1, max: 50 }).withMessage('Name is required (max 50 chars)'),
  body('icon').optional().isString().withMessage('Icon must be a string'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Color must be a valid hex color'),
  body('allocatedAmount')
    .isFloat({ min: 0 })
    .withMessage('Allocated amount must be a non-negative number'),
  body('rolloverPolicy')
    .optional()
    .isIn(['RESET', 'ROLLOVER', 'SWEEP'])
    .withMessage('Invalid rollover policy'),
  body('monthlyTarget')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('Monthly target must be a non-negative number'),
];

export const updateBudgetValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Name max 50 chars'),
  body('icon').optional().isString(),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Color must be a valid hex color'),
  body('allocatedAmount').optional().isFloat({ min: 0 }).withMessage('Must be non-negative'),
  body('rolloverPolicy')
    .optional()
    .isIn(['RESET', 'ROLLOVER', 'SWEEP'])
    .withMessage('Invalid rollover policy'),
  body('monthlyTarget')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('Monthly target must be a non-negative number'),
];

export const allocateIncomeValidation = [
  body('accountId').isString().notEmpty().withMessage('Account ID is required'),
  body('totalAmount').isFloat({ min: 0.01 }).withMessage('Total income amount must be positive'),
  body('allocations').isArray({ min: 1 }).withMessage('At least one allocation is required'),
  body('allocations.*.budgetId').isString().notEmpty().withMessage('Budget ID is required'),
  body('allocations.*.amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
];
