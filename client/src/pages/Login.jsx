import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Loader2, Eye, EyeOff, ArrowRight, Boxes, Package, Timer, Coins, Target,
  ClipboardList, BarChart3, Rocket,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Field, Input } from '@/components/ui';
import { formatNumber } from '@/lib/format';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.2, 0.7, 0.3, 1] } } };

// Count-up animation (no deps) — easeOutCubic.
function CountUp({ to, duration = 1500, prefix = '', suffix = '' }) {
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

// Honest facts about how the system works (this page is public — no live financials).
const STATS = [
  { icon: Package, to: 8, label: 'Product lines' },
  { icon: Timer, to: 72, suffix: 'h', label: 'Settlement window' },
  { icon: Coins, to: 5000, prefix: 'TSh ', label: 'Commission / box' },
  { icon: Target, to: 100, suffix: '%', label: 'Boxes accounted' },
];

const PERKS = [
  { icon: ClipboardList, title: 'Request stock', desc: 'Order straight from the warehouse and track every box.' },
  { icon: Coins, title: 'Track commission', desc: "See what you've earned and your next payout." },
  { icon: BarChart3, title: 'Monitor performance', desc: 'Settlements and stock movement, live.' },
  { icon: Rocket, title: 'Grow faster', desc: 'Focus on selling — the system does the math.' },
];

const FLOATERS = [
  { left: '7%', top: '16%', size: 30, delay: 0 },
  { left: '84%', top: '60%', size: 34, delay: 1.5 },
  { left: '22%', top: '74%', size: 24, delay: 0.8 },
  { left: '68%', top: '12%', size: 22, delay: 2.4 },
  { left: '46%', top: '84%', size: 28, delay: 1.1 },
];

function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#08090b]" aria-hidden="true">
      {/* logistics grid */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 50%, transparent 100%)',
        }}
      />
      {/* drifting gradient glows */}
      <motion.div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" animate={{ y: [0, 40, 0], x: [0, 20, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute -right-24 top-1/4 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" animate={{ y: [0, -44, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute bottom-[-12%] left-1/3 h-72 w-72 rounded-full bg-lime-500/10 blur-3xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />
      {/* floating boxes */}
      {FLOATERS.map((f, i) => (
        <motion.div key={i} className="absolute text-white/[0.06]" style={{ left: f.left, top: f.top }}
          animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }} transition={{ duration: 9 + f.delay, repeat: Infinity, ease: 'easeInOut', delay: f.delay }}>
          <Package style={{ width: f.size, height: f.size }} />
        </motion.div>
      ))}
    </div>
  );
}

function StatTile({ s }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <s.icon className="mb-2 h-5 w-5 text-brand-500" />
      <div className="text-2xl font-extrabold tracking-tight text-white"><CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} /></div>
      <div className="mt-0.5 text-xs text-white/60">{s.label}</div>
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
      <Background />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-x-14 gap-y-10 px-6 py-12 sm:px-10 lg:grid-cols-2 lg:content-center lg:gap-y-12 lg:px-12"
      >
        {/* Brand hero */}
        <motion.div variants={item} className="text-center lg:text-left">
          <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-slate-950 shadow-xl">
            <Boxes className="h-7 w-7" />
          </div>
          <h1 className="font-black uppercase leading-[0.9] tracking-tight text-6xl sm:text-7xl lg:text-8xl">
            The Lab
          </h1>
          <p className="mx-auto mt-5 max-w-md text-lg text-white/70 lg:mx-0 lg:text-xl">
            Take stock. Make moves. Earn more.
          </p>
          {/* Stats — desktop, beneath the hero */}
          <div className="mt-9 hidden grid-cols-4 gap-3 lg:grid">
            {STATS.map((s) => <StatTile key={s.label} s={s} />)}
          </div>
        </motion.div>

        {/* Login — the call to action */}
        <motion.div variants={item} className="w-full justify-self-center lg:max-w-md lg:justify-self-end">
          <div className="glass rounded-3xl border border-white/10 p-6 shadow-2xl sm:p-8">
            <h2 className="text-xl font-bold">Access your dashboard</h2>
            <p className="mt-1 text-sm text-white/60">Enter your details to start working.</p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <Field label="Email" error={errors.email?.message} required>
                <Input type="email" autoComplete="username" placeholder="you@thelab.co.tz" {...register('email')} />
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
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Access The Lab <ArrowRight className="h-5 w-5" /></>}
              </button>
            </form>
          </div>
        </motion.div>

        {/* Stats — mobile only, after login */}
        <motion.div variants={item} className="grid grid-cols-2 gap-3 lg:hidden">
          {STATS.map((s) => <StatTile key={s.label} s={s} />)}
        </motion.div>

        {/* Perks — full-width strip */}
        <motion.div variants={item} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4">
          {PERKS.map((p) => (
            <motion.div key={p.title} whileHover={{ y: -3 }}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur lg:flex-col">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/25 to-brand-500/5 text-brand-500">
                <p.icon className="h-5 w-5" />
              </span>
              <div>
                <div className="font-semibold text-white">{p.title}</div>
                <div className="mt-0.5 text-sm text-white/60">{p.desc}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Developer credit */}
        <motion.div variants={item} className="text-center text-xs text-white/40 lg:col-span-2">
          © The Lab — Developed by Nino
        </motion.div>
      </motion.div>
    </div>
  );
}
