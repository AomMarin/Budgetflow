import { useState, useEffect } from 'react';
import { Plus, Trash2, ListPlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useBudgets } from '@/hooks/useBudgets';
import { useBatchCreateTransactions } from '@/hooks/useTransactions';
import { api } from '@/services/api';
import { Account } from '@/types';
import { formatCurrency } from '@/utils/format';
import { format } from 'date-fns';
import { cn } from '@/utils/cn';

interface Row {
  id: number;
  type: 'INCOME' | 'EXPENSE';
  description: string;
  amount: string;
  budgetId: string;
}

let rowCounter = 0;
const newRow = (type: 'INCOME' | 'EXPENSE' = 'EXPENSE'): Row => ({
  id: ++rowCounter,
  type,
  description: '',
  amount: '',
  budgetId: '',
});

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BatchTransactionModal({ open, onClose }: Props) {
  const { data: budgets = [] } = useBudgets();
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/accounts')).data.data.accounts,
  });
  const batchCreate = useBatchCreateTransactions();

  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow(), newRow()]);

  useEffect(() => {
    if (open) {
      setRows([newRow(), newRow(), newRow()]);
      setDate(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open]);

  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      const def = accounts.find((a) => a.isDefault) ?? accounts[0];
      setAccountId(def.id);
    }
  }, [accounts, accountId]);

  const setRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: number) =>
    setRows((rs) => rs.filter((r) => r.id !== id));

  const addRow = (type: 'INCOME' | 'EXPENSE' = 'EXPENSE') =>
    setRows((rs) => [...rs, newRow(type)]);

  const validRows = rows.filter(
    (r) => r.description.trim() && parseFloat(r.amount) > 0,
  );

  const totalIncome = validRows
    .filter((r) => r.type === 'INCOME')
    .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const totalExpense = validRows
    .filter((r) => r.type === 'EXPENSE')
    .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validRows.length === 0 || !accountId) return;

    const transactions = validRows.map((r) => ({
      type: r.type,
      description: r.description.trim(),
      amount: parseFloat(r.amount),
      date,
      accountId,
      budgetId: r.type === 'EXPENSE' && r.budgetId ? r.budgetId : undefined,
    }));

    batchCreate.mutate(transactions, { onSuccess: onClose });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เพิ่มหลายรายการพร้อมกัน"
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Shared fields */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="label">บัญชี</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="input"
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="w-44">
            <label className="label">วันที่</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
              required
            />
          </div>
        </div>

        {/* Rows */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {/* Header */}
          <div className="grid grid-cols-[90px_1fr_110px_140px_32px] gap-2 px-1">
            {['ประเภท', 'รายการ', 'จำนวน (฿)', 'Budget', ''].map((h) => (
              <span key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                {h}
              </span>
            ))}
          </div>

          {rows.map((row, idx) => (
            <div
              key={row.id}
              className="grid grid-cols-[90px_1fr_110px_140px_32px] gap-2 items-center"
            >
              {/* Type toggle */}
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 h-9">
                <button
                  type="button"
                  onClick={() => setRow(row.id, { type: 'EXPENSE', budgetId: row.type === 'INCOME' ? '' : row.budgetId })}
                  className={cn(
                    'flex-1 text-[11px] font-medium rounded-md transition-all',
                    row.type === 'EXPENSE'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-600',
                  )}
                >
                  รายจ่าย
                </button>
                <button
                  type="button"
                  onClick={() => setRow(row.id, { type: 'INCOME', budgetId: '' })}
                  className={cn(
                    'flex-1 text-[11px] font-medium rounded-md transition-all',
                    row.type === 'INCOME'
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-600',
                  )}
                >
                  รายรับ
                </button>
              </div>

              {/* Description */}
              <input
                type="text"
                placeholder={`รายการ ${idx + 1}`}
                value={row.description}
                onChange={(e) => setRow(row.id, { description: e.target.value })}
                className="input h-9 text-sm"
              />

              {/* Amount */}
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={row.amount}
                onChange={(e) => setRow(row.id, { amount: e.target.value })}
                className={cn(
                  'input h-9 text-sm text-right',
                  row.type === 'INCOME' ? 'text-green-600' : 'text-red-500',
                )}
              />

              {/* Budget */}
              {row.type === 'EXPENSE' ? (
                <select
                  value={row.budgetId}
                  onChange={(e) => setRow(row.id, { budgetId: e.target.value })}
                  className="input h-9 text-sm"
                >
                  <option value="">ไม่ระบุ</option>
                  {budgets.map((b) => (
                    <option key={b.id} value={b.id}>{b.icon} {b.name}</option>
                  ))}
                </select>
              ) : (
                <div className="h-9" />
              )}

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={rows.length === 1}
                className="h-9 w-8 flex items-center justify-center text-gray-300 hover:text-red-400 disabled:opacity-20 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Add row buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addRow('EXPENSE')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-dashed border-red-200 dark:border-red-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มรายจ่าย
          </button>
          <button
            type="button"
            onClick={() => addRow('INCOME')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg border border-dashed border-green-200 dark:border-green-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มรายรับ
          </button>
        </div>

        {/* Summary */}
        {validRows.length > 0 && (
          <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 text-sm">
            <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700">
              <div className="p-3 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">รายรับ</p>
                <p className="font-semibold text-green-600 mt-0.5">
                  {totalIncome > 0 ? `+${formatCurrency(totalIncome)}` : '—'}
                </p>
              </div>
              <div className="p-3 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">รายจ่าย</p>
                <p className="font-semibold text-red-500 mt-0.5">
                  {totalExpense > 0 ? `−${formatCurrency(totalExpense)}` : '—'}
                </p>
              </div>
              <div className="p-3 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                  {validRows.length} รายการ
                </p>
                <p className={cn(
                  'font-semibold mt-0.5',
                  totalIncome - totalExpense >= 0 ? 'text-green-600' : 'text-red-500',
                )}>
                  {totalIncome - totalExpense >= 0 ? '+' : ''}
                  {formatCurrency(totalIncome - totalExpense)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={batchCreate.isPending}>
            ยกเลิก
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={batchCreate.isPending}
            disabled={validRows.length === 0 || !accountId}
            icon={<ListPlus className="w-4 h-4" />}
          >
            บันทึก {validRows.length > 0 ? `${validRows.length} รายการ` : ''}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
