import { Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';

const service = new DashboardService();

export async function getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.getSummary((req as AuthenticatedRequest).user.id);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getSpendingByBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const now = new Date();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
    const data = await service.getSpendingByBudget((req as AuthenticatedRequest).user.id, year, month);
    sendSuccess(res, { spending: data });
  } catch (err) {
    next(err);
  }
}
