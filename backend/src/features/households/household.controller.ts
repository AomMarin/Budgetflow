import { Request, Response, NextFunction } from 'express';
import { HouseholdService } from './household.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, sendCreated } from '../../utils/response';

const service = new HouseholdService();

export async function getMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const household = await service.getMine((req as AuthenticatedRequest).user.id);
    sendSuccess(res, { household });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const household = await service.create((req as AuthenticatedRequest).user.id, req.body);
    sendCreated(res, { household }, 'Household created');
  } catch (err) {
    next(err);
  }
}

export async function createInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invite = await service.createInvite((req as AuthenticatedRequest).user.id, req.params.id);
    sendCreated(res, { invite }, 'Invite created');
  } catch (err) {
    next(err);
  }
}

export async function join(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const household = await service.join((req as AuthenticatedRequest).user.id, req.body);
    sendSuccess(res, { household }, 'Joined household');
  } catch (err) {
    next(err);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.removeMember((req as AuthenticatedRequest).user.id, req.params.userId);
    sendSuccess(res, null, 'Member removed');
  } catch (err) {
    next(err);
  }
}

export async function leave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.leave((req as AuthenticatedRequest).user.id);
    sendSuccess(res, null, 'Left household');
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteHousehold((req as AuthenticatedRequest).user.id);
    sendSuccess(res, null, 'Household deleted');
  } catch (err) {
    next(err);
  }
}

export async function getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const overview = await service.getOverview((req as AuthenticatedRequest).user.id);
    sendSuccess(res, { overview });
  } catch (err) {
    next(err);
  }
}
