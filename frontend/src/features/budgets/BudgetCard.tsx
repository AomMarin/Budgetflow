import { useState, useEffect, useRef } from 'react';
import { Pencil, Trash2, MoreVertical } from 'lucide-react';
import { Budget } from '@/types';
import { formatCurrency, formatPercent } from '@/utils/format';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';

const POLICY_BADGE: Record<Budget['rolloverPolicy'], string> = {
  RESET: '🔄 รีเซ็ตรายเดือน',
  SWEEP: '🧹 คืนกองกลาง',
  ROLLOVER: '⏭️ ยกยอด',
};

export function BudgetCard({
  budget,
  onEdit,
  onDelete,
}: {
  budget: Budget;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const remaining = Number(budget.allocatedAmount) - Number(budget.spentAmount);
  const alertVariant =
    budget.alertLevel === '100' ? 'danger' :
    budget.alertLevel ? 'warning' : 'success';

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="card p-5 hover:shadow-md transition-all duration-200 group">

      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm"
            style={{ backgroundColor: `${budget.color}20` }}
          >
            {budget.icon}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white leading-tight">
              {budget.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge variant={alertVariant}>
                {formatPercent(budget.usagePercent)} ใช้แล้ว
              </Badge>
              <Badge variant="default">{POLICY_BADGE[budget.rolloverPolicy]}</Badge>
            </div>
          </div>
        </div>

        {/* Menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600
                       hover:text-gray-600 dark:hover:text-gray-300
                       hover:bg-gray-100 dark:hover:bg-gray-800
                       opacity-0 group-hover:opacity-100 transition-all"
            aria-label="เมนู"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-40
                            bg-white dark:bg-gray-800
                            border border-gray-100 dark:border-gray-700
                            rounded-xl shadow-xl overflow-hidden
                            animate-fade-in">
              <button
                onClick={() => { setMenuOpen(false); onEdit(); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm
                           text-gray-700 dark:text-gray-300
                           hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-gray-400" />
                แก้ไข
              </button>
              <div className="h-px bg-gray-100 dark:bg-gray-700 mx-2" />
              <button
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm
                           text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ลบ
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      <ProgressBar value={budget.usagePercent} color={budget.color} />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div className="p-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">จัดสรร</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 leading-tight">
            {formatCurrency(Number(budget.allocatedAmount))}
          </p>
        </div>
        <div className="p-2 bg-red-50 dark:bg-red-900/10 rounded-xl">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">ใช้แล้ว</p>
          <p className="text-sm font-semibold text-red-500 leading-tight">
            {formatCurrency(Number(budget.spentAmount))}
          </p>
        </div>
        <div className={`p-2 rounded-xl ${
          remaining < 0
            ? 'bg-red-50 dark:bg-red-900/10'
            : 'bg-green-50 dark:bg-green-900/10'
        }`}>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">คงเหลือ</p>
          <p className={`text-sm font-semibold leading-tight ${
            remaining < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'
          }`}>
            {formatCurrency(remaining)}
          </p>
        </div>
      </div>

      {/* Edit / Delete quick-action bar (visible on hover) */}
      <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium
                     text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400
                     hover:bg-primary-50 dark:hover:bg-primary-900/20
                     rounded-lg border border-gray-200 dark:border-gray-700
                     transition-colors"
        >
          <Pencil className="w-3 h-3" /> แก้ไข
        </button>
        <button
          onClick={onDelete}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium
                     text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400
                     hover:bg-red-50 dark:hover:bg-red-900/20
                     rounded-lg border border-gray-200 dark:border-gray-700
                     transition-colors"
        >
          <Trash2 className="w-3 h-3" /> ลบ
        </button>
      </div>
    </div>
  );
}
