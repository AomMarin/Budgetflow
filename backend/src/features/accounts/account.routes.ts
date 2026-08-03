import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../utils/response';
import { prisma } from '../../config/database';
import { AuthenticatedRequest } from '../../types';
import { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validation.middleware';
import { BudgetRepository } from '../budgets/budget.repository';

const budgetRepo = new BudgetRepository();

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

      const updated = await prisma.$transaction(async (tx) => {
        // Same per-user advisory lock used by BudgetService create/update:
        // FOR UPDATE on existing rows can't guard an aggregate check against
        // a concurrent budget create (phantom row, invisible until commit).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`;

        const account = await tx.account.findFirst({ where: { userId, isDefault: true } });
        if (!account) throw Object.assign(new Error('Default account not found'), { status: 404 });

        const [totalAllocated, balanceAgg] = await Promise.all([
          budgetRepo.getTotalAllocated(userId, tx),
          tx.account.aggregate({ where: { userId }, _sum: { balance: true } }),
        ]);
        const currentTotalBalance = Number(balanceAgg._sum.balance ?? 0);
        const newTotalBalance = currentTotalBalance - Number(account.balance) + req.body.balance;
        if (newTotalBalance < totalAllocated) {
          throw Object.assign(
            new Error(
              `ยอดเงินใหม่ทำให้ยอดรวมในบัญชีน้อยกว่ายอดที่จัดสรรไว้แล้ว (จัดสรรแล้ว ${totalAllocated.toFixed(2)} บาท) กรุณาลดยอดจัดสรรงบก่อน`,
            ),
            { status: 400 },
          );
        }

        return tx.account.update({ where: { id: account.id }, data: { balance: req.body.balance } });
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
