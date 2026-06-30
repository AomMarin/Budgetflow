import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Wallet, DollarSign,
  AlertTriangle, Plus, ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useDashboard } from '@/hooks/useDashboard';
import { useAuthStore } from '@/stores/auth.store';
import { formatCurrency, formatDate } from '@/utils/format';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { AllocateIncomeModal } from '../budgets/AllocateIncomeModal';
import { useProcessRecurring } from '@/hooks/useRecurring';

export function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const { user } = useAuthStore();
  const [showAllocate, setShowAllocate] = useState(false);
  const processRecurring = useProcessRecurring();

  // Auto-process recurring transactions on dashboard load
  useEffect(() => {
    processRecurring.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const pieData = data.budgets
    .filter((b) => Number(b.spentAmount) > 0)
    .map((b) => ({ name: b.name, value: Number(b.spentAmount), fill: b.color }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            Hello, {user?.name?.split(' ')[0]} 👋
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Here's your financial overview</p>
        </div>
        <Button onClick={() => setShowAllocate(true)} icon={<Plus className="w-4 h-4" />} className="shrink-0">
          <span className="hidden sm:inline">Allocate Income</span>
          <span className="sm:hidden">รับเงิน</span>
        </Button>
      </div>

      {/* Budget Alerts */}
      {data.alerts.length > 0 && (
        <div className="card p-4 border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">Budget Alerts</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {data.alerts.map((alert) => (
                  <span key={alert.id} className="text-xs text-amber-700 dark:text-amber-400">
                    {alert.icon} {alert.name} — {alert.usagePercent}% used
                    {alert.usagePercent >= 100 && ' 🚨 EXCEEDED'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Balance"
          value={formatCurrency(data.totalBalance, user?.currency)}
          icon={<DollarSign className="w-5 h-5" />}
          color="blue"
          trend="neutral"
        />
        <StatCard
          label="Monthly Income"
          value={formatCurrency(data.monthlyIncome, user?.currency)}
          icon={<TrendingUp className="w-5 h-5" />}
          color="green"
          trend="up"
        />
        <StatCard
          label="Monthly Expenses"
          value={formatCurrency(data.monthlyExpense, user?.currency)}
          icon={<TrendingDown className="w-5 h-5" />}
          color="red"
          trend="down"
        />
        <StatCard
          label="Remaining Budget"
          value={formatCurrency(data.totalRemaining, user?.currency)}
          icon={<Wallet className="w-5 h-5" />}
          color="purple"
          trend="neutral"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Budget Buckets */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Budget Buckets</h3>
            <Link to="/budgets" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {data.budgets.slice(0, 6).map((budget) => (
              <div key={budget.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span>{budget.icon}</span>{budget.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {formatCurrency(Number(budget.spentAmount))} / {formatCurrency(Number(budget.allocatedAmount))}
                    </span>
                    {budget.alertLevel && (
                      <Badge variant={budget.alertLevel === '100' ? 'danger' : 'warning'}>
                        {budget.alertLevel}%
                      </Badge>
                    )}
                  </div>
                </div>
                <ProgressBar value={budget.usagePercent} color={budget.color} size="sm" />
              </div>
            ))}
          </div>
        </div>

        {/* Spending Pie */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Spending by Bucket</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {pieData.slice(0, 5).map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                    </div>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No spending data yet
            </div>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
          <Link to="/transactions" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {data.recentTransactions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No transactions yet</p>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {data.recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: tx.budget?.color ? `${tx.budget.color}20` : '#F3F4F6' }}
                  >
                    {tx.budget?.icon ?? '💳'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{tx.description}</p>
                    <p className="text-xs text-gray-400">{formatDate(tx.date)}</p>
                  </div>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    tx.type === 'INCOME' ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(Number(tx.amount), user?.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AllocateIncomeModal open={showAllocate} onClose={() => setShowAllocate(false)} />
    </div>
  );
}

function StatCard({
  label, value, icon, color, trend,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  trend: 'up' | 'down' | 'neutral';
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  };

  return (
    <div className="stat-card">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
