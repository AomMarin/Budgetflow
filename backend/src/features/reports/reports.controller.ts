import { Request, Response, NextFunction } from 'express';
import { ReportsService } from './reports.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';

const service = new ReportsService();

export async function getMonthly(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const now = new Date();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
    const data = await service.getMonthlyReport((req as AuthenticatedRequest).user.id, year, month);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getYearly(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const data = await service.getYearlyReport((req as AuthenticatedRequest).user.id, year);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const now = new Date();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
    const data = await service.getInsights((req as AuthenticatedRequest).user.id, year, month);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
