import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useBudgets, useAllocateIncome } from '@/hooks/useBudgets';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Account } from '@/types';
import { formatCurrency } from '@/utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AllocateIncomeModal({ open, onClose }: Props) {
  const { data: budgets = [] } = useBudgets();
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get('/accounts');
      return res.data.data.accounts;
    },
  });
  const allocate = useAllocateIncome();

  const [accountId, setAccountId] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      const defaultAcc = accounts.find((a) => a.isDefault) ?? accounts[0];
      setAccountId(defaultAcc.id);
    }
  }, [accounts, accountId]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setTotalAmount('');
      setAmounts({});
      setNote('');
    }
  }, [open]);

  const income = parseFloat(totalAmount) || 0;
  const totalAllocating = Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const remaining = income - totalAllocating;
  const overAllocated = totalAllocating > income && income > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (income <= 0) return;
    const allocations = Object.entries(amounts)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([budgetId, v]) => ({ budgetId, amount: parseFloat(v) }));

    if (allocations.length === 0) return;

    allocate.mutate({ accountId, totalAmount: income, allocations, note }, { onSuccess: onClose });
  };

  return (
    <Modal open={open} onClose={onClose} title="บันทึกรายได้และจัดสรร" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Account selector */}
        <div>
          <label className="label">บัญชี</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="input"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — ยอดปัจจุบัน: {formatCurrency(Number(a.balance))}
              </option>
            ))}
          </select>
        </div>

        {/* Total income */}
        <Input
          label="รายได้ทั้งหมด (บาท)"
          type="number"
          min="0.01"
          step="0.01"
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
          placeholder="เช่น 50000"
          required
        />

        {/* Budget amounts */}
        <div>
          <label className="label">จัดสรรไปยัง Budget</label>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {budgets.map((b) => (
              <div key={b.id} className="flex items-center gap-3">
                <span className="w-6 text-center text-base flex-shrink-0">{b.icon}</span>
                <span className="text-sm text-gray-700 dark:text-gray-300 w-32 flex-shrink-0 truncate">
                  {b.name}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={amounts[b.id] ?? ''}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [b.id]: e.target.value }))}
                  className="input flex-1"
                />
              </div>
            ))}
          </div>
        </div>

        <Input
          label="หมายเหตุ (ไม่จำเป็น)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น เงินเดือน มิถุนายน"
        />

        {/* Summary */}
        <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 text-sm">
          <div className="flex items-center justify-between px-4 py-2.5 bg-green-50 dark:bg-green-900/20">
            <span className="text-gray-600 dark:text-gray-400">รายได้ทั้งหมด</span>
            <span className="font-semibold text-green-700 dark:text-green-400">
              {formatCurrency(income)}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-gray-600 dark:text-gray-400">จัดสรรแล้ว</span>
            <span className={`font-semibold ${overAllocated ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'}`}>
              {formatCurrency(totalAllocating)}
            </span>
          </div>
          <div className={`flex items-center justify-between px-4 py-2.5 ${
            overAllocated
              ? 'bg-red-50 dark:bg-red-900/20'
              : remaining > 0
              ? 'bg-amber-50 dark:bg-amber-900/20'
              : 'bg-gray-50 dark:bg-gray-800/60'
          }`}>
            <span className="text-gray-600 dark:text-gray-400">ยังไม่ได้จัดสรร</span>
            <span className={`font-semibold ${
              overAllocated ? 'text-red-500' : remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'
            }`}>
              {formatCurrency(remaining)}
            </span>
          </div>
        </div>

        {overAllocated && (
          <p className="text-xs text-red-500">⚠ จำนวนที่จัดสรรมากกว่ารายได้ที่ระบุ</p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={allocate.isPending}
            disabled={income <= 0 || totalAllocating <= 0 || overAllocated}
          >
            บันทึกรายได้และจัดสรร
          </Button>
        </div>
      </form>
    </Modal>
  );
}
