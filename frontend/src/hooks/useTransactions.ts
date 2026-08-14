import { useMutation, useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Transaction, PaginationMeta } from '../types';
import { BUDGETS_KEY } from './useBudgets';
import { formatCurrency } from '../utils/format';

export const TRANSACTIONS_KEY = ['transactions'];

function invalidateAfterMutation(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: TRANSACTIONS_KEY });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: BUDGETS_KEY });
  qc.invalidateQueries({ queryKey: ['accounts'] });
  qc.invalidateQueries({ queryKey: ['reports'] });
}

// Toast a borrow-specific message when the saved transaction crossed budgets
// (splits present, one of which isn't the transaction's own primary budget);
// falls back to the generic message otherwise. Uses the server's authoritative
// split amounts/names, not a client-side guess.
function successToastFor(tx: Transaction, fallback: string): void {
  const borrowSplit = tx.splits?.find((s) => s.budgetId !== tx.budgetId);
  if (borrowSplit) {
    toast.success(
      `บันทึกแล้ว — ยืมจาก "${borrowSplit.budget?.name ?? 'งบอื่น'}" ${formatCurrency(Number(borrowSplit.amount))}`,
    );
  } else {
    toast.success(fallback);
  }
}

interface TransactionFilters {
  type?: 'INCOME' | 'EXPENSE';
  budgetId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, filters],
    queryFn: async (): Promise<{ transactions: Transaction[]; meta: PaginationMeta }> => {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
      );
      const res = await api.get('/transactions', { params });
      return { transactions: res.data.data.transactions, meta: res.data.meta };
    },
  });
}

interface TransactionInput extends Partial<Transaction> {
  // Request-only field: never persisted on Transaction itself, resolved into
  // TransactionSplit rows server-side. See backend TransactionSplit.
  borrowFromBudgetId?: string | null;
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TransactionInput) => api.post('/transactions', data),
    onSuccess: (res) => {
      invalidateAfterMutation(qc);
      successToastFor(res.data.data as Transaction, 'Transaction added');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Failed to add transaction');
    },
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: TransactionInput & { id: string }) =>
      api.patch(`/transactions/${id}`, data),
    onSuccess: (res) => {
      invalidateAfterMutation(qc);
      successToastFor(res.data.data as Transaction, 'Transaction updated');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Failed to update transaction');
    },
  });
}

export function useBatchCreateTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transactions: object[]) => api.post('/transactions/batch', { transactions }),
    onSuccess: (res) => {
      const count = res.data.data.count as number;
      invalidateAfterMutation(qc);
      toast.success(`เพิ่ม ${count} รายการแล้ว`);
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'เกิดข้อผิดพลาด');
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}`),
    onSuccess: () => {
      invalidateAfterMutation(qc);
      toast.success('Transaction deleted');
    },
    onError: () => toast.error('Failed to delete transaction'),
  });
}
