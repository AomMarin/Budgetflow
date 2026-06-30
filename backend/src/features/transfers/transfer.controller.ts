import { Request, Response, NextFunction } from 'express';
import { TransferService } from './transfer.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, sendCreated } from '../../utils/response';

const service = new TransferService();

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const transfer = await service.create((req as AuthenticatedRequest).user.id, req.body);
    sendCreated(res, { transfer }, 'Transfer completed');
  } catch (err) {
    next(err);
  }
}

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const { transfers, meta } = await service.getAll((req as AuthenticatedRequest).user.id, page, limit);
    sendSuccess(res, { transfers }, undefined, 200, meta);
  } catch (err) {
    next(err);
  }
}
