import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { sendValidationError } from '../utils/response';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((e) => ({
      field: (e as { path?: string; param?: string }).path || (e as { param?: string }).param || 'unknown',
      message: e.msg,
    }));
    sendValidationError(res, formatted);
    return;
  }
  next();
}
