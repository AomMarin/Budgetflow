import { Notification } from '@prisma/client';
import { prisma } from '../../config/database';
import { CreateNotificationDto, ListNotificationsQuery } from './notification.dto';

export class NotificationRepository {
  async findAll(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<{ notifications: Notification[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { userId, ...(query.unreadOnly && { isRead: false }) };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  async countUnread(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }

  async findById(id: string, userId: string): Promise<Notification | null> {
    return prisma.notification.findFirst({ where: { id, userId } });
  }

  async create(dto: CreateNotificationDto): Promise<Notification> {
    return prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        link: dto.link ?? null,
      },
    });
  }

  async markRead(id: string, userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return result.count;
  }

  async markAllRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
