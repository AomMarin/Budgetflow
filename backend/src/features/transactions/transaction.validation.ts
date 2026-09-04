import { body, query, Meta } from 'express-validator';

// EXPENSE requires a budgetId — an EXPENSE that decrements Account.balance
// without ever touching a budget's spentAmount can push
// Sigma(remaining) past Sigma(balance) with no check anywhere catching it
// (see the mindmint@budgetflow.app incident this closes). This DTO-level
// check only covers requests where `type` is present in the same payload —
// update()'s merge-with-existing-type case is the service's job (it has to
// know the record's current type, which validation here can't see).
const budgetRequiredForExpense = body('budgetId')
  .if((_value: unknown, { req }: Meta) => req.body.type === 'EXPENSE')
  .notEmpty()
  .withMessage('กรุณาเลือกงบสำหรับรายจ่าย');

export const createTransactionValidation = [
  body('accountId').isString().notEmpty().withMessage('Account ID is required'),
  budgetRequiredForExpense,
  body('budgetId').optional({ nullable: true }).isString(),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('type').isIn(['INCOME', 'EXPENSE']).withMessage('Type must be INCOME or EXPENSE'),
  body('description').trim().isLength({ min: 1, max: 200 }).withMessage('Description is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('borrowFromBudgetId').optional({ nullable: true }).isString(),
];

export const updateTransactionValidation = [
  budgetRequiredForExpense,
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
  // Per-item "EXPENSE needs budgetId" is enforced in the service loop instead
  // of here — express-validator's `.if()` reads req.body directly, and there
  // is no clean way to pair transactions.*.budgetId with its own sibling
  // transactions.*.type through a wildcard path.
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
