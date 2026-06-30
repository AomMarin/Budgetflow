import { useState } from 'react';
import { Plus, ArrowRight } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/services/api';
import { useBudgets } from '@/hooks/useBudgets';
import { Transfer } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';

export function TransfersPage() {
  const [showForm, setShowForm] = useState(false);

  const { data: transfersData } = useQuery<{ transfers: Transfer[] }>({
    queryKey: ['transfers'],
    queryFn: async () => {
      const res = await api.get('/transfers');
      return res.data.data;
    },
  });

  const transfers = transfersData?.transfers ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-end">
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(true)}>
          New Transfer
        </Button>
      </div>

      <div className="card overflow-hidden">
        {transfers.length === 0 ? (
          <EmptyState
            icon={<ArrowRight className="w-full h-full" />}
            title="No transfers yet"
            description="Move money between budget buckets"
            action={{ label: 'Transfer Now', onClick: () => setShowForm(true) }}
          />
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {transfers.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                      style={{ backgroundColor: `${t.fromBudget.color}20` }}
                    >
                      {t.fromBudget.icon}
                    </div>
                    <div className="text-xs text-center">
                      <p className="font-medium text-gray-800 dark:text-gray-200">{t.fromBudget.name}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                  <div className="flex items-center gap-2">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                      style={{ backgroundColor: `${t.toBudget.color}20` }}
                    >
                      {t.toBudget.icon}
                    </div>
                    <div className="text-xs">
                      <p className="font-medium text-gray-800 dark:text-gray-200">{t.toBudget.name}</p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(Number(t.amount))}</p>
                  <p className="text-xs text-gray-400">{formatDate(t.createdAt)}</p>
                  {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TransferForm open={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
}

function TransferForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: budgets = [] } = useBudgets();
  const qc = useQueryClient();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const transfer = useMutation({
    mutationFn: (data: object) => api.post('/transfers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Transfer completed');
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Transfer failed');
    },
  });

  const fromBudget = budgets.find((b) => b.id === fromId);
  const fromRemaining = fromBudget
    ? Number(fromBudget.allocatedAmount) - Number(fromBudget.spentAmount)
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    transfer.mutate({ fromBudgetId: fromId, toBudgetId: toId, amount: parseFloat(amount), description });
  };

  return (
    <Modal open={open} onClose={onClose} title="Transfer Between Budgets">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">From Budget</label>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="input" required>
            <option value="">Select source budget</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.icon} {b.name} — Available: {formatCurrency(Number(b.allocatedAmount) - Number(b.spentAmount))}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">To Budget</label>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className="input" required>
            <option value="">Select destination budget</option>
            {budgets.filter((b) => b.id !== fromId).map((b) => (
              <option key={b.id} value={b.id}>{b.icon} {b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            hint={fromId ? `Available: ${formatCurrency(fromRemaining)}` : undefined}
            required
          />
          {fromId && parseFloat(amount) > fromRemaining && (
            <p className="text-xs text-red-500 mt-1">Exceeds available balance</p>
          )}
        </div>

        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Reason for transfer"
        />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            className="flex-1"
            loading={transfer.isPending}
            disabled={!fromId || !toId || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > fromRemaining}
          >
            Transfer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
