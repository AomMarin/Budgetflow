import { Request, Response, NextFunction } from 'express';
import { sendForbidden } from '../utils/response';
import { AuthenticatedRequest } from '../types';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if ((req as AuthenticatedRequest).user.role !== 'ADMIN') {
    sendForbidden(res, 'Admin access required');
    return;
  }
  next();
}
