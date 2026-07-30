import { Request, Response, NextFunction } from 'express';
import { PoolService } from './pool.service';
import { AuthenticatedRequest } from '../../../types';
import { sendSuccess, sendCreated } from '../../../utils/response';

const service = new PoolService();

export async function enable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.enable((req as AuthenticatedRequest).user.id);
    sendSuccess(res, result, 'Shared pool enabled');
  } catch (err) {
    next(err);
  }
}

export async function getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const pool = await service.getSummary((req as AuthenticatedRequest).user.id);
    sendSuccess(res, { pool });
  } catch (err) {
    next(err);
  }
}

export async function getBudgets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budgets = await service.getBudgets((req as AuthenticatedRequest).user.id);
    sendSuccess(res, { budgets });
  } catch (err) {
    next(err);
  }
}

export async function createBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budget = await service.createBudget((req as AuthenticatedRequest).user.id, req.body);
    sendCreated(res, { budget }, 'Pool budget created');
  } catch (err) {
    next(err);
  }
}

export async function updateBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budget = await service.updateBudget(
      (req as AuthenticatedRequest).user.id,
      req.params.budgetId,
      req.body,
    );
    sendSuccess(res, { budget }, 'Pool budget updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteBudget((req as AuthenticatedRequest).user.id, req.params.budgetId);
    sendSuccess(res, null, 'Pool budget deleted');
  } catch (err) {
    next(err);
  }
}

export async function getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { transactions, meta } = await service.getTransactions((req as AuthenticatedRequest).user.id, {
      type: req.query.type as 'INCOME' | 'EXPENSE' | undefined,
      budgetId: req.query.budgetId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    });
    sendSuccess(res, { transactions }, undefined, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function updateTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const transaction = await service.updateTransaction(
      (req as AuthenticatedRequest).user.id,
      req.params.txId,
      req.body,
    );
    sendSuccess(res, { transaction }, 'Pool transaction updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteTransaction((req as AuthenticatedRequest).user.id, req.params.txId);
    sendSuccess(res, null, 'Pool transaction deleted');
  } catch (err) {
    next(err);
  }
}

export async function contribute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.contribute((req as AuthenticatedRequest).user.id, req.body);
    sendCreated(res, result, 'Contributed to shared pool');
  } catch (err) {
    next(err);
  }
}

export async function spend(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const transaction = await service.spend((req as AuthenticatedRequest).user.id, req.body);
    sendCreated(res, { transaction }, 'Pool expense recorded');
  } catch (err) {
    next(err);
  }
}

export async function reverseContribution(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.reverseContribution((req as AuthenticatedRequest).user.id, req.params.txId);
    sendSuccess(res, null, 'Contribution reversed');
  } catch (err) {
    next(err);
  }
}
