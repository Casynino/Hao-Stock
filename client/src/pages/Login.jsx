import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Loader2, Eye, EyeOff, ArrowRight, Package, Timer, Coins, Target,
  ClipboardList, BarChart3, Rocket,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Field, Input } from '@/components/ui';
import { formatNumber } from '@/lib/format';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

const container = { hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.7, 0.3, 1] } } };

// Count-up animation (no extra deps) — easeOutCubic over ~1.4s.
function CountUp({ to, duration = 1400, prefix = '', suffix = '' }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{prefix}{formatNumber(Math.round(val))}{suffix}</>;
}

// Honest, motivating facts about the system (not live financials — this page is public).
const STATS = [
  { icon: Package, to: 8, label: 'Product lines' },
  { icon: Timer, to: 72, suffix: 'h', label: 'Settlement window' },
  { icon: Coins, to: 5000, prefix: 'TSh ', label: 'Commission / box' },
  { icon: Target, to: 100, suffix: '%', label: 'Boxes accounted' },
];

const PERKS = [
  { icon: ClipboardList, title: 'Request stock easily', desc: 'Order straight from the warehouse and track every box.' },
  { icon: Coins, title: 'Track your commission', desc: "See what you've earned and how close your next payout is." },
  { icon: BarChart3, title: 'Monitor performance', desc: 'Settlements and stock movement — live, in real time.' },
  { icon: Rocket, title: 'Grow faster', desc: 'Focus on selling. The system handles the math.' },
];

function FloatingShapes() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <motion.div className="absolute -left-20 top-8 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl"
        animate={{ y: [0, 30, 0], x: [0, 18, 0] }} transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl"
        animate={{ y: [0, -36, 0] }} transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute bottom-0 left-1/4 h-56 w-56 rounded-full bg-lime-500/10 blur-3xl"
        animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  );
}

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
    <div className="relative min-h-screen text-white">
      <FloatingShapes />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-5 py-12"
      >
        {/* Hero */}
        <div className="text-center">
          <motion.div variants={item} className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-brand-400 to-brand-600 text-[11px] font-extrabold text-slate-950">H</span>
            Hao Stock · Distribution ERP
          </motion.div>
          <motion.h1 variants={item} className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Stock. Sales.<br /><span className="text-brand-500">Commission.</span> Growth.
          </motion.h1>
          <motion.p variants={item} className="mx-auto mt-4 max-w-xs text-base text-white/70">
            Track your stock. Build your sales. Grow your commission. Every box counts.
          </motion.p>
        </div>

        {/* Login — the primary call to action */}
        <motion.div variants={item} className="glass rounded-2xl border border-white/10 p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-white">Access your dashboard</h2>
          <p className="mt-0.5 text-sm text-white/60">Sign in to start working.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
            <Field label="Email" error={errors.email?.message} required>
              <Input type="email" autoComplete="username" placeholder="you@haostock.co.tz" {...register('email')} />
            </Field>
            <Field label="Password" error={errors.password?.message} required>
              <div className="relative">
                <Input type={showPwd ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" {...register('password')} />
                <button type="button" onClick={() => setShowPwd((v) => !v)} aria-label={showPwd ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted">
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3 text-base">
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue to your account <ArrowRight className="h-5 w-5" /></>}
            </button>
          </form>
        </motion.div>

        {/* Animated stats — real facts about how the system works */}
        <motion.div variants={item} className="grid grid-cols-2 gap-3">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <s.icon className="mb-2 h-5 w-5 text-brand-500" />
              <div className="text-2xl font-extrabold tracking-tight text-white">
                <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} />
              </div>
              <div className="mt-0.5 text-xs text-white/60">{s.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Why it pays to log in */}
        <div>
          <motion.h3 variants={item} className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-white/50">
            Built for reps on the move
          </motion.h3>
          <div className="space-y-3">
            {PERKS.map((p) => (
              <motion.div
                key={p.title}
                variants={item}
                whileHover={{ y: -3 }}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/25 to-brand-500/5 text-brand-500">
                  <p.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-semibold text-white">{p.title}</div>
                  <div className="mt-0.5 text-sm text-white/60">{p.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div variants={item} className="text-center text-xs text-white/40">
          Hao Stock · v1.0 · Built for Tanzania 🇹🇿
        </motion.div>
      </motion.div>
    </div>
  );
}
