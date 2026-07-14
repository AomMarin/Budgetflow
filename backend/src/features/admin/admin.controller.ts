import { Request, Response, NextFunction } from 'express';
import { AdminService } from './admin.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

const service = new AdminService();

export async function listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await service.listUsers();
    sendSuccess(res, { users });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await service.createUser(req.body);
    sendCreated(res, { user }, 'User created successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const currentUserId = (req as AuthenticatedRequest).user.id;
    const user = await service.updateUser(currentUserId, req.params.id, req.body);
    sendSuccess(res, { user }, 'User updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const currentUserId = (req as AuthenticatedRequest).user.id;
    await service.deleteUser(currentUserId, req.params.id);
    sendSuccess(res, null, 'User deleted successfully');
  } catch (err) {
    next(err);
  }
}
