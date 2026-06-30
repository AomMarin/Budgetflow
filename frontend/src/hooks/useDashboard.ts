import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { DashboardData } from '../types';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<DashboardData> => {
      const res = await api.get('/dashboard');
      return res.data.data;
    },
    refetchInterval: 60_000,
  });
}
