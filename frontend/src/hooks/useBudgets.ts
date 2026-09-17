import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Budget, PeriodMeta } from '../types';

export const BUDGETS_KEY = ['budgets'];

export function useBudgets() {
  return useQuery({
    queryKey: BUDGETS_KEY,
    queryFn: async (): Promise<Budget[]> => {
      const res = await api.get('/budgets');
      return res.data.data.budgets;
    },
  });
}

// Month-switcher read — sibling to useBudgets(), not a replacement. Every
// other consumer of useBudgets() (forms, dropdowns, filters) wants "current
// budgets," not a period concept, so that hook is left untouched. Query key
// falls under the same ['budgets', ...] prefix, so the mutation hooks below
// already invalidate it via their existing BUDGETS_KEY invalidation (React
// Query prefix-matches by default).
export function useBudgetsForPeriod(year: number, month: number) {
  return useQuery({
    queryKey: [...BUDGETS_KEY, year, month],
    queryFn: async (): Promise<{ budgets: Budget[]; period: PeriodMeta }> => {
      const res = await api.get('/budgets', { params: { year, month } });
      return res.data.data;
    },
  });
}

export function useCreateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Budget>) => api.post('/budgets', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BUDGETS_KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Budget created');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Failed to create budget');
    },
  });
}

export function useUpdateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Budget> & { id: string }) =>
      api.patch(`/budgets/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BUDGETS_KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Budget updated');
    },
    onError: () => toast.error('Failed to update budget'),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/budgets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BUDGETS_KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Budget deleted');
    },
    onError: () => toast.error('Failed to delete budget'),
  });
}

export function useAllocateIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { accountId: string; totalAmount: number; allocations: { budgetId: string; amount: number }[]; note?: string }) =>
      api.post('/budgets/allocate', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BUDGETS_KEY });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Income allocated successfully');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Allocation failed');
    },
  });
}
