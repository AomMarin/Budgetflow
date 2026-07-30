import path from 'path';
import fs from 'fs';
import { prisma } from '../../config/database';
import { parseCsvFile, applyCategorizationRules } from '../../utils/csv-parser';
import { buildPaginationMeta } from '../../utils/response';
import { notifyBudgetAlerts } from '../../utils/budget-alerts';

export class ImportService {
  async upload(userId: string, file: Express.Multer.File, accountId: string) {
    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

    const importFile = await prisma.importFile.create({
      data: {
        userId,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        status: 'PENDING',
      },
    });

    // Process asynchronously
    this.processFile(importFile.id, userId, accountId, file.path).catch(async (err) => {
      await prisma.importFile.update({
        where: { id: importFile.id },
        data: { status: 'FAILED', errorMessage: err.message },
      });
    });

    return importFile;
  }

  private async processFile(
    importFileId: string,
    userId: string,
    accountId: string,
    filePath: string,
  ) {
    await prisma.importFile.update({
      where: { id: importFileId },
      data: { status: 'PROCESSING' },
    });

    const rules = await prisma.importRule.findMany({
      where: { userId },
      orderBy: { priority: 'desc' },
    });

    const rawRows = await parseCsvFile(filePath);
    const categorized = applyCategorizationRules(rawRows, rules);

    let matchedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const row of categorized) {
        if (row.budgetId) matchedCount++;

        await tx.transaction.create({
          data: {
            userId,
            accountId,
            budgetId: row.budgetId,
            amount: row.amount,
            type: row.type,
            description: row.description,
            date: row.date,
            importFileId,
            isImported: true,
          },
        });

        if (row.type === 'INCOME') {
          await tx.account.update({
            where: { id: accountId },
            data: { balance: { increment: row.amount } },
          });
        } else {
          await tx.account.update({
            where: { id: accountId },
            data: { balance: { decrement: row.amount } },
          });
          if (row.budgetId) {
            await tx.budget.update({
              where: { id: row.budgetId },
              data: { spentAmount: { increment: row.amount } },
            });
          }
        }
      }

      await tx.importFile.update({
        where: { id: importFileId },
        data: {
          status: 'COMPLETED',
          rowCount: categorized.length,
          matchedCount,
          processedAt: new Date(),
        },
      });
    });

    if (matchedCount > 0) {
      await notifyBudgetAlerts(userId);
    }

    // Clean up file
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  async getStatus(id: string, userId: string) {
    const importFile = await prisma.importFile.findFirst({ where: { id, userId } });
    if (!importFile) throw Object.assign(new Error('Import not found'), { status: 404 });
    return importFile;
  }

  async getAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [imports, total] = await prisma.$transaction([
      prisma.importFile.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.importFile.count({ where: { userId } }),
    ]);
    return { imports, meta: buildPaginationMeta(total, page, limit) };
  }

  async getImportedTransactions(importFileId: string, userId: string) {
    const importFile = await prisma.importFile.findFirst({ where: { id: importFileId, userId } });
    if (!importFile) throw Object.assign(new Error('Import not found'), { status: 404 });

    return prisma.transaction.findMany({
      where: { importFileId, userId },
      include: { budget: { select: { id: true, name: true, icon: true, color: true } } },
      orderBy: { date: 'desc' },
    });
  }

  async getRules(userId: string) {
    return prisma.importRule.findMany({
      where: { userId },
      include: { budget: { select: { id: true, name: true, icon: true, color: true } } },
      orderBy: { priority: 'desc' },
    });
  }

  async createRule(userId: string, keyword: string, budgetId: string, priority = 0) {
    const budget = await prisma.budget.findFirst({ where: { id: budgetId, userId } });
    if (!budget) throw Object.assign(new Error('Budget not found'), { status: 404 });

    return prisma.importRule.upsert({
      where: { userId_keyword: { userId, keyword } },
      update: { budgetId, priority },
      create: { userId, keyword, budgetId, priority },
    });
  }

  async deleteRule(id: string, userId: string) {
    const rule = await prisma.importRule.findFirst({ where: { id, userId } });
    if (!rule) throw Object.assign(new Error('Rule not found'), { status: 404 });
    return prisma.importRule.delete({ where: { id } });
  }
}
