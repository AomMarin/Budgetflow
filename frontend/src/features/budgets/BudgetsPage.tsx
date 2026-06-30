import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, MoreVertical, Wallet, TrendingUp } from 'lucide-react';
import { useBudgets } from '@/hooks/useBudgets';
import { Budget } from '@/types';
import { formatCurrency, formatPercent } from '@/utils/format';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { BudgetForm } from './BudgetForm';
import { DeleteBudgetModal } from './DeleteBudgetModal';
import { AllocateIncomeModal } from './AllocateIncomeModal';

export function BudgetsPage() {
  const { data: budgets = [], isLoading } = useBudgets();

  const [createOpen, setCreateOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [deleteBudget, setDeleteBudget] = useState<Budget | null>(null);
  const [allocateOpen, setAllocateOpen] = useState(false);

  const totalAllocated = budgets.reduce((s, b) => s + Number(b.allocatedAmount), 0);
  const totalSpent = budgets.reduce((s, b) => s + Number(b.spentAmount), 0);
  const totalRemaining = totalAllocated - totalSpent;
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

/* ─── Budget Card ─────────────────────────────────────────── */

function BudgetCard({
  budget,
  onEdit,
  onDelete,
}: {
  budget: Budget;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const remaining = Number(budget.allocatedAmount) - Number(budget.spentAmount);
  const alertVariant =
    budget.alertLevel === '100' ? 'danger' :
    budget.alertLevel ? 'warning' : 'success';

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="card p-5 hover:shadow-md transition-all duration-200 group">

      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm"
            style={{ backgroundColor: `${budget.color}20` }}
          >
            {budget.icon}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white leading-tight">
              {budget.name}
            </h3>
            <Badge variant={alertVariant} className="mt-1">
              {formatPercent(budget.usagePercent)} ใช้แล้ว
            </Badge>
          </div>
        </div>

        {/* Menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600
                       hover:text-gray-600 dark:hover:text-gray-300
                       hover:bg-gray-100 dark:hover:bg-gray-800
                       opacity-0 group-hover:opacity-100 transition-all"
            aria-label="เมนู"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-40
                            bg-white dark:bg-gray-800
                            border border-gray-100 dark:border-gray-700
                            rounded-xl shadow-xl overflow-hidden
                            animate-fade-in">
              <button
                onClick={() => { setMenuOpen(false); onEdit(); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm
                           text-gray-700 dark:text-gray-300
                           hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-gray-400" />
                แก้ไข
              </button>
              <div className="h-px bg-gray-100 dark:bg-gray-700 mx-2" />
              <button
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm
                           text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ลบ
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      <ProgressBar value={budget.usagePercent} color={budget.color} />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div className="p-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">จัดสรร</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-tight">
            {formatCurrency(Number(budget.allocatedAmount))}
          </p>
        </div>
        <div className="p-2 bg-red-50 dark:bg-red-900/10 rounded-xl">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">ใช้แล้ว</p>
          <p className="text-sm font-semibold text-red-500 leading-tight">
            {formatCurrency(Number(budget.spentAmount))}
          </p>
        </div>
        <div className={`p-2 rounded-xl ${
          remaining < 0
            ? 'bg-red-50 dark:bg-red-900/10'
            : 'bg-green-50 dark:bg-green-900/10'
        }`}>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">คงเหลือ</p>
          <p className={`text-sm font-semibold leading-tight ${
            remaining < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'
          }`}>
            {formatCurrency(remaining)}
          </p>
        </div>
      </div>

      {/* Edit / Delete quick-action bar (visible on hover) */}
      <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium
                     text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400
                     hover:bg-primary-50 dark:hover:bg-primary-900/20
                     rounded-lg border border-gray-200 dark:border-gray-700
                     transition-colors"
        >
          <Pencil className="w-3 h-3" /> แก้ไข
        </button>
        <button
          onClick={onDelete}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium
                     text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400
                     hover:bg-red-50 dark:hover:bg-red-900/20
                     rounded-lg border border-gray-200 dark:border-gray-700
                     transition-colors"
        >
          <Trash2 className="w-3 h-3" /> ลบ
        </button>
      </div>
    </div>
  );
}
