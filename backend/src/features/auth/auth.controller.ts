import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess, sendCreated } from '../../utils/response';
import { env } from '../../config/env';

const service = new AuthService();

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.isProduction,
  // 'none' is required once frontend and backend are on different origins
  // (Vercel/Render) — browsers silently drop the cookie otherwise. Requires
  // secure:true, which is already guaranteed by env.isProduction above.
  sameSite: (env.isProduction ? 'none' : 'strict') as 'none' | 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, tokens } = await service.register(req.body);
    res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    sendCreated(res, { user, accessToken: tokens.accessToken }, 'Account created successfully');
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, tokens } = await service.login(req.body);
    res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    sendSuccess(res, { user, accessToken: tokens.accessToken }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie('refreshToken');
  sendSuccess(res, null, 'Logged out successfully');
}

export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      res.status(401).json({ success: false, message: 'No refresh token' });
      return;
    }
    const tokens = await service.refreshToken(token);
    res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    sendSuccess(res, { accessToken: tokens.accessToken });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await service.getProfile((req as AuthenticatedRequest).user.id);
    sendSuccess(res, { user });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await service.updateProfile((req as AuthenticatedRequest).user.id, req.body);
    sendSuccess(res, { user }, 'Profile updated');
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.changePassword((req as AuthenticatedRequest).user.id, req.body);
    sendSuccess(res, null, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
}
