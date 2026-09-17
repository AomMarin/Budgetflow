import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_NAMES } from '@/utils/format';

interface MonthSwitcherProps {
  year: number;
  month: number; // 1-12
  hasPrevious: boolean;
  hasNext: boolean;
  onChange: (year: number, month: number) => void;
}

// hasPrevious/hasNext are always driven by the server's `period` field
// (BudgetSession-backed), never computed from the client clock — sidesteps
// the Bangkok-vs-browser-timezone edge case entirely. Both default to false
// (via the caller) while the underlying query is loading, so nothing is
// navigable until the server confirms the bound.
export function MonthSwitcher({ year, month, hasPrevious, hasNext, onChange }: MonthSwitcherProps) {
  const goPrevious = () => {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  };
  const goNext = () => {
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={goPrevious}
        disabled={!hasPrevious}
        aria-label="เดือนก่อนหน้า"
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400
                   hover:bg-gray-100 dark:hover:bg-gray-800
                   disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent
                   transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[9rem] text-center">
        {MONTH_NAMES[month - 1]} {year}
      </span>
      <button
        onClick={goNext}
        disabled={!hasNext}
        aria-label="เดือนถัดไป"
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400
                   hover:bg-gray-100 dark:hover:bg-gray-800
                   disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent
                   transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
