import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePool, usePoolSpend, usePoolUpdateTransaction, PoolTransaction } from '@/hooks/usePoolBudget';
import { formatCurrency } from '@/utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
  transaction?: PoolTransaction;
}

export function PoolSpendForm({ open, onClose, transaction }: Props) {
  const isEdit = !!transaction;
  const { data: pool } = usePool(open);
  const budgets = pool?.budgets ?? [];
  const spend = usePoolSpend();
  const update = usePoolUpdateTransaction();
  const mutation = isEdit ? update : spend;

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [budgetId, setBudgetId] = useState('');

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setAmount(String(transaction.amount));
      setDescription(transaction.description);
      setDate(format(new Date(transaction.date), 'yyyy-MM-dd'));
      setBudgetId(transaction.budgetId ?? '');
    } else {
      setAmount('');
      setDescription('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setBudgetId('');
    }
  }, [open, transaction]);

  const selectedBudget = budgets.find((b) => b.id === budgetId);
  const enteredAmount = parseFloat(amount) || 0;
  const budgetRemaining = selectedBudget
    ? Number(selectedBudget.remainingAmount) + (transaction?.budgetId === budgetId ? Number(transaction.amount) : 0)
    : Infinity;
  const isBudgetInsufficient = !!budgetId && enteredAmount > 0 && enteredAmount > budgetRemaining;

  const reset = () => {
    setAmount('');
    setDescription('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setBudgetId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isBudgetInsufficient) return;
    if (isEdit) {
      update.mutate(
        { id: transaction.id, budgetId: budgetId || null, amount: enteredAmount, description, date },
        { onSuccess: () => { reset(); onClose(); } },
      );
    } else {
      spend.mutate(
        { budgetId: budgetId || undefined, amount: enteredAmount, description, date },
        { onSuccess: () => { reset(); onClose(); } },
      );
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'แก้ไขรายจ่ายงบกลาง' : 'ใช้จ่ายจากงบกลาง'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="จำนวนเงิน"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
          autoFocus
        />

        <Input
          label="รายละเอียด"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="ใช้จ่ายเรื่องอะไร?"
          required
        />

        <Input label="วันที่" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

        <div>
          <label className="label">งบกลาง (ไม่ระบุก็ได้)</label>
          <select value={budgetId} onChange={(e) => setBudgetId(e.target.value)} className="input">
            <option value="">ไม่ระบุงบ</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.icon} {b.name} — เหลือ {formatCurrency(Number(b.remainingAmount))}
              </option>
            ))}
          </select>
          {selectedBudget && !isBudgetInsufficient && (
            <p className="text-xs text-gray-400 mt-1">คงเหลือในงบนี้: {formatCurrency(budgetRemaining)}</p>
          )}
        </div>

        {isBudgetInsufficient && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-1">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              งบ "{selectedBudget?.name}" ไม่เพียงพอ
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-300">
              เหลือ {formatCurrency(budgetRemaining)} — ขาดอีก {formatCurrency(enteredAmount - budgetRemaining)}
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" className="flex-1" loading={mutation.isPending} disabled={isBudgetInsufficient}>
            {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกรายจ่าย'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
