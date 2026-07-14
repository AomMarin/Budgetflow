import { NotificationType } from '@prisma/client';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
}

export interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}
