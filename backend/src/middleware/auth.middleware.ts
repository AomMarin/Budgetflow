import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { sendUnauthorized } from '../utils/response';
import { AuthenticatedRequest } from '../types';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    sendUnauthorized(res, 'No token provided');
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).user = {
      id: payload.userId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
    next();
  } catch {
    sendUnauthorized(res, 'Invalid or expired token');
  }
}
