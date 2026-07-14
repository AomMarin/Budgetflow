import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { User, Role } from '../types';

export const ADMIN_USERS_KEY = ['admin', 'users'];

type ApiError = {
  response?: { data?: { message?: string; errors?: { field: string; message: string }[] } };
};

function errorMessage(err: ApiError, fallback: string): string {
  const detail = err.response?.data?.errors?.[0]?.message;
  return detail ?? err.response?.data?.message ?? fallback;
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ADMIN_USERS_KEY,
    queryFn: async (): Promise<User[]> => {
      const res = await api.get('/admin/users');
      return res.data.data.users;
    },
  });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; password: string; name: string; role: Role }) =>
      api.post('/admin/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
      toast.success('User created');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'Failed to create user')),
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; email?: string; password?: string; name?: string; role?: Role }) =>
      api.patch(`/admin/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
      toast.success('User updated');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'Failed to update user')),
  });
}

export function useDeleteAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
      toast.success('User deleted');
    },
    onError: (err: ApiError) => toast.error(errorMessage(err, 'Failed to delete user')),
  });
}
