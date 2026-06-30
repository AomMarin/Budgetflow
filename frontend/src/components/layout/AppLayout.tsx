import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/budgets': 'Budget Buckets',
  '/transactions': 'Transactions',
  '/transfers': 'Transfer Budget',
  '/reports': 'Reports',
  '/import': 'Import Statement',
  '/settings': 'Settings',
};

export function AppLayout() {
  const { pathname } = useLocation();
  const title = pageTitles[pathname] ?? 'BudgetFlow';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
