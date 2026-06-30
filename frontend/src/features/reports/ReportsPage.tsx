import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { api } from '@/services/api';
import { formatCurrency, MONTH_NAMES } from '@/utils/format';
import { useAuthStore } from '@/stores/auth.store';
import { CardSkeleton } from '@/components/ui/Skeleton';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const YEARS = Array.from({ length: 3 }, (_, i) => CURRENT_YEAR - i);

export function ReportsPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const { user } = useAuthStore();

  const { data: monthly, isLoading: monthlyLoading } = useQuery({
    queryKey: ['reports', 'monthly', year, month],
    queryFn: async () => {
      const res = await api.get('/reports/monthly', { params: { year, month } });
      return res.data.data;
    },
  });

  const { data: yearly, isLoading: yearlyLoading } = useQuery({
    queryKey: ['reports', 'yearly', year],
    queryFn: async () => {
      const res = await api.get('/reports/yearly', { params: { year } });
      return res.data.data;
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Controls */}
      <div className="flex gap-3">
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value))}
          className="input w-32"
        >
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(parseInt(e.target.value))}
          className="input w-40"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>
      </div>

      {/* Monthly summary stats */}
      {monthlyLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : monthly && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Income', value: monthly.totalIncome, color: 'text-green-600' },
            { label: 'Expenses', value: monthly.totalExpense, color: 'text-red-500' },
            { label: 'Net Savings', value: monthly.netSavings, color: monthly.netSavings >= 0 ? 'text-blue-600' : 'text-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="stat-card">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{formatCurrency(value, user?.currency)}</p>
              <p className="text-xs text-gray-400">{MONTH_NAMES[month - 1]} {year}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget breakdown pie */}
        {monthly && monthly.budgetBreakdown?.length > 0 && (
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              Spending by Budget — {MONTH_NAMES[month - 1]}
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={monthly.budgetBreakdown}
                  dataKey="amount"
                  nameKey="budget.name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={50}
                  paddingAngle={3}
                >
                  {monthly.budgetBreakdown.map((entry: { budget: { color: string } }, i: number) => (
                    <Cell key={i} fill={entry.budget.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v, user?.currency)} />
                <Legend
                  formatter={(value: string) => <span className="text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-2">
              {monthly.budgetBreakdown.map((item: { budget: { icon: string; name: string; color: string }; amount: number; count: number }) => (
                <div key={item.budget.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.budget.color }} />
                    <span>{item.budget.icon} {item.budget.name}</span>
                    <span className="text-xs text-gray-400">({item.count} txns)</span>
                  </div>
                  <span className="font-medium">{formatCurrency(item.amount, user?.currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Daily spending */}
        {monthly && monthly.dailySpending?.length > 0 && (
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Spending</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthly.dailySpending}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v, user?.currency)} />
                <Bar dataKey="total" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Yearly overview */}
      <div className="card p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
          {year} Monthly Overview
        </h3>
        {yearlyLoading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
        ) : yearly && (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={yearly.months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tickFormatter={(m) => MONTH_NAMES[m - 1]?.slice(0, 3)}
                tick={{ fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                labelFormatter={(m) => MONTH_NAMES[Number(m) - 1]}
                formatter={(v: number) => formatCurrency(v, user?.currency)}
              />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} dot={false} name="Income" />
              <Line type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} dot={false} name="Expense" />
              <Line type="monotone" dataKey="savings" stroke="#3B82F6" strokeWidth={2} dot={false} name="Savings" strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
