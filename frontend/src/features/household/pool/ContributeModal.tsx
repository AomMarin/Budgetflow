import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/services/api';
import { Account } from '@/types';
import { useBudgets } from '@/hooks/useBudgets';
import { usePoolContribute } from '@/hooks/usePoolBudget';
import { formatCurrency } from '@/utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ContributeModal({ open, onClose }: Props) {
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/accounts')).data.data.accounts,
    enabled: open,
  });
  const { data: myBudgets = [] } = useBudgets();
  const contribute = usePoolContribute();

  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [budgetId, setBudgetId] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open && accounts.length > 0 && !accountId) {
      const def = accounts.find((a) => a.isDefault) ?? accounts[0];
      setAccountId(def.id);
    }
  }, [open, accounts, accountId]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const enteredAmount = parseFloat(amount) || 0;
  const balanceAfter = selectedAccount ? Number(selectedAccount.balance) - enteredAmount : 0;

  const reset = () => {
    setAmount('');
    setBudgetId('');
    setDescription('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredAmount <= 0 || !accountId) return;
    if (!budgetId) return;
    contribute.mutate(
      {
        amount: enteredAmount,
        fromAccountId: accountId,
        fromBudgetId: budgetId,
        description: description || undefined,
      },
      { onSuccess: () => { reset(); onClose(); } },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="สมทบเงินเข้างบกลาง">
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

        <div>
          <label className="label">โอนจากบัญชี</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input" required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {formatCurrency(Number(a.balance))}
              </option>
            ))}
          </select>
          {selectedAccount && (
            <p className="text-xs text-gray-400 mt-1">
              คงเหลือหลังสมทบ: {formatCurrency(balanceAfter)}
            </p>
          )}
        </div>

        <div>
          <label className="label">นับเป็นรายจ่ายในงบของคุณ</label>
          <select value={budgetId} onChange={(e) => setBudgetId(e.target.value)} className="input" required>
            <option value="">เลือกงบ</option>
            {myBudgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.icon} {b.name} — เหลือ {formatCurrency(Number(b.remainingAmount))}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="โน้ต (ไม่ระบุก็ได้)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="เช่น ค่ากับข้าวเดือนนี้"
        />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={contribute.isPending}
            disabled={enteredAmount <= 0 || !accountId || !budgetId}
          >
            สมทบเงิน
          </Button>
        </div>
      </form>
    </Modal>
  );
}
