import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Budget } from '@/types';
import { formatCurrency } from '@/utils/format';
import { cn } from '@/utils/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  primaryBudget: Budget;
  amount: number;
  effectiveRemaining: number;
  budgets: Budget[];
  onConfirm: (borrowFromBudgetId: string) => Promise<void>;
}

export function BorrowBudgetModal({
  open,
  onClose,
  primaryBudget,
  amount,
  effectiveRemaining,
  budgets,
  onConfirm,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fresh pick every time the modal reopens — a stale selection from a
  // previous shortfall amount could point at a budget that no longer covers it.
  useEffect(() => {
    if (open) setSelectedId(null);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const shortfall = Math.max(0, amount - effectiveRemaining);

  const candidates = budgets
    .filter((b) => b.id !== primaryBudget.id && !b.isArchived)
    .map((b) => ({ budget: b, eligible: Number(b.remainingAmount) >= shortfall }))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return Number(b.budget.remainingAmount) - Number(a.budget.remainingAmount);
    });

  const hasEligible = candidates.some((c) => c.eligible);

  const handleConfirm = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await onConfirm(selectedId);
    } catch {
      // Error toast already surfaced by the mutation hook — keep the modal
      // open so the user can pick a different budget (e.g. a race: someone
      // else spent from it first).
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          'relative w-full md:max-w-md bg-white dark:bg-gray-900 shadow-2xl',
          'animate-slide-up border-gray-100 dark:border-gray-800',
          'rounded-t-2xl md:rounded-2xl md:border',
        )}
      >
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            งบ &quot;{primaryBudget.name}&quot; ไม่พอ
          </h2>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 text-sm text-gray-700 dark:text-gray-300 font-mono">
            รายการ {formatCurrency(amount)} − งบเหลือ {formatCurrency(effectiveRemaining)} = ต้องยืม{' '}
            <span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(shortfall)}</span>
          </div>

          <div className="flex gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 p-3">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              ยืมครั้งนี้เท่านั้น — ยอดจัดสรร (allocatedAmount) ของทั้งสองงบจะ<strong>ไม่เปลี่ยน</strong>{' '}
              ต่างจากการ<strong>โยกงบ</strong>ที่หน้า Transfers ซึ่งเปลี่ยนยอดจัดสรรถาวร
            </p>
          </div>

          {candidates.length === 0 || !hasEligible ? (
            <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4 space-y-2">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                ยืมไม่ได้ — ไม่มีงบไหนเหลือพอ
              </p>
              <p className="text-xs text-red-600 dark:text-red-300">
                ลองลดยอดรายการเหลือไม่เกิน {formatCurrency(effectiveRemaining)} หรือ
              </p>
              <Link
                to="/budgets"
                onClick={onClose}
                className="inline-block text-xs font-medium text-red-700 dark:text-red-300 underline underline-offset-2 hover:text-red-900 dark:hover:text-red-100"
              >
                ไปจัดสรรเงินเพิ่มที่หน้า Budgets →
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="label">ยืมจากงบไหน</p>
              {candidates.map(({ budget, eligible }) => (
                <button
                  key={budget.id}
                  type="button"
                  disabled={!eligible}
                  onClick={() => setSelectedId(budget.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors',
                    !eligible && 'opacity-50 cursor-not-allowed border-gray-100 dark:border-gray-800',
                    eligible && selectedId === budget.id && 'border-primary-500 bg-primary-50 dark:bg-primary-900/20',
                    eligible && selectedId !== budget.id &&
                      'border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700',
                  )}
                >
                  <span className="text-lg shrink-0">{budget.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {budget.name}
                    </span>
                    <span className="block text-xs text-gray-400">
                      {eligible
                        ? `เหลือ ${formatCurrency(Number(budget.remainingAmount))}`
                        : `เหลือไม่พอ (เหลือ ${formatCurrency(Number(budget.remainingAmount))})`}
                    </span>
                  </span>
                  {eligible && selectedId === budget.id && <ArrowDownRight className="w-4 h-4 text-primary-600 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          {hasEligible && (
            <Button
              type="button"
              className="flex-1"
              disabled={!selectedId}
              loading={submitting}
              onClick={handleConfirm}
            >
              ยืนยันยืมจากงบนี้
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
