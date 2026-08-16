import { useState, useEffect } from 'react';
import { Budget, RolloverPolicy } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCreateBudget, useUpdateBudget, useBudgets } from '@/hooks/useBudgets';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Account } from '@/types';
import { formatCurrency } from '@/utils/format';
import { calculateAllocationTotals } from '@/utils/allocation';
import { shouldShowMonthlyTargetField, isMonthlyTargetInvalid, resolveMonthlyTarget } from '@/utils/budgetForm';
import { cn } from '@/utils/cn';

const POLICY_OPTIONS: { value: RolloverPolicy; label: string; description: string; disabled?: boolean }[] = [
  {
    value: 'RESET',
    label: 'เริ่มใหม่ตามยอดเป้าหมายทุกเดือน (แนะนำ)',
    description: 'ยอดคงเหลือเดือนนี้เก็บเข้ากองกลางก่อน แล้วเติมให้ถึงเป้าหมายที่ตั้งไว้',
  },
  {
    value: 'SWEEP',
    label: 'คืนเงินเหลือ ต้องจัดสรรใหม่เอง',
    description: 'สิ้นเดือนยอดคงเหลือกลับเข้ากองกลางทั้งหมด เดือนใหม่เริ่มจาก 0',
  },
  {
    value: 'ROLLOVER',
    label: 'ยกยอดคงเหลือไปเดือนหน้า',
    description: 'เร็วๆ นี้',
    disabled: true,
  },
];

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
  const [rolloverPolicy, setRolloverPolicy] = useState<RolloverPolicy>('RESET');
  const [monthlyTarget, setMonthlyTarget] = useState('');

  // Reset form every time the modal opens or budget changes
  useEffect(() => {
    if (open) {
      setName(budget?.name ?? '');
      setIcon(budget?.icon ?? '💰');
      setColor(budget?.color ?? '#3B82F6');
      setAllocatedAmount(budget ? String(Number(budget.allocatedAmount)) : '');
      setRolloverPolicy(budget?.rolloverPolicy ?? 'RESET');
      setMonthlyTarget(budget?.monthlyTarget != null ? String(Number(budget.monthlyTarget)) : '');
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
  // When editing, exclude the current budget's allocation from the "already allocated" sum
  const currentAllocation = isEditing ? Number(budget.allocatedAmount) : 0;
  const { availableToAllocate } = calculateAllocationTotals(budgets, totalBalance, currentAllocation);

  const enteredAmount = parseFloat(allocatedAmount) || 0;
  const exceedsAvailable = enteredAmount > availableToAllocate && totalBalance > 0;

  const monthlyTargetInvalid = isMonthlyTargetInvalid(rolloverPolicy, monthlyTarget);

  const create = useCreateBudget();
  const update = useUpdateBudget();
  const isLoading = create.isPending || update.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(allocatedAmount);
    if (isNaN(amount) || amount < 0) return;
    if (exceedsAvailable) return;
    if (monthlyTargetInvalid) return;

    const data = {
      name: name.trim(),
      icon,
      color,
      allocatedAmount: amount,
      rolloverPolicy,
      monthlyTarget: resolveMonthlyTarget(rolloverPolicy, monthlyTarget),
    };

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

        {/* Rollover policy */}
        <div>
          <label className="label">รูปแบบเมื่อขึ้นเดือนใหม่</label>
          <div className="space-y-2">
            {POLICY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                title={opt.disabled ? 'เร็วๆ นี้' : undefined}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl border-2 transition-all',
                  opt.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                  rolloverPolicy === opt.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                    : 'border-gray-200 dark:border-gray-700',
                )}
              >
                <input
                  type="radio"
                  name="rolloverPolicy"
                  className="mt-1"
                  checked={rolloverPolicy === opt.value}
                  disabled={opt.disabled}
                  onChange={() => setRolloverPolicy(opt.value)}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Monthly target — only meaningful for RESET */}
        {shouldShowMonthlyTargetField(rolloverPolicy) && (
          <div>
            <Input
              label="ยอดเป้าหมายต่อเดือน (ไม่บังคับ)"
              type="number"
              min="0"
              step="0.01"
              value={monthlyTarget}
              onChange={(e) => setMonthlyTarget(e.target.value)}
              placeholder="เว้นว่าง = ใช้ยอดจัดสรรปัจจุบัน"
              error={monthlyTargetInvalid ? 'ยอดเป้าหมายต้องไม่ติดลบ' : undefined}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              เดือนใหม่ระบบจะเติมเงินให้ซองนี้จนถึงยอดนี้ เช่น ตั้ง 6,000 เหลือจากเดือนก่อน 1,000 → เติมอีก 5,000
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ถ้าเงินกองกลางไม่พอ จะเติมให้เท่าที่มี
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ถ้าเหลือมากกว่ายอดเป้าหมาย จะไม่หักออก เงินส่วนเกินอยู่ในซองต่อ
            </p>
          </div>
        )}

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
            disabled={!name.trim() || !allocatedAmount || exceedsAvailable || monthlyTargetInvalid}
          >
            {isEditing ? 'บันทึกการแก้ไข' : 'สร้าง Budget'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
