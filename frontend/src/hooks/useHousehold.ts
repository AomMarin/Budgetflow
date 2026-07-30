import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Budget } from '../types';

export const HOUSEHOLD_KEY = ['household'];
export const HOUSEHOLD_OVERVIEW_KEY = ['household', 'overview'];

export type HouseholdRole = 'OWNER' | 'MEMBER';

export interface HouseholdMember {
  userId: string;
  name: string;
  email: string;
  role: HouseholdRole;
  joinedAt: string;
}

export interface Household {
  id: string;
  name: string;
  myRole: HouseholdRole;
  poolEnabled: boolean;
  members: HouseholdMember[];
}

export interface HouseholdMemberSummary {
  userId: string;
  name: string;
  role: HouseholdRole;
  summary: {
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpense: number;
    budgets: (Budget & { remainingAmount: number; usagePercent: number })[];
  };
}

export interface HouseholdOverview {
  householdId: string;
  householdName: string;
  members: HouseholdMemberSummary[];
}

type ApiError = { response?: { data?: { message?: string } } };
function errorMessage(err: ApiError, fallback: string): string {
  return err.response?.data?.message ?? fallback;
}

export function useHousehold() {
  return useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: async (): Promise<Household | null> => {
      const res = await api.get('/households/mine');
      return res.data.data.household;
    },
  });
}

export function useHouseholdOverview() {
  return useQuery({
    queryKey: HOUSEHOLD_OVERVIEW_KEY,
    queryFn: async (): Promise<HouseholdOverview | null> => {
      const res = await api.get('/households/overview');
      return res.data.data.overview;
    },
  });
}

export function useCreateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post('/households', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
      qc.invalidateQueries({ queryKey: HOUSEHOLD_OVERVIEW_KEY });
      toast.success('สร้างครอบครัวเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'สร้างครอบครัวไม่สำเร็จ')),
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: (householdId: string) =>
      api.post(`/households/${householdId}/invites`).then((res) => res.data.data.invite as { code: string; expiresAt: string }),
    onError: (err: ApiError) => toast.error(errorMessage(err, 'สร้างลิงก์เชิญไม่สำเร็จ')),
  });
}

export function useJoinHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post('/households/join', { code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
      qc.invalidateQueries({ queryKey: HOUSEHOLD_OVERVIEW_KEY });
      toast.success('เข้าร่วมครอบครัวเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'เข้าร่วมไม่สำเร็จ')),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ householdId, userId }: { householdId: string; userId: string }) =>
      api.delete(`/households/${householdId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
      qc.invalidateQueries({ queryKey: HOUSEHOLD_OVERVIEW_KEY });
      toast.success('นำสมาชิกออกเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'นำสมาชิกออกไม่สำเร็จ')),
  });
}

export function useLeaveHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/households/leave'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
      qc.invalidateQueries({ queryKey: HOUSEHOLD_OVERVIEW_KEY });
      toast.success('ออกจากครอบครัวเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'ออกจากครอบครัวไม่สำเร็จ')),
  });
}

export function useDeleteHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/households/mine'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
      qc.invalidateQueries({ queryKey: HOUSEHOLD_OVERVIEW_KEY });
      toast.success('ลบครอบครัวเรียบร้อย');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'ลบครอบครัวไม่สำเร็จ')),
  });
}
