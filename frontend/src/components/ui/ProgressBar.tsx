import { cn } from '@/utils/cn';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function ProgressBar({ value, max = 100, color, size = 'md', showLabel }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  const autoColor =
    percent >= 100 ? '#EF4444' :
    percent >= 90 ? '#F97316' :
    percent >= 80 ? '#F59E0B' :
    '#10B981';

  return (
    <div className="w-full">
      <div
        className={cn(
          'w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%`, backgroundColor: color ?? autoColor }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>{Math.round(percent)}%</span>
        </div>
      )}
    </div>
  );
}
