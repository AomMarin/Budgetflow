import { useState, useEffect } from 'react';
import { Budget } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePool, usePoolCreateBudget, usePoolUpdateBudget } from '@/hooks/usePoolBudget';
import { formatCurrency } from '@/utils/format';

const PRESET_ICONS = [
  '💰','🍔','🚗','🛍️','🎬','🏠','💊','✈️',
  '🎓','💡','📱','🏋️','🆘','💳','🎮','📚',
];
const PRESET_COLORS = [
  '#3B82F6','#EF4444','#F59E0B','#10B981',
  '#8B5CF6','#EC4899','#6366F1','#14B8A6',
];

interface Props {
  open: boolean;
  onClose: () => void;
  budget?: Budget;
}

export function PoolBudgetForm({ open, onClose, budget }: Props) {
  const isEditing = !!budget;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💰');
  const [color, setColor] = useState('#3B82F6');
  const [allocatedAmount, setAllocatedAmount] = useState('');

  useEffect(() => {
    if (open) {
      setName(budget?.name ?? '');
      setIcon(budget?.icon ?? '💰');
      setColor(budget?.color ?? '#3B82F6');
      setAllocatedAmount(budget ? String(Number(budget.allocatedAmount)) : '');
    }
  }, [open, budget]);

  const { data: pool } = usePool(open);
  const totalBalance = pool?.balance ?? 0;
  const totalAllocated = (pool?.budgets ?? []).reduce((s, b) => s + Number(b.allocatedAmount), 0);
  const currentAllocation = isEditing ? Number(budget.allocatedAmount) : 0;
  const availableToAllocate = totalBalance - totalAllocated + currentAllocation;

  const enteredAmount = parseFloat(allocatedAmount) || 0;
  const exceedsAvailable = enteredAmount > availableToAllocate && totalBalance > 0;

  const create = usePoolCreateBudget();
  const update = usePoolUpdateBudget();
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

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'แก้ไขงบกลาง' : 'สร้างงบกลางใหม่'} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="ชื่องบ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น ค่าอาหารครอบครัว, ค่าน้ำค่าไฟ"
          required
          autoFocus
        />

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

        <div>
          <label className="label">สี</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                  color === c ? 'border-gray-800 dark:border-white scale-110 shadow-md' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

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
              จำนวนเงินเกินยอดคงเหลือในงบกลาง (สูงสุด {formatCurrency(availableToAllocate)})
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={isLoading}>
            ยกเลิก
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={isLoading}
            disabled={!name.trim() || !allocatedAmount || exceedsAvailable}
          >
            {isEditing ? 'บันทึกการแก้ไข' : 'สร้างงบกลาง'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
