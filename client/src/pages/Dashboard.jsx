import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, TrendingUp, HandCoins, Boxes, Warehouse, Truck, AlertTriangle,
  PackageSearch, Repeat, ArrowRight, Timer, Coins,
} from 'lucide-react';
import { motion } from 'motion/react';
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
  CIVILLY: { ring: 'border-violet-500/30', bg: 'bg-violet-500/5', badge: 'bg-violet-500/15 text-violet-400', dot: 'bg-violet-400' },
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
        <Money label="Sales today" value={formatCurrency(b.salesToday)} />
        <Money label="In The Lab" value={`${formatNumber(b.warehouseUnits)}`} sub="boxes in warehouse" />
      </div>
    </button>
  );
}

function AlertCard({ title, count, tone, icon: Icon, items = [], render, onClick }) {
  const tones = {
    amber: 'text-amber-400 bg-amber-500/15',
    rose: 'text-rose-400 bg-rose-500/15',
    sky: 'text-sky-400 bg-sky-500/15',
    violet: 'text-violet-400 bg-violet-500/15',
  };
  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={`rounded-lg p-2 ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
          <div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="text-2xl font-bold text-foreground">{count}</div>
          </div>
        </div>
        {onClick && (
          <button onClick={onClick} className="text-faint hover:text-brand-600"><ArrowRight className="h-5 w-5" /></button>
        )}
      </div>
      {items.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <ul className="space-y-1.5 text-sm">
            {items.slice(0, 4).map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-muted">{render(it)}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
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

  const topSellingData = topSelling.map((p) => ({ name: p.name.replace(/CIVILLY|OHIS/, '').trim().slice(0, 22), value: p.revenue }));
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
              <div className="text-2xl font-bold">{formatCurrency(sales.daily.revenue, { compact: true })}</div>
            </div>
            <div>
              <div className="text-xs text-white/50">This month</div>
              <div className="text-2xl font-bold">{formatCurrency(sales.monthly.revenue, { compact: true })}</div>
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
        <StatCard label="4 · Best seller" value={topSelling[0] ? topSelling[0].name.replace(/CIVILLY|OHIS/, '').trim().slice(0, 16) : '—'}
          icon={TrendingUp} tone="emerald" hint={topSelling[0] ? formatCurrency(topSelling[0].revenue) : 'no sales yet'} onClick={() => navigate('/reports')} />
        <StatCard label="5 · Commission owed" value={formatCurrency(commission?.totals?.pending || 0)} icon={Coins} tone="amber"
          hint="pending payout" onClick={() => navigate('/commissions')} />
      </div>

      {/* Financial snapshot */}
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Sales today" value={formatCurrency(sales.daily.revenue)} icon={TrendingUp} tone="emerald" hint={`${sales.daily.orders} orders`} />
        <StatCard label="Sales this month" value={formatCurrency(sales.monthly.revenue)} icon={TrendingUp} tone="emerald" hint={`${sales.monthly.orders} orders`} onClick={() => navigate('/reports')} />
        <StatCard label="Gross profit (month)" value={formatCurrency(profit.grossProfit)} icon={Wallet} tone="violet" hint={`Margin ${profit.grossMargin}%`} />
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
