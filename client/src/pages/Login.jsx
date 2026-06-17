import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Field, Input } from '@/components/ui';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPwd, setShowPwd] = useState(false);
  const from = location.state?.from?.pathname || '/';

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (!loading && isAuthenticated) return <Navigate to={from} replace />;

  const onSubmit = async (values) => {
    const res = await login(values.email, values.password);
    if (res.ok) {
      toast.success(`Welcome back, ${res.user.name.split(' ')[0]}`);
      navigate(from, { replace: true });
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-extrabold">H</div>
          <span className="text-lg font-bold">Hao Stock</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">
            Full control of your wholesale distribution.
          </h1>
          <p className="mt-4 max-w-md text-muted">
            Ledger-based inventory, real-time stock visibility across warehouses and sales reps,
            credit & debt tracking, and intelligent reorder alerts — built for Tanzania.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          {['Every movement audited', 'Stock you can trust', 'Profit at a glance'].map((t) => (
            <div key={t} className="rounded-lg border border-white/10 bg-surface/5 p-3 text-slate-200">{t}</div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center bg-elevated p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-extrabold text-white">H</div>
              <span className="text-lg font-bold text-foreground">Hao Stock</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-foreground">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Access your distribution dashboard.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <Field label="Email" error={errors.email?.message} required>
              <Input type="email" autoComplete="username" placeholder="you@haostock.co.tz" {...register('email')} />
            </Field>
            <Field label="Password" error={errors.password?.message} required>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-border bg-surface p-4 text-xs text-muted">
            <div className="font-semibold text-muted">Demo accounts (from seed)</div>
            <div className="mt-1 space-y-0.5">
              <div>Admin · admin@haostock.co.tz · Admin@12345</div>
              <div>Warehouse · warehouse@haostock.co.tz · Warehouse@123</div>
              <div>Sales rep · juma@haostock.co.tz · SalesRep@123</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
