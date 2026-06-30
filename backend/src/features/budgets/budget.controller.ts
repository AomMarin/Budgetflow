import { Request, Response, NextFunction } from 'express';
import { BudgetService } from './budget.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, sendCreated } from '../../utils/response';

const service = new BudgetService();

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budgets = await service.getAll((req as AuthenticatedRequest).user.id);
    sendSuccess(res, { budgets });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budget = await service.getById(req.params.id, (req as AuthenticatedRequest).user.id);
    sendSuccess(res, { budget });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budget = await service.create((req as AuthenticatedRequest).user.id, req.body);
    sendCreated(res, { budget }, 'Budget created');
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budget = await service.update(req.params.id, (req as AuthenticatedRequest).user.id, req.body);
    sendSuccess(res, { budget }, 'Budget updated');
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.delete(req.params.id, (req as AuthenticatedRequest).user.id);
    sendSuccess(res, null, 'Budget deleted');
  } catch (err) {
    next(err);
  }
}

export async function allocateIncome(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.allocateIncome((req as AuthenticatedRequest).user.id, req.body);
    sendSuccess(res, null, 'Income allocated successfully');
  } catch (err) {
    next(err);
  }
}

export async function reorder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.reorder((req as AuthenticatedRequest).user.id, req.body.orderedIds);
    sendSuccess(res, null, 'Budgets reordered');
  } catch (err) {
    next(err);
  }
}
