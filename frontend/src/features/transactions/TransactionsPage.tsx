import { useState } from 'react';
import { Plus, Search, Pencil, Trash2, Receipt, ListPlus } from 'lucide-react';
import { useTransactions, useDeleteTransaction } from '@/hooks/useTransactions';
import { useBudgets } from '@/hooks/useBudgets';
import { Transaction } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/Skeleton';
import { TransactionForm } from './TransactionForm';
import { BatchTransactionModal } from './BatchTransactionModal';

export function TransactionsPage() {
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | 'INCOME' | 'EXPENSE'>('');
  const [budgetId, setBudgetId] = useState('');
  const [page, setPage] = useState(1);

  const { data: budgets = [] } = useBudgets();
  const { data, isLoading } = useTransactions({
    search: search || undefined,
    type: type || undefined,
    budgetId: budgetId || undefined,
    page,
    limit: 20,
  });

  const deleteTx = useDeleteTransaction();

  const transactions = data?.transactions ?? [];
  const meta = data?.meta;

  const handleDelete = (id: string) => {
    if (confirm('Delete this transaction? This will reverse the balance effects.')) {
      deleteTx.mutate(id);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{meta?.total ?? 0} รายการ</p>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="secondary"
            icon={<ListPlus className="w-4 h-4" />}
            onClick={() => setShowBatch(true)}
            className="hidden sm:flex"
          >
            เพิ่มหลายรายการ
          </Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            <span className="hidden sm:inline">Add Transaction</span>
            <span className="sm:hidden">เพิ่ม</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-48">
            <Input
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value as '' | 'INCOME' | 'EXPENSE'); setPage(1); }}
            className="input w-40"
          >
            <option value="">All types</option>
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expense</option>
          </select>
          <select
            value={budgetId}
            onChange={(e) => { setBudgetId(e.target.value); setPage(1); }}
            className="input w-48"
          >
            <option value="">All budgets</option>
            {budgets.map((b) => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}
          </select>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden card overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
                </div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-full h-full" />}
            title="No transactions found"
            description="Add your first transaction or adjust your filters"
            action={{ label: 'Add Transaction', onClick: () => setShowCreate(true) }}
          />
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 dark:active:bg-gray-800/40">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0"
                  style={{ backgroundColor: tx.budget?.color ? `${tx.budget.color}20` : '#F3F4F620' }}
                >
                  {tx.budget?.icon ?? '💳'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{tx.description}</p>
                  <p className="text-xs text-gray-400">
                    {formatDate(tx.date)}
                    {tx.budget && <> · {tx.budget.name}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-semibold ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(Number(tx.amount))}
                  </span>
                  <button
                    onClick={() => setEditTx(tx)}
                    className="p-1.5 text-gray-300 hover:text-primary-600 rounded-lg transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Pagination mobile */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500">หน้า {meta.page}/{meta.totalPages}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
              <Button variant="secondary" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>›</Button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              {['Date', 'Description', 'Budget', 'Type', 'Amount', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={6} />)
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={<Receipt className="w-full h-full" />}
                    title="No transactions found"
                    description="Add your first transaction or adjust your filters"
                    action={{ label: 'Add Transaction', onClick: () => setShowCreate(true) }}
                  />
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 group transition-colors">
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatDate(tx.date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{tx.description}</span>
                      {tx.isImported && (
                        <Badge variant="info" className="text-[10px]">imported</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {tx.budget ? (
                      <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <span>{tx.budget.icon}</span>
                        <span>{tx.budget.name}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={tx.type === 'INCOME' ? 'success' : 'danger'}>
                      {tx.type}
                    </Badge>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(Number(tx.amount))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditTx(tx)}
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(tx.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500">
              Page {meta.page} of {meta.totalPages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <TransactionForm open={showCreate} onClose={() => setShowCreate(false)} />
      {editTx && (
        <TransactionForm open={!!editTx} onClose={() => setEditTx(null)} transaction={editTx} />
      )}
      <BatchTransactionModal open={showBatch} onClose={() => setShowBatch(false)} />
    </div>
  );
}
