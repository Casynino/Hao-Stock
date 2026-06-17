import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { ClipboardList, Wallet, Boxes, Coins, ChevronRight, Timer, ArrowRight } from 'lucide-react';
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

// Unified action/stat card — works for both quick-action and stat use cases
function DashCard({ icon: Icon, label, value, hint, badge, highlight, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={clsx(
        'flex w-full flex-col rounded-2xl border p-4 text-left shadow-card transition',
        highlight
          ? 'border-brand-500/50 bg-gradient-to-br from-brand-500/15 via-surface to-surface'
          : 'border-border bg-surface hover:bg-elevated',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className={clsx(
          'relative flex h-10 w-10 items-center justify-center rounded-xl',
          highlight ? 'bg-brand-600 text-slate-950' : 'bg-elevated text-brand-500',
        )}>
          <Icon className="h-5 w-5" />
          {badge ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {badge}
            </span>
          ) : null}
        </span>
        <ArrowRight className="h-4 w-4 text-faint" />
      </div>
      <span className="text-xs text-muted">{label}</span>
      <span className="mt-0.5 text-xl font-bold text-foreground">{value}</span>
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
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          {tzDateLabel({ weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold text-foreground sm:text-3xl">{timeGreeting}, {first}.</h1>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      </div>

      {/* 4-column stat grid on desktop, 2-column on mobile */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashCard
          icon={ClipboardList}
          label="Request stock"
          value={pendingRequests > 0 ? `${pendingRequests} pending` : 'New request'}
          hint={pendingRequests > 0 ? 'Awaiting admin approval' : 'Tap to order stock'}
          badge={pendingRequests > 0 ? pendingRequests : null}
          onClick={() => navigate('/stock-requests')}
        />
        <DashCard
          icon={Wallet}
          label="Settlement"
          value={hasOutstanding ? formatCurrency(openSettlementsValue) : 'All settled'}
          hint={openSettlements > 0
            ? `${openSettlements} active order${openSettlements === 1 ? '' : 's'} outstanding`
            : 'Nothing outstanding'}
          badge={openSettlements > 0 ? openSettlements : null}
          highlight={hasOutstanding}
          onClick={() => navigate('/settlements')}
        />
        <DashCard
          icon={Boxes}
          label="Stock you hold"
          value={formatCurrency(heldStock.value)}
          hint={`${formatNumber(heldStock.units)} boxes`}
          onClick={() => navigate('/settlements')}
        />
        <DashCard
          icon={Coins}
          label="Commission earned"
          value={formatCurrency(commission?.earned || 0)}
          hint={`${formatCurrency(commission?.available || 0)} to withdraw`}
          onClick={() => navigate('/commissions')}
        />
      </div>

      {/* Open orders */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Open orders</h2>
          {orders?.length > 0 && (
            <span className="text-xs text-muted">Settle or return before 72 h deadline</span>
          )}
        </div>

        {!orders?.length ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState
              title="No open orders"
              message="Request stock above — once an admin approves it, it appears here to settle."
              icon={Timer}
            />
          </div>
        ) : (
          <>
            {/* Desktop: table */}
            <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-elevated">
                  <tr>
                    <th className="th text-left">Order</th>
                    <th className="th text-left">Status</th>
                    <th className="th text-right">Outstanding</th>
                    <th className="th text-left">Deadline</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => setViewing(o.id)}
                      className="cursor-pointer transition hover:bg-elevated"
                    >
                      <td className="td font-semibold text-foreground">{o.settlementNumber}</td>
                      <td className="td">
                        <Badge className={SETTLEMENT_STATUS_META[o.status]?.cls}>
                          {SETTLEMENT_STATUS_META[o.status]?.label}
                        </Badge>
                      </td>
                      <td className="td text-right">
                        <span className={o.balance > 0 ? 'font-semibold text-rose-400' : 'text-foreground'}>
                          {formatCurrency(o.balance)}
                        </span>
                      </td>
                      <td className="td">
                        <span className={clsx(
                          'text-xs',
                          o.hoursRemaining < 0 ? 'text-rose-400' : o.approaching ? 'text-amber-400' : 'text-faint',
                        )}>
                          {hoursLabel(o.hoursRemaining)} · {formatDateTime(o.deadlineAt)}
                        </span>
                      </td>
                      <td className="td text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-500">
                          Settle <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: tappable cards */}
            <div className="space-y-2 lg:hidden">
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
                      <Badge className={SETTLEMENT_STATUS_META[o.status]?.cls}>
                        {SETTLEMENT_STATUS_META[o.status]?.label}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      Balance{' '}
                      <span className={o.balance > 0 ? 'font-semibold text-rose-400' : 'text-foreground'}>
                        {formatCurrency(o.balance)}
                      </span>
                    </div>
                    <div className={clsx(
                      'mt-0.5 text-xs',
                      o.hoursRemaining < 0 ? 'text-rose-400' : o.approaching ? 'text-amber-400' : 'text-faint',
                    )}>
                      {hoursLabel(o.hoursRemaining)} · {formatDateTime(o.deadlineAt)}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-500">
                    Settle <ChevronRight className="h-4 w-4" />
                  </span>
                </motion.button>
              ))}
            </div>
          </>
        )}
      </div>

      {viewing && <OrderDetailModal settlementId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
