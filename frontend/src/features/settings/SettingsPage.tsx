import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeStore, applyTheme } from '@/stores/theme.store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/utils/cn';
import { RecurringSection } from './RecurringSection';
import { InitialSetupSection } from './InitialSetupSection';

export function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const qc = useQueryClient();

  const [name, setName] = useState(user?.name ?? '');
  const [currency, setCurrency] = useState(user?.currency ?? 'THB');
  const [alertAt80, setAlertAt80] = useState(user?.alertAt80 ?? true);
  const [alertAt90, setAlertAt90] = useState(user?.alertAt90 ?? true);
  const [alertAt100, setAlertAt100] = useState(user?.alertAt100 ?? true);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');

  const updateProfile = useMutation({
    mutationFn: (data: object) => api.patch('/auth/me', data),
    onSuccess: (res) => {
      const updatedUser = res.data.data.user;
      updateUser(updatedUser);
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Profile saved');
    },
    onError: () => toast.error('Failed to save profile'),
  });

  const changePw = useMutation({
    mutationFn: (data: object) => api.post('/auth/change-password', data),
    onSuccess: () => {
      toast.success('Password changed');
      setCurrentPw('');
      setNewPw('');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Failed to change password');
    },
  });

  const themeOptions = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'System' },
  ];

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <InitialSetupSection />
      <RecurringSection />
      {/* Profile */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">Profile</h2>
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div>
          <label className="label">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">
            <option value="THB">THB — Thai Baht</option>
            <option value="USD">USD — US Dollar</option>
            <option value="EUR">EUR — Euro</option>
            <option value="GBP">GBP — British Pound</option>
            <option value="SGD">SGD — Singapore Dollar</option>
            <option value="JPY">JPY — Japanese Yen</option>
          </select>
        </div>
        <Button
          onClick={() => updateProfile.mutate({ name, currency, alertAt80, alertAt90, alertAt100 })}
          loading={updateProfile.isPending}
        >
          Save Profile
        </Button>
      </div>

      {/* Appearance */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">Appearance</h2>
        <div>
          <label className="label">Theme</label>
          <div className="flex gap-3">
            {themeOptions.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => { setTheme(value); applyTheme(value); }}
                className={cn(
                  'flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-medium',
                  theme === value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300',
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Budget Alerts */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">Budget Alerts</h2>
        <p className="text-sm text-gray-500">Get notified when a budget reaches these thresholds.</p>
        {[
          { label: 'Alert at 80% usage', value: alertAt80, onChange: setAlertAt80 },
          { label: 'Alert at 90% usage', value: alertAt90, onChange: setAlertAt90 },
          { label: 'Alert when budget exceeded (100%)', value: alertAt100, onChange: setAlertAt100 },
        ].map(({ label, value, onChange }) => (
          <label key={label} className="flex items-center justify-between py-2 cursor-pointer">
            <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
            <div
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors duration-200',
                value ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700',
              )}
              onClick={() => onChange(!value)}
            >
              <div
                className={cn(
                  'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                  value ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </div>
          </label>
        ))}
        <Button
          onClick={() => updateProfile.mutate({ name, currency, alertAt80, alertAt90, alertAt100 })}
          loading={updateProfile.isPending}
        >
          Save Alert Settings
        </Button>
      </div>

      {/* Change Password */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">Change Password</h2>
        <Input
          label="Current password"
          type="password"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
          autoComplete="current-password"
        />
        <Input
          label="New password"
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          autoComplete="new-password"
          hint="Min. 8 characters, must include uppercase and number"
        />
        <Button
          onClick={() => changePw.mutate({ currentPassword: currentPw, newPassword: newPw })}
          loading={changePw.isPending}
          disabled={!currentPw || !newPw}
          variant="secondary"
        >
          Change Password
        </Button>
      </div>
    </div>
  );
}
