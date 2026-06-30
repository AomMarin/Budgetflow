import { Trash2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useDeleteBudget } from '@/hooks/useBudgets';
import { Budget } from '@/types';
import { formatCurrency } from '@/utils/format';

interface Props {
  budget: Budget | null;
  onClose: () => void;
}

export function DeleteBudgetModal({ budget, onClose }: Props) {
  const deleteBudget = useDeleteBudget();
  const hasSpending = Number(budget?.spentAmount ?? 0) > 0;

  const handleConfirm = () => {
    if (!budget) return;
    deleteBudget.mutate(budget.id, { onSuccess: onClose });
  };

  return (
    <Modal open={!!budget} onClose={onClose} title="ลบ Budget" size="sm">
      <div className="space-y-4">
        {/* Icon + name */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ backgroundColor: `${budget?.color ?? '#ccc'}20` }}
          >
            {budget?.icon}
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{budget?.name}</p>
            <p className="text-xs text-gray-500">
              จัดสรร {formatCurrency(Number(budget?.allocatedAmount ?? 0))}
              {' · '}ใช้ไป {formatCurrency(Number(budget?.spentAmount ?? 0))}
            </p>
          </div>
        </div>

        {/* Warning */}
        <div className={`flex gap-3 p-3 rounded-xl text-sm ${
          hasSpending
            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
        }`}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            {hasSpending
              ? 'Budget นี้มีรายการธุรกรรมอยู่ ระบบจะ Archive แทนการลบถาวร เพื่อรักษาประวัติข้อมูล'
              : 'Budget นี้จะถูกลบถาวร ไม่สามารถกู้คืนได้'}
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={deleteBudget.isPending}
          >
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={deleteBudget.isPending}
            onClick={handleConfirm}
            icon={<Trash2 className="w-4 h-4" />}
          >
            {hasSpending ? 'Archive' : 'ลบ Budget'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
