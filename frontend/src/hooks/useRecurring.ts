import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../services/api';

export interface RecurringTransaction {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  amount: string;
  dayOfMonth: number;
  description: string | null;
  isActive: boolean;
  lastRunAt: string | null;
  accountId: string;
  budgetId: string | null;
  account: { id: string; name: string };
  budget: { id: string; name: string; icon: string; color: string } | null;
  createdAt: string;
}

export const RECURRING_KEY = ['recurring'];

export function useRecurring() {
  return useQuery<RecurringTransaction[]>({
    queryKey: RECURRING_KEY,
    queryFn: async () => {
      const res = await api.get('/recurring');
      return res.data.data.recurringTransactions;
    },
  });
}

export function useCreateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => api.post('/recurring', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECURRING_KEY });
      toast.success('เพิ่มรายการอัตโนมัติแล้ว');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'เกิดข้อผิดพลาด');
    },
  });
}

export function useUpdateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) => api.patch(`/recurring/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECURRING_KEY });
      toast.success('อัปเดตแล้ว');
    },
    onError: () => toast.error('เกิดข้อผิดพลาด'),
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/recurring/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECURRING_KEY });
      toast.success('ลบรายการแล้ว');
    },
    onError: () => toast.error('เกิดข้อผิดพลาด'),
  });
}

export function useProcessRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/recurring/process'),
    onSuccess: (res) => {
      const { processed, names } = res.data.data as { processed: number; names: string[] };
      if (processed > 0) {
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        qc.invalidateQueries({ queryKey: ['transactions'] });
        qc.invalidateQueries({ queryKey: ['accounts'] });
        qc.invalidateQueries({ queryKey: ['budgets'] });
        toast.success(`รายการอัตโนมัติ: ${names.join(', ')}`, { duration: 4000 });
      }
    },
  });
}
