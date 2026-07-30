import { Request, Response, NextFunction } from 'express';
import { RecurringService } from './recurring.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, sendCreated, sendError } from '../../utils/response';
import { notifyBudgetAlerts } from '../../utils/budget-alerts';

const service = new RecurringService();

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await service.getAll((req as AuthenticatedRequest).user.id);
    sendSuccess(res, { recurringTransactions: items });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const item = await service.create((req as AuthenticatedRequest).user.id, req.body);
    sendCreated(res, { recurringTransaction: item });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const item = await service.update(
      req.params.id,
      (req as AuthenticatedRequest).user.id,
      req.body,
    );
    sendSuccess(res, { recurringTransaction: item });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.delete(req.params.id, (req as AuthenticatedRequest).user.id);
    sendSuccess(res, null, 'Recurring transaction deleted');
  } catch (err) {
    next(err);
  }
}

export async function process(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const result = await service.process(userId);
    if (result.processed > 0) {
      await notifyBudgetAlerts(userId);
    }
    sendSuccess(res, result, result.processed > 0
      ? `Processed ${result.processed} recurring transaction(s)`
      : 'No recurring transactions due');
  } catch (err) {
    next(err);
  }
}
