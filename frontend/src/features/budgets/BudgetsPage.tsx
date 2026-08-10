import { useState } from 'react';
import { Plus, Wallet, PiggyBank } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useBudgets } from '@/hooks/useBudgets';
import { Budget, Account } from '@/types';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/format';
import { calculateAllocationTotals } from '@/utils/allocation';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { BudgetForm } from './BudgetForm';
import { DeleteBudgetModal } from './DeleteBudgetModal';
import { AllocateIncomeModal } from './AllocateIncomeModal';
import { BudgetCard } from './BudgetCard';

export function BudgetsPage() {
  const { data: budgets = [], isLoading } = useBudgets();
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/accounts')).data.data.accounts,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [deleteBudget, setDeleteBudget] = useState<Budget | null>(null);
  const [allocateOpen, setAllocateOpen] = useState(false);

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const {
    totalAllocated,
    totalSpent,
    totalRemaining,
    availableToAllocate: totalUnallocated,
  } = calculateAllocationTotals(budgets, totalBalance);
  const overallPercent = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {budgets.length} bucket{budgets.length !== 1 ? 's' : ''}
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" onClick={() => setAllocateOpen(true)}>
            <span className="hidden sm:inline">จัดสรรรายได้</span>
            <span className="sm:hidden">รับเงิน</span>
          </Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
            <span className="hidden sm:inline">เพิ่ม Budget</span>
            <span className="sm:hidden">เพิ่ม</span>
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-gray-500 dark:text-gray-400">จัดสรรทั้งหมด</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
            {formatCurrency(totalAllocated)}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 dark:text-gray-400">ใช้ไปแล้ว</p>
          <p className="text-xl font-bold text-red-500">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 dark:text-gray-400">คงเหลือ</p>
          <p className={`text-xl font-bold ${totalRemaining >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {formatCurrency(totalRemaining)}
          </p>
          {totalAllocated > 0 && (
            <div className="mt-2">
              <ProgressBar value={overallPercent} size="sm" />
              <p className="text-xs text-gray-400 mt-1">ใช้ไป {overallPercent}%</p>
            </div>
          )}
        </div>
        <div className="stat-card border-2 border-dashed border-purple-200 dark:border-purple-900/50">
          <div className="flex items-center gap-1.5">
            <PiggyBank className="w-3.5 h-3.5 text-purple-500" />
            <p className="text-xs text-gray-500 dark:text-gray-400">ยังไม่ได้จัดสรร</p>
          </div>
          <p className={`text-xl font-bold ${totalUnallocated > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400'}`}>
            {formatCurrency(Math.max(totalUnallocated, 0))}
          </p>
          {totalUnallocated > 0 ? (
            <button
              onClick={() => setCreateOpen(true)}
              className="text-xs text-purple-600 dark:text-purple-400 underline underline-offset-2 mt-1 hover:text-purple-700"
            >
              จัดสรรตอนนี้ →
            </button>
          ) : (
            <p className="text-xs text-gray-400 mt-1">จัดสรรครบแล้ว</p>
          )}
        </div>
      </div>

      {/* Budget grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : budgets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Wallet className="w-full h-full" />}
            title="ยังไม่มี Budget"
            description="สร้าง Budget Bucket แรกเพื่อเริ่มจัดสรรรายได้ของคุณ"
            action={{ label: 'สร้าง Budget', onClick: () => setCreateOpen(true) }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onEdit={() => setEditBudget(budget)}
              onDelete={() => setDeleteBudget(budget)}
            />
          ))}

          {/* Quick-add card */}
          <button
            onClick={() => setCreateOpen(true)}
            className="card p-5 border-dashed border-2 border-gray-200 dark:border-gray-700
                       flex flex-col items-center justify-center gap-2 min-h-[180px]
                       text-gray-400 dark:text-gray-600 hover:border-primary-400 hover:text-primary-500
                       dark:hover:border-primary-600 dark:hover:text-primary-400
                       transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-xl border-2 border-current flex items-center justify-center
                            group-hover:scale-110 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">เพิ่ม Budget ใหม่</span>
          </button>
        </div>
      )}

      {/* Modals */}
      <BudgetForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <BudgetForm
        open={!!editBudget}
        onClose={() => setEditBudget(null)}
        budget={editBudget ?? undefined}
      />
      <DeleteBudgetModal
        budget={deleteBudget}
        onClose={() => setDeleteBudget(null)}
      />
      <AllocateIncomeModal
        open={allocateOpen}
        onClose={() => setAllocateOpen(false)}
      />
    </div>
  );
}
