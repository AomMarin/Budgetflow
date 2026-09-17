import { Request, Response, NextFunction } from 'express';
import { TransactionService } from './transaction.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, sendCreated } from '../../utils/response';
import { bangkokMonthRangeUtc } from '../../utils/period';

const service = new TransactionService();

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // year/month is the month-switcher filter (additive alongside the
    // generic startDate/endDate, which stay available for any other caller)
    // — translated to a Bangkok-correct range here, same as
    // budget.controller.ts/dashboard.controller.ts, so TransactionRepository
    // never needs to know about "year/month" as a concept.
    let startDate = req.query.startDate as string | undefined;
    let endDate = req.query.endDate as string | undefined;
    if (req.query.year && req.query.month) {
      const { start, end } = bangkokMonthRangeUtc(
        parseInt(req.query.year as string),
        parseInt(req.query.month as string),
      );
      startDate = start.toISOString();
      endDate = end.toISOString();
    }

    const { transactions, meta } = await service.getAll(
      (req as AuthenticatedRequest).user.id,
      {
        type: req.query.type as 'INCOME' | 'EXPENSE' | undefined,
        budgetId: req.query.budgetId as string | undefined,
        startDate,
        endDate,
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
