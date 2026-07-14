import { NotificationRepository } from './notification.repository';
import { CreateNotificationDto, ListNotificationsQuery } from './notification.dto';

export class NotificationService {
  constructor(private readonly repo = new NotificationRepository()) {}

  async getAll(userId: string, query: ListNotificationsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [{ notifications, total }, unreadCount] = await Promise.all([
      this.repo.findAll(userId, { ...query, page, limit }),
      this.repo.countUnread(userId),
    ]);

    return {
      notifications,
      unreadCount,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.repo.countUnread(userId);
  }

  async create(dto: CreateNotificationDto) {
    return this.repo.create(dto);
  }

  async markRead(id: string, userId: string): Promise<void> {
    const count = await this.repo.markRead(id, userId);
    if (count === 0) throw Object.assign(new Error('Notification not found'), { status: 404 });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo.markAllRead(userId);
  }
}
