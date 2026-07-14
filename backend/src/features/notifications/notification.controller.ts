import { Request, Response, NextFunction } from 'express';
import { NotificationService } from './notification.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';

const service = new NotificationService();

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { notifications, unreadCount, meta } = await service.getAll(
      (req as AuthenticatedRequest).user.id,
      {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        unreadOnly: req.query.unreadOnly === 'true',
      },
    );
    sendSuccess(res, { notifications, unreadCount }, undefined, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await service.getUnreadCount((req as AuthenticatedRequest).user.id);
    sendSuccess(res, { count });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.markRead(req.params.id, (req as AuthenticatedRequest).user.id);
    sendSuccess(res, null, 'Notification marked as read');
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.markAllRead((req as AuthenticatedRequest).user.id);
    sendSuccess(res, null, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
}
