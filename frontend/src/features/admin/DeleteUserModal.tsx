import { Trash2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useDeleteAdminUser } from '@/hooks/useAdmin';
import { User } from '@/types';

interface Props {
  user: User | null;
  onClose: () => void;
}

export function DeleteUserModal({ user, onClose }: Props) {
  const deleteUser = useDeleteAdminUser();

  const handleConfirm = () => {
    if (!user) return;
    deleteUser.mutate(user.id, { onSuccess: onClose });
  };

  return (
    <Modal open={!!user} onClose={onClose} title="ลบผู้ใช้" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-primary-700 dark:text-primary-400">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>

        <div className="flex gap-3 p-3 rounded-xl text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>ผู้ใช้นี้และข้อมูลทั้งหมด (บัญชี, งบ, ธุรกรรม) จะถูกลบถาวร ไม่สามารถกู้คืนได้</p>
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={deleteUser.isPending}
          >
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={deleteUser.isPending}
            onClick={handleConfirm}
            icon={<Trash2 className="w-4 h-4" />}
          >
            ลบผู้ใช้
          </Button>
        </div>
      </div>
    </Modal>
  );
}
