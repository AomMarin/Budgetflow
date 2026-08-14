import { body, query } from 'express-validator';

export const createTransactionValidation = [
  body('accountId').isString().notEmpty().withMessage('Account ID is required'),
  body('budgetId').optional({ nullable: true }).isString(),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('type').isIn(['INCOME', 'EXPENSE']).withMessage('Type must be INCOME or EXPENSE'),
  body('description').trim().isLength({ min: 1, max: 200 }).withMessage('Description is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('borrowFromBudgetId').optional({ nullable: true }).isString(),
];

export const updateTransactionValidation = [
  body('budgetId').optional({ nullable: true }).isString(),
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('type').optional().isIn(['INCOME', 'EXPENSE']),
  body('description').optional().trim().isLength({ min: 1, max: 200 }),
  body('date').optional().isISO8601(),
  body('borrowFromBudgetId').optional({ nullable: true }).isString(),
];

export const batchTransactionValidation = [
  body('transactions').isArray({ min: 1 }).withMessage('transactions must be a non-empty array'),
  body('transactions.*.accountId').isString().notEmpty().withMessage('Account ID is required'),
  body('transactions.*.budgetId').optional({ nullable: true }).isString(),
  body('transactions.*.amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('transactions.*.type').isIn(['INCOME', 'EXPENSE']).withMessage('Type must be INCOME or EXPENSE'),
  body('transactions.*.description').trim().isLength({ min: 1, max: 200 }).withMessage('Description is required'),
  body('transactions.*.date').isISO8601().withMessage('Valid date is required'),
];

export const transactionQueryValidation = [
  query('type').optional().isIn(['INCOME', 'EXPENSE']),
  query('budgetId').optional().isString(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('search').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];
