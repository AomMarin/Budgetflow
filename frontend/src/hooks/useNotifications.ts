import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Notification } from '../types';

export const NOTIFICATIONS_KEY = ['notifications'];
export const NOTIFICATIONS_UNREAD_KEY = ['notifications', 'unread-count'];

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async (): Promise<Notification[]> => {
      const res = await api.get('/notifications', { params: { limit: 20 } });
      return res.data.data.notifications;
    },
    enabled,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: NOTIFICATIONS_UNREAD_KEY,
    queryFn: async (): Promise<number> => {
      const res = await api.get('/notifications/unread-count');
      return res.data.data.count;
    },
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
    },
  });
}
