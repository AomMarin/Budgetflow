import { Router } from 'express';
import * as controller from './pool.controller';
import { validate } from '../../../middleware/validation.middleware';
import { contributeValidation, spendValidation, updateSpendValidation } from './pool.validation';
import { createBudgetValidation, updateBudgetValidation } from '../../budgets/budget.validation';

const router = Router();

router.post('/enable', controller.enable);
router.get('/', controller.getSummary);
router.get('/budgets', controller.getBudgets);
router.post('/budgets', createBudgetValidation, validate, controller.createBudget);
router.patch('/budgets/:budgetId', updateBudgetValidation, validate, controller.updateBudget);
router.delete('/budgets/:budgetId', controller.deleteBudget);
router.get('/transactions', controller.getTransactions);
router.post('/contribute', contributeValidation, validate, controller.contribute);
router.post('/spend', spendValidation, validate, controller.spend);
router.post('/transactions/:txId/reverse', controller.reverseContribution);
router.patch('/transactions/:txId', updateSpendValidation, validate, controller.updateTransaction);
router.delete('/transactions/:txId', controller.deleteTransaction);

export default router;
