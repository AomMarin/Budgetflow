import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Wallet, Receipt, ArrowLeftRight, Settings } from 'lucide-react';
import { cn } from '@/utils/cn';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'หน้าหลัก' },
  { to: '/budgets', icon: Wallet, label: 'งบ' },
  { to: '/transactions', icon: Receipt, label: 'รายการ' },
  { to: '/transfers', icon: ArrowLeftRight, label: 'โยกงบ' },
  { to: '/settings', icon: Settings, label: 'ตั้งค่า' },
];

export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40
                    bg-white dark:bg-gray-900
                    border-t border-gray-100 dark:border-gray-800
                    flex items-stretch safe-b">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
              isActive
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-400 dark:text-gray-500',
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                'p-1.5 rounded-xl transition-colors',
                isActive ? 'bg-primary-50 dark:bg-primary-900/30' : '',
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
