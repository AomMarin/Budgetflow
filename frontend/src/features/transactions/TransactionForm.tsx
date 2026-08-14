import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useBudgets } from '@/hooks/useBudgets';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { Transaction } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Account } from '@/types';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/format';
import { BorrowBudgetModal } from './BorrowBudgetModal';

interface Props {
  open: boolean;
  onClose: () => void;
  transaction?: Transaction;
}

export function TransactionForm({ open, onClose, transaction }: Props) {
  const { data: budgets = [] } = useBudgets();
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/accounts')).data.data.accounts,
  });
  const create = useCreateTransaction();
  const update = useUpdateTransaction();

  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(transaction?.type ?? 'EXPENSE');
  const [amount, setAmount] = useState(transaction ? String(Number(transaction.amount)) : '');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [date, setDate] = useState(
    transaction ? format(new Date(transaction.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
  );
  const [accountId, setAccountId] = useState(transaction?.accountId ?? '');
  const [budgetId, setBudgetId] = useState(transaction?.budgetId ?? '');
  const [showBorrowModal, setShowBorrowModal] = useState(false);

  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      const def = accounts.find((a) => a.isDefault) ?? accounts[0];
      setAccountId(def.id);
    }
  }, [accounts, accountId]);

  const selectedBudget = budgets.find((b) => b.id === budgetId);
  const enteredAmount = parseFloat(amount) || 0;
  const budgetRemaining = selectedBudget ? Number(selectedBudget.remainingAmount) : Infinity;
  // For edit: add back old contribution if same budget
  const oldContribution =
    transaction && transaction.type === 'EXPENSE' && transaction.budgetId === budgetId
      ? Number(transaction.amount)
      : 0;
  const effectiveRemaining = budgetRemaining + oldContribution;
  const isBudgetInsufficient =
    type === 'EXPENSE' && !!budgetId && enteredAmount > 0 && enteredAmount > effectiveRemaining;
  const shortfall = isBudgetInsufficient ? enteredAmount - effectiveRemaining : 0;

  const buildData = (borrowFromBudgetId?: string) => ({
    type,
    amount: parseFloat(amount),
    description,
    date,
    accountId,
    budgetId: type === 'EXPENSE' && budgetId ? budgetId : undefined,
    ...(borrowFromBudgetId ? { borrowFromBudgetId } : {}),
  });

  const submit = (borrowFromBudgetId?: string) => {
    const data = buildData(borrowFromBudgetId);
    return transaction ? update.mutateAsync({ id: transaction.id, ...data }) : create.mutateAsync(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBudgetInsufficient) {
      setShowBorrowModal(true);
      return;
    }
    try {
      await submit();
      onClose();
    } catch {
      // Error toast already shown by the mutation hook — keep the form open.
    }
  };

  const handleBorrowConfirm = async (borrowFromBudgetId: string) => {
    await submit(borrowFromBudgetId);
    setShowBorrowModal(false);
    onClose();
  };

  // While the borrow modal is open, Escape must close only that (its own
  // handler), not this form underneath it — both listen on window, so this
  // form's own Escape-close is disarmed for as long as the borrow modal is up.
  const handleFormClose = () => {
    if (showBorrowModal) return;
    onClose();
  };

  return (
    <Modal open={open} onClose={handleFormClose} title={transaction ? 'Edit Transaction' : 'Add Transaction'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type toggle */}
        <div>
          <label className="label">Type</label>
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg gap-1">
            {(['EXPENSE', 'INCOME'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                  type === t
                    ? t === 'EXPENSE'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-green-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                {t === 'EXPENSE' ? '− Expense' : '+ Income'}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Amount"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
        />

        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was this for?"
          required
        />

        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />

        <div>
          <label className="label">Account</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input" required>
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {type === 'EXPENSE' && (
          <div>
            <label className="label">Budget (optional)</label>
            <select value={budgetId} onChange={(e) => setBudgetId(e.target.value)} className="input">
              <option value="">No budget / Uncategorized</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.icon} {b.name} — เหลือ {formatCurrency(Number(b.remainingAmount))}
                </option>
              ))}
            </select>
            {selectedBudget && !isBudgetInsufficient && (
              <p className="text-xs text-gray-400 mt-1">
                คงเหลือในงบนี้: {formatCurrency(effectiveRemaining)}
              </p>
            )}
          </div>
        )}

        {isBudgetInsufficient && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-1">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              งบ "{selectedBudget?.name}" ไม่เพียงพอ
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-300">
              เหลือ {formatCurrency(effectiveRemaining)} — ขาดอีก {formatCurrency(shortfall)} — กดบันทึกเพื่อเลือกยืมจากงบอื่น
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            className="flex-1"
            loading={create.isPending || update.isPending}
          >
            {transaction ? 'Save' : 'Add Transaction'}
          </Button>
        </div>
      </form>

      {selectedBudget && (
        <BorrowBudgetModal
          open={showBorrowModal}
          onClose={() => setShowBorrowModal(false)}
          primaryBudget={selectedBudget}
          amount={enteredAmount}
          effectiveRemaining={effectiveRemaining}
          budgets={budgets}
          onConfirm={handleBorrowConfirm}
        />
      )}
    </Modal>
  );
}
