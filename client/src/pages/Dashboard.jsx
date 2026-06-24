import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, TrendingUp, HandCoins, Boxes, Warehouse, Truck, AlertTriangle,
  PackageSearch, Repeat, ArrowRight, Timer, Coins, CheckCircle2,
} from 'lucide-react';
import { motion } from 'motion/react';
import clsx from 'clsx';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatNumber, fromNow } from '@/lib/format';
import { tzGreeting, tzDateLabel } from '@/lib/tz';
import { MOVEMENT_META } from '@/lib/constants';
import {
  PageHeader, StatCard, Card, CardHeader, CardBody, PageSpinner, EmptyState, Badge,
  Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';
import { BarChartCard } from '@/components/charts';

// Per-brand summary card (OHIS / CIVILLY). Accent keyed by brand name so the
// two are visually distinct and never confused.
const BRAND_TONE = {
  OHIS: { ring: 'border-emerald-500/30', bg: 'bg-emerald-500/5', badge: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' },
  CIVLILY: { ring: 'border-violet-500/30', bg: 'bg-violet-500/5', badge: 'bg-violet-500/15 text-violet-400', dot: 'bg-violet-400' },
};
function BrandCard({ b, onClick }) {
  const t = BRAND_TONE[b.name?.toUpperCase()] || { ring: 'border-border', bg: 'bg-surface', badge: 'bg-elevated text-muted', dot: 'bg-border' };
  const Money = ({ label, value, sub }) => (
    <div className="rounded-xl bg-black/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 text-base font-bold tabular-nums text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  );
  return (
    <button onClick={onClick} className={`w-full rounded-2xl border ${t.ring} ${t.bg} p-4 text-left transition hover:bg-elevated`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${t.badge}`}>{b.name}</span>
        <span className="ml-auto text-[11px] text-faint">this month</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Money label="Stock value" value={formatCurrency(b.stockValue)} sub={`${formatNumber(b.stockUnits)} boxes`} />
        <Money label="Sales (month)" value={formatCurrency(b.salesMonth)} sub={`${formatNumber(b.unitsSoldMonth)} boxes sold`} />
        <Money label="Profit (month)" value={formatCurrency(b.profitMonth)} sub={`${b.marginMonth}% margin`} />
        <Money label="In The Lab" value={`${formatNumber(b.warehouseUnits)}`} sub="boxes in warehouse" />
      </div>
    </button>
  );
}

// Neon-glow tones — full class strings so Tailwind JIT keeps the arbitrary shadows.
const ALERT_TONES = {
  amber: {
    border: 'border-amber-500/40',
    glow: 'shadow-[0_0_22px_-8px_rgba(245,158,11,0.6)] hover:shadow-[0_0_38px_-6px_rgba(245,158,11,0.9)]',
    num: 'text-amber-300 [text-shadow:0_0_18px_rgba(245,158,11,0.65)]',
    icon: 'text-amber-300 border-amber-400/50 bg-amber-500/10 shadow-[0_0_18px_-5px_rgba(245,158,11,0.8)]',
    blob: 'bg-amber-500',
  },
  rose: {
    border: 'border-rose-500/40',
    glow: 'shadow-[0_0_22px_-8px_rgba(244,63,94,0.6)] hover:shadow-[0_0_38px_-6px_rgba(244,63,94,0.95)]',
    num: 'text-rose-300 [text-shadow:0_0_18px_rgba(244,63,94,0.65)]',
    icon: 'text-rose-300 border-rose-400/50 bg-rose-500/10 shadow-[0_0_18px_-5px_rgba(244,63,94,0.8)]',
    blob: 'bg-rose-500',
  },
  sky: {
    border: 'border-sky-500/40',
    glow: 'shadow-[0_0_22px_-8px_rgba(14,165,233,0.6)] hover:shadow-[0_0_38px_-6px_rgba(14,165,233,0.95)]',
    num: 'text-sky-300 [text-shadow:0_0_18px_rgba(14,165,233,0.65)]',
    icon: 'text-sky-300 border-sky-400/50 bg-sky-500/10 shadow-[0_0_18px_-5px_rgba(14,165,233,0.8)]',
    blob: 'bg-sky-500',
  },
  violet: {
    border: 'border-violet-500/40',
    glow: 'shadow-[0_0_22px_-8px_rgba(139,92,246,0.6)] hover:shadow-[0_0_38px_-6px_rgba(139,92,246,0.95)]',
    num: 'text-violet-300 [text-shadow:0_0_18px_rgba(139,92,246,0.65)]',
    icon: 'text-violet-300 border-violet-400/50 bg-violet-500/10 shadow-[0_0_18px_-5px_rgba(139,92,246,0.8)]',
    blob: 'bg-violet-500',
  },
};

function AlertCard({ title, count, tone, icon: Icon, items = [], render, onClick }) {
  const t = ALERT_TONES[tone] || ALERT_TONES.sky;
  const active = count > 0;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      className={clsx(
        'group relative w-full overflow-hidden rounded-2xl border bg-[#0a0d12] text-left transition-all duration-300',
        active ? t.border : 'border-white/10',
        active && t.glow,
        onClick && 'cursor-pointer hover:-translate-y-1',
      )}
    >
      {/* ambient neon haze inside the card */}
      {active && <div className={clsx('pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full opacity-25 blur-3xl transition-opacity duration-300 group-hover:opacity-40', t.blob)} />}

      {/* header: neon-outlined icon + sliding arrow */}
      <div className="relative flex items-start justify-between px-5 pt-5">
        <span className={clsx('flex h-12 w-12 items-center justify-center rounded-xl border', active ? t.icon : 'border-white/10 bg-white/5 text-foreground/40')}>
          <Icon className="h-6 w-6" strokeWidth={2.2} />
        </span>
        {onClick && <ArrowRight className="mt-1 h-4 w-4 text-faint transition-all duration-200 group-hover:translate-x-1 group-hover:text-foreground" />}
      </div>

      {/* hero count */}
      <div className="relative mt-3 px-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{title}</div>
        <div className={clsx('mt-1 text-5xl font-black leading-none tabular-nums', active ? t.num : 'text-white/15')}>{count}</div>
      </div>

      {/* items */}
      {items.length > 0 ? (
        <div className="relative mt-4 px-2 pb-3">
          {items.slice(0, 4).map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/[0.04]">{render(it)}</div>
          ))}
        </div>
      ) : (
        <div className="relative mt-4 flex items-center gap-1.5 px-5 pb-5 text-xs font-semibold text-emerald-400 [text-shadow:0_0_12px_rgba(52,211,153,0.6)]">
          <CheckCircle2 className="h-3.5 w-3.5" /> All clear
        </div>
      )}
    </motion.button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: async () => unwrap(await api.get('/dashboard')).data,
  });
  const { data: commission } = useQuery({
    queryKey: ['commissions', 'summary'],
    queryFn: async () => unwrap(await api.get('/commissions/summary')).data,
  });
  const { data: brandData } = useQuery({
    queryKey: ['dashboard', 'brands'],
    queryFn: async () => unwrap(await api.get('/dashboard/brands')).data,
  });

  if (isLoading) return <PageSpinner label="Building your dashboard…" />;
  if (isError || !data) return <EmptyState title="Couldn't load the dashboard" message="Please try again shortly." icon={AlertTriangle} />;

  const { inventory, sales, profit, debt, paymentsCollected, regional, topSelling, alerts, recentActivity, counts } = data;

  const greeting = tzGreeting();
  const firstName = user?.name?.split(' ')[0] || 'there';

  const topSellingData = topSelling.map((p) => ({ name: p.name.replace(/civlily|ohis/i, '').trim().slice(0, 22), value: p.revenue }));
  const regionalData = regional.map((r) => ({ name: r.region, value: r.revenue }));

  return (
    <div>
      {/* Gradient hero banner */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
        className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0e120c] via-[#0b0c0a] to-[#16210a] p-6 text-white shadow-xl sm:p-8"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-500/25 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-white/50">
              {tzDateLabel({ weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              {greeting}, {firstName}.
            </h1>
            <p className="mt-1.5 text-sm text-white/70 sm:text-base">Here's what's happening in The Lab today.</p>
          </div>
          <div className="flex gap-8">
            <div>
              <div className="text-xs text-white/50">Sales today</div>
              <div className="text-2xl font-bold tabular-nums">{formatCurrency(sales.daily.revenue)}</div>
            </div>
            <div>
              <div className="text-xs text-white/50">This month</div>
              <div className="text-2xl font-bold tabular-nums">{formatCurrency(sales.monthly.revenue)}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* The five questions, answered. */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">The five answers</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="1 · Stock I have" value={formatCurrency(inventory.totalValue)} icon={Boxes} tone="brand"
          hint={`${formatNumber(inventory.totalBaseUnits)} units`} onClick={() => navigate('/inventory')} />
        <StatCard label="2 · With my reps" value={formatCurrency(inventory.repValue)} icon={Truck} tone="violet"
          hint={`${alerts.outstandingRepStock.count} rep(s) holding`} onClick={() => navigate('/reps')} />
        <StatCard label="3 · Owed to me" value={formatCurrency(debt.totalOutstanding)} icon={HandCoins} tone="rose"
          hint={`${debt.overdueAccounts} overdue`} onClick={() => navigate('/debts')} />
        <StatCard label="4 · Best seller" value={topSelling[0] ? topSelling[0].name.replace(/civlily|ohis/i, '').trim().slice(0, 16) : '—'}
          icon={TrendingUp} tone="emerald" hint={topSelling[0] ? formatCurrency(topSelling[0].revenue) : 'no sales yet'} onClick={() => navigate('/reports')} />
        <StatCard label="5 · Commission owed" value={formatCurrency(commission?.totals?.pending || 0)} icon={Coins} tone="amber"
          hint="pending payout" onClick={() => navigate('/commissions')} />
      </div>

      {/* Financial snapshot */}
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Sales today" value={formatCurrency(sales.daily.revenue)} icon={TrendingUp} tone="emerald" hint={`${sales.daily.orders} orders`} />
        <StatCard label="Sales this month" value={formatCurrency(sales.monthly.revenue)} icon={TrendingUp} tone="emerald" hint={`${sales.monthly.orders} orders`} onClick={() => navigate('/reports')} />
        <StatCard label="Gross profit (month)" value={formatCurrency(profit.grossProfit)} icon={Wallet} tone="violet" hint={`Margin ${profit.grossMargin}% · view profit`} onClick={() => navigate('/profit')} />
        <StatCard label="Collected (month)" value={formatCurrency(paymentsCollected.total)} icon={Wallet} tone="slate" />
      </div>

      {/* By brand — OHIS and CIVILLY tracked separately */}
      {brandData?.brands?.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">By brand</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {brandData.brands.map((b) => <BrandCard key={b.brandId} b={b} onClick={() => navigate('/inventory')} />)}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top selling products" subtitle="By revenue, this month" />
          <CardBody>
            {topSellingData.length ? <BarChartCard data={topSellingData} color="#a3e635" /> : <EmptyState title="No sales yet this month" />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Regional performance" subtitle="Revenue by region, this month" />
          <CardBody>
            {regionalData.length ? <BarChartCard data={regionalData} color="#84cc16" /> : <EmptyState title="No regional sales yet" />}
          </CardBody>
        </Card>
      </div>

      {/* Alerts */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted">Alerts &amp; recommendations</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AlertCard title="Reorder soon" count={alerts.reorder.count} tone="amber" icon={Repeat} items={alerts.reorder.items}
          onClick={() => navigate('/reorder')}
          render={(it) => (<><span className="truncate">{it.name}</span><Badge className="bg-amber-100 text-amber-700">{it.daysRemaining ?? '—'}d</Badge></>)} />
        <AlertCard title="Low stock" count={alerts.lowStock.count} tone="rose" icon={AlertTriangle} items={alerts.lowStock.items}
          onClick={() => navigate('/reorder')}
          render={(it) => (<><span className="truncate">{it.name}</span><span className="text-xs text-faint">{it.onHand}</span></>)} />
        <AlertCard title="Missing / shrinkage" count={alerts.missingStock.count} tone="rose" icon={PackageSearch} items={alerts.missingStock.items}
          onClick={() => navigate('/inventory')}
          render={(it) => (<><span className="truncate">{it.product}</span><span className="text-xs text-rose-500">-{it.units}</span></>)} />
        <AlertCard title="Reps holding stock" count={alerts.outstandingRepStock.count} tone="sky" icon={Truck} items={alerts.outstandingRepStock.items}
          onClick={() => navigate('/reps')}
          render={(it) => (<><span className="truncate">{it.name}</span><span className="text-xs text-faint">{formatNumber(it.heldBaseUnits)}</span></>)} />
        <AlertCard title="Settlements overdue (72h)" count={alerts.settlements.overdue} tone="rose" icon={Timer} items={alerts.settlements.items}
          onClick={() => navigate('/settlements')}
          render={(it) => (<><span className="truncate">{it.salesRep}</span><span className={`text-xs ${it.hoursRemaining < 0 ? 'text-rose-500' : 'text-faint'}`}>{it.hoursRemaining < 0 ? `${Math.abs(Math.round(it.hoursRemaining))}h over` : `${Math.round(it.hoursRemaining)}h`}</span></>)} />
      </div>

      {/* Recent activity */}
      <Card className="mt-6">
        <CardHeader title="Recent inventory activity" subtitle="Latest ledger movements across the business" />
        {recentActivity.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Type</TH><TH>Product</TH><TH>Qty</TH><TH>Location</TH><TH>By</TH><TH>When</TH>
              </TR>
            </THead>
            <TBody>
              {recentActivity.map((a) => {
                const meta = MOVEMENT_META[a.type] || { label: a.type, cls: 'bg-elevated text-muted' };
                return (
                  <TR key={a.id}>
                    <TD><Badge className={meta.cls}>{meta.label}</Badge></TD>
                    <TD className="max-w-[220px] truncate">{a.product}</TD>
                    <TD className={a.baseQuantity < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      {a.baseQuantity > 0 ? '+' : ''}{formatNumber(a.baseQuantity)}
                    </TD>
                    <TD>{a.location || '—'}</TD>
                    <TD>{a.by || '—'}</TD>
                    <TD className="text-faint">{fromNow(a.at)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
