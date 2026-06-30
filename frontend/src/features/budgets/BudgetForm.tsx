import { useState, useEffect } from 'react';
import { Budget } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCreateBudget, useUpdateBudget, useBudgets } from '@/hooks/useBudgets';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Account } from '@/types';
import { formatCurrency } from '@/utils/format';

const PRESET_ICONS = [
  '💰','🍔','🚗','🛍️','🎬','🏠','💊','✈️',
  '🎓','💡','📱','🏋️','🆘','💳','🎮','📚',
  '🐶','🌿','☕','🎵','🏖️','🧴','🎁','⚽',
];
const PRESET_COLORS = [
  '#3B82F6','#EF4444','#F59E0B','#10B981',
  '#8B5CF6','#EC4899','#6366F1','#14B8A6',
  '#F97316','#84CC16','#06B6D4','#A855F7',
];

interface Props {
  open: boolean;
  onClose: () => void;
  budget?: Budget;
}

export function BudgetForm({ open, onClose, budget }: Props) {
  const isEditing = !!budget;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💰');
  const [color, setColor] = useState('#3B82F6');
  const [allocatedAmount, setAllocatedAmount] = useState('');

  // Reset form every time the modal opens or budget changes
  useEffect(() => {
    if (open) {
      setName(budget?.name ?? '');
      setIcon(budget?.icon ?? '💰');
      setColor(budget?.color ?? '#3B82F6');
      setAllocatedAmount(budget ? String(Number(budget.allocatedAmount)) : '');
    }
  }, [open, budget]);

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get('/accounts');
      return res.data.data.accounts;
    },
    enabled: open,
  });
  const { data: budgets = [] } = useBudgets();

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const totalAllocated = budgets.reduce((s, b) => s + Number(b.allocatedAmount), 0);
  // When editing, exclude the current budget's allocation from the "already allocated" sum
  const currentAllocation = isEditing ? Number(budget.allocatedAmount) : 0;
  const availableToAllocate = totalBalance - totalAllocated + currentAllocation;

  const enteredAmount = parseFloat(allocatedAmount) || 0;
  const exceedsAvailable = enteredAmount > availableToAllocate && totalBalance > 0;

  const create = useCreateBudget();
  const update = useUpdateBudget();
  const isLoading = create.isPending || update.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(allocatedAmount);
    if (isNaN(amount) || amount < 0) return;
    if (exceedsAvailable) return;

    const data = { name: name.trim(), icon, color, allocatedAmount: amount };

    if (isEditing) {
      update.mutate({ id: budget.id, ...data }, { onSuccess: onClose });
    } else {
      create.mutate(data, { onSuccess: onClose });
    }
  };

  const previewAmount = parseFloat(allocatedAmount || '0') || 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'แก้ไข Budget' : 'สร้าง Budget ใหม่'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Name */}
        <Input
          label="ชื่อ Budget"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น ค่าอาหาร, เดินทาง, ออมทรัพย์"
          required
          autoFocus
        />

        {/* Icon picker */}
        <div>
          <label className="label">ไอคอน</label>
          <div className="grid grid-cols-8 gap-1.5">
            {PRESET_ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className={`text-xl p-2 rounded-xl border-2 transition-all hover:scale-110 ${
                  icon === i
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 scale-110 shadow-sm'
                    : 'border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <label className="label">สี</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                  color === c
                    ? 'border-gray-800 dark:border-white scale-110 shadow-md'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Allocated Amount */}
        <div>
          <Input
            label="จำนวนเงินที่จัดสรร (บาท)"
            type="number"
            min="0"
            step="0.01"
            value={allocatedAmount}
            onChange={(e) => setAllocatedAmount(e.target.value)}
            placeholder="0.00"
            hint={totalBalance > 0 ? `จัดสรรได้อีก: ${formatCurrency(availableToAllocate)}` : undefined}
            required
          />
          {exceedsAvailable && (
            <p className="text-xs text-red-500 mt-1">
              จำนวนเงินเกินยอดคงเหลือที่จัดสรรได้ (สูงสุด {formatCurrency(availableToAllocate)})
            </p>
          )}
        </div>

        {/* Live Preview */}
        <div
          className="flex items-center gap-3 p-4 rounded-2xl border-2 transition-all"
          style={{ borderColor: `${color}40`, backgroundColor: `${color}08` }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm"
            style={{ backgroundColor: `${color}25` }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white truncate">
              {name || 'ชื่อ Budget'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ฿{previewAmount.toLocaleString('th-TH', { minimumFractionDigits: 0 })} จัดสรรแล้ว
            </p>
          </div>
          <div
            className="w-2 h-10 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={isLoading}
          >
            ยกเลิก
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={isLoading}
            disabled={!name.trim() || !allocatedAmount || exceedsAvailable}
          >
            {isEditing ? 'บันทึกการแก้ไข' : 'สร้าง Budget'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
