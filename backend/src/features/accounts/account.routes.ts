import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../utils/response';
import { prisma } from '../../config/database';
import { AuthenticatedRequest } from '../../types';
import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validation.middleware';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: (req as AuthenticatedRequest).user.id },
      orderBy: { createdAt: 'asc' },
    });
    sendSuccess(res, { accounts });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  [body('name').trim().notEmpty().withMessage('Name is required')],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const account = await prisma.account.create({
        data: {
          userId: (req as AuthenticatedRequest).user.id,
          name: req.body.name,
          balance: req.body.balance ?? 0,
          currency: req.body.currency ?? 'THB',
        },
      });
      res.status(201).json({ success: true, data: { account } });
    } catch (err) {
      next(err);
    }
  },
);

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const account = await prisma.account.updateMany({
      where: { id: req.params.id, userId: (req as AuthenticatedRequest).user.id },
      data: {
        ...(req.body.name && { name: req.body.name }),
        ...(req.body.currency && { currency: req.body.currency }),
      },
    });
    sendSuccess(res, { account }, 'Account updated');
  } catch (err) {
    next(err);
  }
});

// Set opening / initial balance directly (no transaction record)
router.post(
  '/setup-balance',
  [body('balance').isFloat({ min: 0 }).withMessage('Balance must be non-negative')],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as AuthenticatedRequest).user.id;
      const account = await prisma.account.findFirst({
        where: { userId, isDefault: true },
      });
      if (!account) {
        res.status(404).json({ success: false, message: 'Default account not found' });
        return;
      }
      const updated = await prisma.account.update({
        where: { id: account.id },
        data: { balance: req.body.balance },
      });
      sendSuccess(res, { account: updated }, 'Starting balance updated');
    } catch (err) {
      next(err);
    }
  },
);

// Reset ALL financial data — keep budget structure and recurring rules
router.post('/reset-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;

    await prisma.$transaction([
      prisma.transfer.deleteMany({ where: { userId } }),
      prisma.allocation.deleteMany({ where: { userId } }),
      prisma.transaction.deleteMany({ where: { userId } }),
      prisma.importFile.deleteMany({ where: { userId } }),
      prisma.account.updateMany({ where: { userId }, data: { balance: 0 } }),
      prisma.budget.updateMany({
        where: { userId },
        data: { allocatedAmount: 0, spentAmount: 0 },
      }),
      // Mark recurring as run today so they don't re-fire immediately after reset
      prisma.recurringTransaction.updateMany({
        where: { userId },
        data: { lastRunAt: new Date() },
      }),
    ]);

    sendSuccess(res, null, 'All financial data has been reset');
  } catch (err) {
    next(err);
  }
});

export default router;
