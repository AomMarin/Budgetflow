import { Request, Response, NextFunction } from 'express';
import { ImportService } from './import.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, sendCreated, sendError } from '../../utils/response';

const service = new ImportService();

export async function upload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, 'No file uploaded', 400);
      return;
    }
    const accountId = req.body.accountId;
    if (!accountId) {
      sendError(res, 'accountId is required', 400);
      return;
    }
    const importFile = await service.upload((req as AuthenticatedRequest).user.id, req.file, accountId);
    sendCreated(res, { import: importFile }, 'File uploaded. Processing started.');
  } catch (err) {
    next(err);
  }
}

export async function getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const importFile = await service.getStatus(req.params.id, (req as AuthenticatedRequest).user.id);
    sendSuccess(res, { import: importFile });
  } catch (err) {
    next(err);
  }
}

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const { imports, meta } = await service.getAll((req as AuthenticatedRequest).user.id, page, limit);
    sendSuccess(res, { imports }, undefined, 200, meta);
  } catch (err) {
    next(err);
  }
}

export async function getImportedTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const transactions = await service.getImportedTransactions(req.params.id, (req as AuthenticatedRequest).user.id);
    sendSuccess(res, { transactions });
  } catch (err) {
    next(err);
  }
}

export async function getRules(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rules = await service.getRules((req as AuthenticatedRequest).user.id);
    sendSuccess(res, { rules });
  } catch (err) {
    next(err);
  }
}

export async function createRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { keyword, budgetId, priority } = req.body;
    const rule = await service.createRule((req as AuthenticatedRequest).user.id, keyword, budgetId, priority);
    sendCreated(res, { rule }, 'Rule created');
  } catch (err) {
    next(err);
  }
}

export async function deleteRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteRule(req.params.id, (req as AuthenticatedRequest).user.id);
    sendSuccess(res, null, 'Rule deleted');
  } catch (err) {
    next(err);
  }
}
