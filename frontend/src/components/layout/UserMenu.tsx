import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, Upload, Users, ShieldCheck, LogOut } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/stores/auth.store';
import { useLogout } from '@/hooks/useAuth';

// Pages that BottomNav has no room for (only 5 slots, reserved for the
// core flow) — surfaced here instead so mobile can still reach them.
const overflowNavItems = [
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/import', icon: Upload, label: 'Import' },
  { to: '/household', icon: Users, label: 'Family Budget' },
];

// Sidebar (desktop) already shows the user card + logout button, but
// Sidebar is `hidden md:flex` — mobile had no way to log out at all.
export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const logout = useLogout();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const navItems = user?.role === 'ADMIN'
    ? [...overflowNavItems, { to: '/admin', icon: ShieldCheck, label: 'Admin' }]
    : overflowNavItems;

  return (
    <div className="relative md:hidden" ref={ref}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0"
      >
        <span className="text-sm font-semibold text-primary-700 dark:text-primary-400">
          {user?.name?.charAt(0).toUpperCase()}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg z-50 overflow-hidden">
          <nav className="py-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors',
                    isActive
                      ? 'text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                  )
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-gray-100 dark:border-gray-800">
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => { setIsOpen(false); logout.mutate(); }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
