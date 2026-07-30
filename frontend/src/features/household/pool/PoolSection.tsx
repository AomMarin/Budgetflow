import { useState } from 'react';
import { PiggyBank, Plus, ArrowDownCircle, ArrowUpCircle, Undo2, Wallet, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { BudgetCard } from '@/features/budgets/BudgetCard';
import { formatCurrency } from '@/utils/format';
import { Household } from '@/hooks/useHousehold';
import {
  usePool,
  usePoolEnable,
  usePoolTransactions,
  usePoolDeleteBudget,
  usePoolReverseContribution,
  usePoolDeleteTransaction,
  PoolTransaction,
} from '@/hooks/usePoolBudget';
import { Budget } from '@/types';
import { PoolBudgetForm } from './PoolBudgetForm';
import { PoolSpendForm } from './PoolSpendForm';
import { ContributeModal } from './ContributeModal';

interface Props {
  household: Household;
}

export function PoolSection({ household }: Props) {
  const isOwner = household.myRole === 'OWNER';
  const enable = usePoolEnable();

  const { data: pool, isLoading } = usePool(household.poolEnabled);
  const { data: txData } = usePoolTransactions(household.poolEnabled);
  const deleteBudget = usePoolDeleteBudget();
  const reverse = usePoolReverseContribution();
  const deleteTransaction = usePoolDeleteTransaction();

  const [createBudgetOpen, setCreateBudgetOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [spendOpen, setSpendOpen] = useState(false);
  const [editTransaction, setEditTransaction] = useState<PoolTransaction | null>(null);
  const [contributeOpen, setContributeOpen] = useState(false);

  const handleDeleteTransaction = (tx: PoolTransaction) => {
    if (confirm('ลบรายการนี้? ยอดเงินและงบที่เกี่ยวข้องจะถูกคืนกลับ')) {
      deleteTransaction.mutate(tx.id);
    }
  };

  if (!household.poolEnabled) {
    return (
      <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
        <div className="card p-6">
          <EmptyState
            icon={<PiggyBank className="w-full h-full" />}
            title="ยังไม่ได้เปิดใช้งบกลาง"
            description="สมาชิกในครอบครัวสามารถสมทบเงินและใช้จ่ายร่วมกันได้ผ่านงบกลาง"
            action={
              isOwner
                ? { label: 'เปิดใช้งบกลาง', onClick: () => enable.mutate() }
                : undefined
            }
          />
          {!isOwner && (
            <p className="text-xs text-gray-400 text-center mt-2">ให้เจ้าของครอบครัวเป็นผู้เปิดใช้งาน</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">งบกลางครอบครัว</p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<ArrowDownCircle className="w-4 h-4" />} onClick={() => setContributeOpen(true)}>
            สมทบเงิน
          </Button>
          <Button size="sm" icon={<ArrowUpCircle className="w-4 h-4" />} onClick={() => setSpendOpen(true)}>
            ใช้จ่าย
          </Button>
        </div>
      </div>

      {/* Balance card */}
      <div className="p-4 rounded-xl bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <p className="text-xs text-gray-500">ยอดคงเหลือในงบกลาง</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(pool?.balance ?? 0)}</p>
        </div>
      </div>

      {/* Pool budgets */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : (pool?.budgets.length ?? 0) === 0 ? (
        <button
          onClick={() => setCreateBudgetOpen(true)}
          className="w-full card p-5 border-dashed border-2 border-gray-200 dark:border-gray-700
                     flex flex-col items-center justify-center gap-2 min-h-[120px]
                     text-gray-400 dark:text-gray-600 hover:border-primary-400 hover:text-primary-500
                     transition-all duration-200"
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">สร้างงบกลางแรก</span>
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pool!.budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onEdit={() => setEditBudget(budget)}
              onDelete={() => deleteBudget.mutate(budget.id)}
            />
          ))}
          <button
            onClick={() => setCreateBudgetOpen(true)}
            className="card p-5 border-dashed border-2 border-gray-200 dark:border-gray-700
                       flex flex-col items-center justify-center gap-2 min-h-[120px]
                       text-gray-400 dark:text-gray-600 hover:border-primary-400 hover:text-primary-500
                       transition-all duration-200"
          >
            <Plus className="w-5 h-5" />
            <span className="text-sm font-medium">เพิ่มงบกลาง</span>
          </button>
        </div>
      )}

      {/* Recent pool transactions */}
      {txData && txData.transactions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">รายการล่าสุด</p>
          {txData.transactions.slice(0, 10).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{tx.description}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  {tx.actor?.name && <Badge variant="default">{tx.actor.name}</Badge>}
                  {new Date(tx.date).toLocaleDateString('th-TH')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-sm font-semibold ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                  {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(Number(tx.amount))}
                </span>
                {tx.linkedTransactionId && tx.type === 'INCOME' && (
                  <button
                    onClick={() => reverse.mutate(tx.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                    title="ยกเลิกการสมทบนี้"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {!tx.linkedTransactionId && (
                  <>
                    <button
                      onClick={() => setEditTransaction(tx)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary-500 transition-colors"
                      title="แก้ไขรายการนี้"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTransaction(tx)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                      title="ลบรายการนี้"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <PoolBudgetForm open={createBudgetOpen} onClose={() => setCreateBudgetOpen(false)} />
      <PoolBudgetForm open={!!editBudget} onClose={() => setEditBudget(null)} budget={editBudget ?? undefined} />
      <PoolSpendForm open={spendOpen} onClose={() => setSpendOpen(false)} />
      <PoolSpendForm open={!!editTransaction} onClose={() => setEditTransaction(null)} transaction={editTransaction ?? undefined} />
      <ContributeModal open={contributeOpen} onClose={() => setContributeOpen(false)} />
    </div>
  );
}
