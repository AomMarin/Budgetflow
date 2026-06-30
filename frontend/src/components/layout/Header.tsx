import { Sun, Moon, Monitor, Bell, TrendingUp } from 'lucide-react';
import { useThemeStore, applyTheme } from '@/stores/theme.store';
import { useDashboard } from '@/hooks/useDashboard';
import { cn } from '@/utils/cn';

export function Header({ title }: { title: string }) {
  const { theme, setTheme } = useThemeStore();
  const { data } = useDashboard();
  const alertCount = data?.alerts?.length ?? 0;

  const themeOptions = [
    { value: 'light' as const, icon: Sun },
    { value: 'dark' as const, icon: Moon },
    { value: 'system' as const, icon: Monitor },
  ];

  return (
    <header className="flex items-center justify-between px-4 md:px-8 py-3 md:py-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
      {/* Mobile: brand logo; Desktop: page title */}
      <div className="flex items-center gap-2.5">
        <div className="md:hidden w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center shadow-sm">
          <TrendingUp className="w-4 h-4 text-white" />
        </div>
        <h1 className="md:hidden text-base font-bold text-gray-900 dark:text-white">BudgetFlow</h1>
        <h1 className="hidden md:block text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Alert indicator */}
        {alertCount > 0 && (
          <button className="relative p-2 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {alertCount}
            </span>
          </button>
        )}

        {/* Theme switcher */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
          {themeOptions.map(({ value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => { setTheme(value); applyTheme(value); }}
              className={cn(
                'p-1.5 rounded-md transition-all',
                theme === value
                  ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
