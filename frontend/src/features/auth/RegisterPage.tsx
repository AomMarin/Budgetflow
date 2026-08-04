import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Eye, EyeOff, Mail, Lock, User } from 'lucide-react';
import { useRegister } from '@/hooks/useAuth';
import { useWakeServerNotice } from '@/hooks/useWakeServerNotice';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const register = useRegister();
  useWakeServerNotice(register.isPending);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register.mutate({ name, email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <TrendingUp className="w-7 h-7 text-primary-600" />
          <span className="font-bold text-xl text-gray-900 dark:text-white">BudgetFlow</span>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create your account</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Start allocating your money with purpose</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <Input
            label="Full name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            required
            autoComplete="name"
            leftIcon={<User className="w-4 h-4" />}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            leftIcon={<Mail className="w-4 h-4" />}
          />
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 chars, 1 uppercase, 1 number"
            required
            minLength={8}
            autoComplete="new-password"
            leftIcon={<Lock className="w-4 h-4" />}
            rightIcon={
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="cursor-pointer">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />

          <Button type="submit" loading={register.isPending} className="w-full" size="lg">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
