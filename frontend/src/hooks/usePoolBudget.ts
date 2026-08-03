import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Budget, Transaction, PaginationMeta } from '../types';
import { HOUSEHOLD_KEY, HOUSEHOLD_OVERVIEW_KEY } from './useHousehold';

export const POOL_KEY = ['pool'];
export const POOL_BUDGETS_KEY = ['pool', 'budgets'];
export const POOL_TRANSACTIONS_KEY = ['pool', 'transactions'];

export interface PoolSummary {
  accountId: string | null;
  balance: number;
  budgets: Budget[];
}

export interface PoolTransaction extends Transaction {
  actor?: { id: string; name: string } | null;
  linkedTransactionId?: string | null;
}

type ApiError = { response?: { data?: { message?: string } } };
function errorMessage(err: ApiError, fallback: string): string {
  return err.response?.data?.message ?? fallback;
}

export function usePoolEnable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/households/pool/enable'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
      qc.invalidateQueries({ queryKey: POOL_KEY });
      toast.success('เปิดใช้งบกลางเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'เปิดใช้งบกลางไม่สำเร็จ')),
  });
}

export function usePool(enabled: boolean) {
  return useQuery({
    queryKey: POOL_KEY,
    queryFn: async (): Promise<PoolSummary> => {
      const res = await api.get('/households/pool');
      return res.data.data.pool;
    },
    enabled,
  });
}

export function usePoolBudgets(enabled: boolean) {
  return useQuery({
    queryKey: POOL_BUDGETS_KEY,
    queryFn: async (): Promise<Budget[]> => {
      const res = await api.get('/households/pool/budgets');
      return res.data.data.budgets;
    },
    enabled,
  });
}

export function usePoolCreateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Budget>) => api.post('/households/pool/budgets', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOL_KEY });
      qc.invalidateQueries({ queryKey: POOL_BUDGETS_KEY });
      toast.success('สร้างงบกลางเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'สร้างงบกลางไม่สำเร็จ')),
  });
}

export function usePoolUpdateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Budget> & { id: string }) =>
      api.patch(`/households/pool/budgets/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOL_KEY });
      qc.invalidateQueries({ queryKey: POOL_BUDGETS_KEY });
      toast.success('แก้ไขงบกลางเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'แก้ไขงบกลางไม่สำเร็จ')),
  });
}

export function usePoolDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/households/pool/budgets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOL_KEY });
      qc.invalidateQueries({ queryKey: POOL_BUDGETS_KEY });
      toast.success('ลบงบกลางเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'ลบงบกลางไม่สำเร็จ')),
  });
}

export function usePoolTransactions(enabled: boolean) {
  return useQuery({
    queryKey: POOL_TRANSACTIONS_KEY,
    queryFn: async (): Promise<{ transactions: PoolTransaction[]; meta: PaginationMeta }> => {
      const res = await api.get('/households/pool/transactions');
      return { transactions: res.data.data.transactions, meta: res.data.meta };
    },
    enabled,
  });
}

export function usePoolContribute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { amount: number; fromAccountId: string; fromBudgetId?: string; description?: string }) =>
      api.post('/households/pool/contribute', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOL_KEY });
      qc.invalidateQueries({ queryKey: POOL_TRANSACTIONS_KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: HOUSEHOLD_OVERVIEW_KEY });
      toast.success('สมทบเงินเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'สมทบเงินไม่สำเร็จ')),
  });
}

export function usePoolSpend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { budgetId?: string; amount: number; description: string; date: string }) =>
      api.post('/households/pool/spend', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOL_KEY });
      qc.invalidateQueries({ queryKey: POOL_BUDGETS_KEY });
      qc.invalidateQueries({ queryKey: POOL_TRANSACTIONS_KEY });
      toast.success('บันทึกรายจ่ายเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'บันทึกรายจ่ายไม่สำเร็จ')),
  });
}

export function usePoolUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; amount?: number; description?: string; date?: string; budgetId?: string | null }) =>
      api.patch(`/households/pool/transactions/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOL_KEY });
      qc.invalidateQueries({ queryKey: POOL_BUDGETS_KEY });
      qc.invalidateQueries({ queryKey: POOL_TRANSACTIONS_KEY });
      toast.success('แก้ไขรายจ่ายเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'แก้ไขรายจ่ายไม่สำเร็จ')),
  });
}

export function usePoolDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/households/pool/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOL_KEY });
      qc.invalidateQueries({ queryKey: POOL_BUDGETS_KEY });
      qc.invalidateQueries({ queryKey: POOL_TRANSACTIONS_KEY });
      toast.success('ลบรายจ่ายเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'ลบรายจ่ายไม่สำเร็จ')),
  });
}

export function usePoolReverseContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (txId: string) => api.post(`/households/pool/transactions/${txId}/reverse`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOL_KEY });
      qc.invalidateQueries({ queryKey: POOL_TRANSACTIONS_KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: HOUSEHOLD_OVERVIEW_KEY });
      toast.success('ยกเลิกการสมทบเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'ยกเลิกการสมทบไม่สำเร็จ')),
  });
}
