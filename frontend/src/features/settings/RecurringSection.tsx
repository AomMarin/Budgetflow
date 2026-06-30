import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Calendar, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useBudgets } from '@/hooks/useBudgets';
import { api } from '@/services/api';
import { Account } from '@/types';
import { formatCurrency } from '@/utils/format';
import {
  RecurringTransaction,
  useRecurring,
  useCreateRecurring,
  useUpdateRecurring,
  useDeleteRecurring,
} from '@/hooks/useRecurring';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const DAY_SUFFIX: Record<number, string> = {};
DAYS.forEach((d) => {
  if (d === 1) DAY_SUFFIX[d] = 'ที่ 1 ของเดือน';
  else DAY_SUFFIX[d] = `ที่ ${d} ของเดือน`;
});

interface FormState {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  amount: string;
  dayOfMonth: number;
  accountId: string;
  budgetId: string;
  description: string;
}

const defaultForm = (): FormState => ({
  name: '',
  type: 'EXPENSE',
  amount: '',
  dayOfMonth: 1,
  accountId: '',
  budgetId: '',
  description: '',
});

function fromRecurring(r: RecurringTransaction): FormState {
  return {
    name: r.name,
    type: r.type,
    amount: String(Number(r.amount)),
    dayOfMonth: r.dayOfMonth,
    accountId: r.accountId,
    budgetId: r.budgetId ?? '',
    description: r.description ?? '',
  };
}

/* ─── Form Modal ──────────────────────────────────────────── */

function RecurringFormModal({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: RecurringTransaction | null;
}) {
  const { data: budgets = [] } = useBudgets();
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/accounts')).data.data.accounts,
  });

  const create = useCreateRecurring();
  const update = useUpdateRecurring();
  const [form, setForm] = useState<FormState>(defaultForm);

  useEffect(() => {
    if (open) {
      setForm(editing ? fromRecurring(editing) : defaultForm());
    }
  }, [open, editing]);

  useEffect(() => {
    if (accounts.length > 0 && !form.accountId) {
      const def = accounts.find((a) => a.isDefault) ?? accounts[0];
      setForm((f) => ({ ...f, accountId: def.id }));
    }
  }, [accounts, form.accountId]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isPending = create.isPending || update.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      type: form.type,
      amount: parseFloat(form.amount),
      dayOfMonth: form.dayOfMonth,
      accountId: form.accountId,
      budgetId: form.type === 'EXPENSE' && form.budgetId ? form.budgetId : undefined,
      description: form.description.trim() || undefined,
    };
    if (editing) {
      update.mutate({ id: editing.id, ...payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'แก้ไขรายการอัตโนมัติ' : 'เพิ่มรายการอัตโนมัติ'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type toggle */}
        <div>
          <label className="label">ประเภท</label>
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg gap-1">
            {(['EXPENSE', 'INCOME'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('type', t)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                  form.type === t
                    ? t === 'EXPENSE'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-green-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                {t === 'EXPENSE' ? '− รายจ่าย' : '+ รายรับ'}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="ชื่อรายการ"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="เช่น เงินเดือน, ค่าเช่า, ค่าเนต"
          required
          autoFocus
        />

        <Input
          label="จำนวนเงิน (บาท)"
          type="number"
          min="0.01"
          step="0.01"
          value={form.amount}
          onChange={(e) => set('amount', e.target.value)}
          placeholder="0.00"
          required
        />

        <div>
          <label className="label">วันที่ทำรายการ</label>
          <select
            value={form.dayOfMonth}
            onChange={(e) => set('dayOfMonth', Number(e.target.value))}
            className="input"
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>วัน{DAY_SUFFIX[d]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">บัญชี</label>
          <select
            value={form.accountId}
            onChange={(e) => set('accountId', e.target.value)}
            className="input"
            required
          >
            <option value="">เลือกบัญชี</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {form.type === 'EXPENSE' && (
          <div>
            <label className="label">Budget (ไม่จำเป็น)</label>
            <select
              value={form.budgetId}
              onChange={(e) => set('budgetId', e.target.value)}
              className="input"
            >
              <option value="">ไม่ระบุ Budget</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>{b.icon} {b.name}</option>
              ))}
            </select>
          </div>
        )}

        <Input
          label="หมายเหตุ (ไม่จำเป็น)"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="รายละเอียดเพิ่มเติม"
        />

        {/* Preview */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
          <Calendar className="w-4 h-4 flex-shrink-0 text-primary-500" />
          <span>
            ระบบจะสร้างรายการ
            <span className={`font-semibold mx-1 ${form.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
              {form.type === 'INCOME' ? '+' : '−'}{form.amount ? formatCurrency(parseFloat(form.amount) || 0) : '฿0'}
            </span>
            ทุกวัน{form.dayOfMonth} ของเดือน
          </span>
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={isPending}>
            ยกเลิก
          </Button>
          <Button type="submit" className="flex-1" loading={isPending} disabled={!form.name || !form.amount || !form.accountId}>
            {editing ? 'บันทึก' : 'เพิ่มรายการ'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Main Section ────────────────────────────────────────── */

export function RecurringSection() {
  const { data: items = [], isLoading } = useRecurring();
  const updateRecurring = useUpdateRecurring();
  const deleteRecurring = useDeleteRecurring();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecurringTransaction | null>(null);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item: RecurringTransaction) => { setEditing(item); setModalOpen(true); };

  const toggleActive = (item: RecurringTransaction) => {
    updateRecurring.mutate({ id: item.id, isActive: !item.isActive });
  };

  const income = items.filter((i) => i.type === 'INCOME');
  const expense = items.filter((i) => i.type === 'EXPENSE');

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary-500" />
            รายการอัตโนมัติ
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ระบบจะสร้างรายการให้อัตโนมัติเมื่อถึงวันที่กำหนด
          </p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate} size="sm">
          เพิ่ม
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-400 dark:text-gray-600">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">ยังไม่มีรายการอัตโนมัติ</p>
          <p className="text-xs mt-1">กด "เพิ่ม" เพื่อตั้งค่าเงินเดือน ค่าเช่า หรือรายการประจำ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {income.length > 0 && (
            <div>
              <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide mb-2">
                รายรับ
              </p>
              <div className="space-y-2">
                {income.map((item) => <RecurringRow key={item.id} item={item} onEdit={openEdit} onToggle={toggleActive} onDelete={setConfirmDelete} />)}
              </div>
            </div>
          )}
          {expense.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-500 uppercase tracking-wide mb-2">
                รายจ่าย
              </p>
              <div className="space-y-2">
                {expense.map((item) => <RecurringRow key={item.id} item={item} onEdit={openEdit} onToggle={toggleActive} onDelete={setConfirmDelete} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Form Modal */}
      <RecurringFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
      />

      {/* Delete confirm */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="ลบรายการอัตโนมัติ" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            ต้องการลบ <span className="font-semibold text-gray-900 dark:text-white">"{confirmDelete?.name}"</span> ใช่ไหม?
            รายการที่สร้างไปแล้วจะยังคงอยู่
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={deleteRecurring.isPending}
              onClick={() => {
                if (confirmDelete) {
                  deleteRecurring.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) });
                }
              }}
            >
              ลบ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─── Row ─────────────────────────────────────────────────── */

function RecurringRow({
  item,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: RecurringTransaction;
  onEdit: (i: RecurringTransaction) => void;
  onToggle: (i: RecurringTransaction) => void;
  onDelete: (i: RecurringTransaction) => void;
}) {
  const isIncome = item.type === 'INCOME';

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
      item.isActive
        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
        : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 opacity-60'
    }`}>
      {/* Day badge */}
      <div className="flex-shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center bg-primary-50 dark:bg-primary-900/30">
        <span className="text-[10px] text-primary-400 leading-none">วันที่</span>
        <span className="text-sm font-bold text-primary-600 dark:text-primary-400 leading-tight">
          {item.dayOfMonth}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {item.name}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {item.account.name}{item.budget ? ` · ${item.budget.icon} ${item.budget.name}` : ''}
          {item.lastRunAt && (
            <span className="ml-1 text-gray-400">
              · ล่าสุด {new Date(item.lastRunAt).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </p>
      </div>

      {/* Amount */}
      <span className={`text-sm font-semibold flex-shrink-0 ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
        {isIncome ? '+' : '−'}{formatCurrency(Number(item.amount))}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onToggle(item)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-500 transition-colors"
          title={item.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        >
          {item.isActive
            ? <ToggleRight className="w-5 h-5 text-primary-500" />
            : <ToggleLeft className="w-5 h-5" />
          }
        </button>
        <button
          onClick={() => onEdit(item)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(item)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
