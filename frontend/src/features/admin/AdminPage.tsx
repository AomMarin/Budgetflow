import { useState } from 'react';
import { Plus, ShieldCheck, Users, Pencil, Trash2 } from 'lucide-react';
import { useAdminUsers } from '@/hooks/useAdmin';
import { useAuthStore } from '@/stores/auth.store';
import { formatDate } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { User } from '@/types';
import { UserForm } from './UserForm';
import { DeleteUserModal } from './DeleteUserModal';

export function AdminPage() {
  const { data: users = [], isLoading } = useAdminUsers();
  const { user: currentUser } = useAuthStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {users.length} ผู้ใช้ในระบบ
        </p>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
          เพิ่มผู้ใช้
        </Button>
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Users className="w-full h-full" />}
            title="ยังไม่มีผู้ใช้"
            description="เพิ่มผู้ใช้แรกของระบบ"
            action={{ label: 'เพิ่มผู้ใช้', onClick: () => setCreateOpen(true) }}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">ชื่อ</th>
                <th className="px-5 py-3 font-medium">อีเมล</th>
                <th className="px-5 py-3 font-medium">สิทธิ์</th>
                <th className="px-5 py-3 font-medium">สมัครเมื่อ</th>
                <th className="px-5 py-3 font-medium text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">
                      {u.name}
                      {isSelf && <span className="ml-2 text-xs text-gray-400">(คุณ)</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{u.email}</td>
                    <td className="px-5 py-3">
                      {u.role === 'ADMIN' ? (
                        <Badge variant="info" className="inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Admin
                        </Badge>
                      ) : (
                        <Badge variant="default">User</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{formatDate(u.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditUser(u)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                          title="แก้ไข"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteUser(u)}
                          disabled={isSelf}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          title={isSelf ? 'ลบบัญชีตัวเองไม่ได้' : 'ลบ'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <UserForm open={createOpen} onClose={() => setCreateOpen(false)} />
      <UserForm open={!!editUser} onClose={() => setEditUser(null)} user={editUser ?? undefined} />
      <DeleteUserModal user={deleteUser} onClose={() => setDeleteUser(null)} />
    </div>
  );
}
