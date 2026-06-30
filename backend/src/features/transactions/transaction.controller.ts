import { Request, Response, NextFunction } from 'express';
import { TransactionService } from './transaction.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, sendCreated } from '../../utils/response';

const service = new TransactionService();

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { transactions, meta } = await service.getAll(
      (req as AuthenticatedRequest).user.id,
      {
        type: req.query.type as 'INCOME' | 'EXPENSE' | undefined,
        budgetId: req.query.budgetId as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        search: req.query.search as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      },
    );
    sendSuccess(res, { transactions }, undefined, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tx = await service.getById(req.params.id, (req as AuthenticatedRequest).user.id);
    sendSuccess(res, { transaction: tx });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tx = await service.create((req as AuthenticatedRequest).user.id, req.body);
    sendCreated(res, { transaction: tx }, 'Transaction created');
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tx = await service.update(req.params.id, (req as AuthenticatedRequest).user.id, req.body);
    sendSuccess(res, { transaction: tx }, 'Transaction updated');
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.delete(req.params.id, (req as AuthenticatedRequest).user.id);
    sendSuccess(res, null, 'Transaction deleted');
  } catch (err) {
    next(err);
  }
}

export async function batchCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await service.batchCreate((req as AuthenticatedRequest).user.id, req.body.transactions);
    sendCreated(res, { count }, `${count} transaction(s) created`);
  } catch (err) {
    next(err);
  }
}
