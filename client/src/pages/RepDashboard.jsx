import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { ClipboardList, Wallet, Boxes, Coins, ChevronRight, Timer } from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatNumber, formatDateTime } from '@/lib/format';
import { tzGreeting, tzDateLabel } from '@/lib/tz';
import { SETTLEMENT_STATUS_META } from '@/lib/constants';
import OrderDetailModal from '@/components/OrderDetail';
import { PageSpinner, EmptyState, Badge } from '@/components/ui';

function hoursLabel(h) {
  if (h == null) return '—';
  if (h < 0) return `${Math.abs(Math.round(h))}h overdue`;
  if (h < 24) return `${Math.round(h)}h left`;
  return `${Math.round(h / 24)}d left`;
}

// Big, tappable priority action with status baked in.
function QuickAction({ icon: Icon, title, value, meta, badge, highlight, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-4 rounded-2xl border p-4 text-left shadow-card transition',
        highlight
          ? 'border-brand-500/50 bg-gradient-to-br from-brand-500/20 via-surface to-surface'
          : 'border-border bg-surface hover:bg-elevated',
      )}
    >
      <span
        className={clsx(
          'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
          highlight ? 'bg-brand-600 text-slate-950' : 'bg-elevated text-brand-500',
        )}
      >
        <Icon className="h-6 w-6" />
        {badge ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 truncate text-lg font-bold text-foreground">{value}</div>
        {meta && <div className="truncate text-xs text-muted">{meta}</div>}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-faint" />
    </motion.button>
  );
}

function MiniStat({ icon: Icon, label, value, hint, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex flex-col rounded-2xl border border-border bg-surface p-4 text-left shadow-card transition hover:bg-elevated"
    >
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-brand-500"><Icon className="h-5 w-5" /></span>
      <span className="text-xs text-muted">{label}</span>
      <span className="mt-0.5 break-words text-lg font-bold text-foreground">{value}</span>
      {hint && <span className="mt-0.5 text-xs text-faint">{hint}</span>}
    </motion.button>
  );
}

export default function RepDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewing, setViewing] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: async () => unwrap(await api.get('/dashboard/me')).data,
  });

  if (isLoading) return <PageSpinner />;
  if (!data) return <EmptyState title="No data yet" />;

  const { heldStock, commission, openSettlements, openSettlementsValue, pendingRequests, orders } = data;
  const first = user?.name?.split(' ')[0] || 'there';
  const hasOutstanding = (openSettlementsValue || 0) > 0;

  const timeGreeting = tzGreeting();

  let subtitle;
  if (heldStock.units > 0 && openSettlements > 0) {
    subtitle = `You have ${formatNumber(heldStock.units)} boxes across ${openSettlements} open order${openSettlements === 1 ? '' : 's'} — settle them to earn commission.`;
  } else if (heldStock.units > 0) {
    subtitle = `${formatNumber(heldStock.units)} boxes in your hands. Settle them to earn commission.`;
  } else if ((commission?.available || 0) > 0) {
    subtitle = `${formatCurrency(commission.available)} commission is ready to withdraw. Keep going!`;
  } else {
    subtitle = "Let's move some stock today.";
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          {tzDateLabel({ weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold text-foreground">{timeGreeting}, {first}.</h1>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      </div>

      {/* Priority actions — always above the fold */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuickAction
          icon={ClipboardList}
          title="Request stock"
          value={pendingRequests > 0 ? `${pendingRequests} pending` : 'New request'}
          meta={pendingRequests > 0 ? 'Awaiting admin approval' : 'Tap to order stock'}
          badge={pendingRequests > 0 ? pendingRequests : null}
          onClick={() => navigate('/stock-requests')}
        />
        <QuickAction
          icon={Wallet}
          title="Settlement"
          value={hasOutstanding ? formatCurrency(openSettlementsValue) : 'All settled'}
          meta={openSettlements > 0 ? `${openSettlements} active order${openSettlements === 1 ? '' : 's'} · to settle` : 'Nothing outstanding'}
          badge={openSettlements > 0 ? openSettlements : null}
          highlight={hasOutstanding}
          onClick={() => navigate('/settlements')}
        />
      </div>

      {/* Secondary: stock held + commission */}
      <div className="grid grid-cols-2 gap-3">
        <MiniStat icon={Boxes} label="Stock you hold" value={formatCurrency(heldStock.value)} hint={`${formatNumber(heldStock.units)} boxes`} onClick={() => navigate('/settlements')} />
        <MiniStat icon={Coins} label="Commission earned" value={formatCurrency(commission?.earned || 0)} hint={`${formatCurrency(commission?.available || 0)} to withdraw`} onClick={() => navigate('/commissions')} />
      </div>

      {/* Open orders — the rep's action queue, as tappable cards */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Open orders</h2>
          {orders?.length > 0 && <span className="text-xs text-muted">Settle or return before 72h</span>}
        </div>
        {!orders?.length ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState title="No open orders" message="Request stock above — once an admin approves it, it appears here to settle." icon={Timer} />
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <motion.button
                key={o.id}
                whileTap={{ scale: 0.99 }}
                onClick={() => setViewing(o.id)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-card transition hover:bg-elevated"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{o.settlementNumber}</span>
                    <Badge className={SETTLEMENT_STATUS_META[o.status]?.cls}>{SETTLEMENT_STATUS_META[o.status]?.label}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    Balance <span className={o.balance > 0 ? 'font-semibold text-rose-400' : 'text-foreground'}>{formatCurrency(o.balance)}</span>
                  </div>
                  <div className={clsx('mt-0.5 text-xs', o.hoursRemaining < 0 ? 'text-rose-400' : o.approaching ? 'text-amber-400' : 'text-faint')}>
                    {hoursLabel(o.hoursRemaining)} · {formatDateTime(o.deadlineAt)}
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-500">Settle <ChevronRight className="h-4 w-4" /></span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {viewing && <OrderDetailModal settlementId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
