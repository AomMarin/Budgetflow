import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import { DashboardData } from '../types';

// Only ever consumed by DashboardPage, so the period param is added directly
// to this hook rather than as a sibling — the bare (no-arg) call stays
// available for safety but isn't hit by the app's UI once the month switcher
// always passes one.
export function useDashboard(period?: { year: number; month: number }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: period ? ['dashboard', period.year, period.month] : ['dashboard'],
    queryFn: async (): Promise<DashboardData> => {
      const res = await api.get('/dashboard', { params: period });
      return res.data.data;
    },
    refetchInterval: 60_000,
    enabled: isAuthenticated,
  });
}
