import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import clsx from 'clsx';
import {
  ClipboardList, Boxes, ChevronRight,
  TrendingUp, Undo2, CheckCircle2,
} from 'lucide-react';
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

// ── Request Stock — top primary action ───────────────────────────────────────

function RequestStockCard({ pendingRequests, onClick }) {
  const hasPending = pendingRequests > 0;
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-2xl border border-brand-500/40 bg-gradient-to-r from-brand-500/12 via-brand-500/8 to-transparent p-4 text-left transition hover:from-brand-500/18"
    >
      {/* Subtle animated glow ring on icon */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-xl bg-brand-500/30"
          />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-slate-950">
            <ClipboardList className="h-6 w-6" />
            {hasPending && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {pendingRequests}
              </span>
            )}
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-brand-500">Stock Request</div>
          <div className="mt-0.5 text-base font-bold text-foreground">
            {hasPending ? `${pendingRequests} pending approval` : 'Request Stock from The Lab'}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {hasPending ? 'Awaiting admin approval — tap to view' : 'Tap to order new inventory'}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-brand-500/60" />
      </div>
    </motion.button>
  );
}

// ── Combined Stock & Settlement card ─────────────────────────────────────────

function StockSettlementCard({ heldStock, openSettlements, openSettlementsValue, orders, onViewOrder, navigate }) {
  const hasOrders = orders?.length > 0;
  const hasStock = heldStock.units > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-elevated/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-brand-500" />
          <span className="text-sm font-semibold text-foreground">Your Stock & Settlement</span>
        </div>
        {openSettlements > 0 && (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-400">
            {openSettlements} active
          </span>
        )}
      </div>

      {/* Stock summary row */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-faint">Boxes held</div>
          <div className="mt-0.5 text-lg font-bold text-foreground">{formatNumber(heldStock.units)}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-faint">Stock value</div>
          <div className="mt-0.5 text-lg font-bold text-brand-400">{formatCurrency(heldStock.value)}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-faint">Outstanding</div>
          <div className={clsx('mt-0.5 text-lg font-bold', openSettlementsValue > 0 ? 'text-rose-400' : 'text-emerald-400')}>
            {openSettlementsValue > 0 ? formatCurrency(openSettlementsValue) : 'Clear'}
          </div>
        </div>
      </div>

      {/* Order list */}
      {!hasOrders ? (
        <div className="flex items-center gap-3 px-4 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <div className="text-sm font-medium text-foreground">All settled</div>
            <div className="text-xs text-faint">No open orders right now</div>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {orders.map((o) => {
            const overdue = o.hoursRemaining < 0;
            const approaching = o.approaching;
            return (
              <motion.li key={o.id} whileTap={{ scale: 0.99 }}>
                <button
                  onClick={() => onViewOrder(o.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-elevated"
                >
                  {/* Status dot */}
                  <span className={clsx(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    overdue ? 'bg-rose-400' : approaching ? 'bg-amber-400' : 'bg-brand-400',
                  )} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{o.settlementNumber}</span>
                      <Badge className={SETTLEMENT_STATUS_META[o.status]?.cls}>
                        {SETTLEMENT_STATUS_META[o.status]?.label}
                      </Badge>
                    </div>
                    <div className={clsx('mt-0.5 text-xs', overdue ? 'text-rose-400' : approaching ? 'text-amber-400' : 'text-faint')}>
                      {hoursLabel(o.hoursRemaining)} · {formatDateTime(o.deadlineAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={clsx('text-sm font-bold', o.balance > 0 ? 'text-rose-400' : 'text-emerald-400')}>
                      {formatCurrency(o.balance)}
                    </div>
                    <div className="mt-0.5 flex items-center justify-end gap-0.5 text-[11px] font-semibold text-brand-400">
                      Settle <ChevronRight className="h-3 w-3" />
                    </div>
                  </div>
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* Return stock footer */}
      {hasStock && (
        <div className="border-t border-border px-4 py-3">
          <button
            onClick={() => navigate('/settlements')}
            className="flex items-center gap-2 text-sm text-muted transition hover:text-foreground"
          >
            <Undo2 className="h-4 w-4 text-faint" />
            Return stock to The Lab
            <ChevronRight className="h-3.5 w-3.5 text-faint" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Your Earnings card ───────────────────────────────────────────────────────

function EarningsCard({ commission, onClick }) {
  const earned = commission?.earned || 0;
  const available = commission?.available || 0;
  const hasEarnings = earned > 0;

  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className="w-full rounded-2xl border border-border bg-surface p-4 text-left shadow-card transition hover:bg-elevated"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-brand-500">
          <TrendingUp className="h-5 w-5" />
        </div>
        <ChevronRight className="h-4 w-4 text-faint" />
      </div>
      <div className="text-xs font-semibold uppercase tracking-widest text-muted">Your Earnings</div>
      <div className={clsx('mt-1 text-2xl font-black tabular-nums', hasEarnings ? 'text-foreground' : 'text-faint')}>
        {formatCurrency(earned)}
      </div>
      {available > 0 ? (
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          <span className="text-xs font-semibold text-brand-400">{formatCurrency(available)} ready to withdraw</span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-faint">Settle boxes to earn commission</div>
      )}
    </motion.button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RepDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewing, setViewing] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: async () => unwrap(await api.get('/dashboard/me')).data,
    refetchInterval: 60_000,
  });

  if (isLoading) return <PageSpinner />;
  if (!data) return <EmptyState title="No data yet" />;

  const { heldStock, commission, openSettlements, openSettlementsValue, pendingRequests, orders } = data;
  const first = user?.name?.split(' ')[0] || 'there';
  const timeGreeting = tzGreeting();

  let subtitle;
  if (heldStock.units > 0 && openSettlements > 0) {
    subtitle = `${formatNumber(heldStock.units)} boxes · ${openSettlements} open order${openSettlements !== 1 ? 's' : ''} · settle to earn commission.`;
  } else if (heldStock.units > 0) {
    subtitle = `${formatNumber(heldStock.units)} boxes in your hands — settle them to earn commission.`;
  } else if ((commission?.available || 0) > 0) {
    subtitle = `${formatCurrency(commission.available)} is ready to withdraw. Keep going!`;
  } else {
    subtitle = "Let's move some stock today.";
  }

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          {tzDateLabel({ weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold text-foreground sm:text-3xl">{timeGreeting}, {first}.</h1>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      </div>

      {/* Main layout: single column on mobile, 2-col on desktop */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Left / main: stock + settlement (takes 2/3 on desktop) */}
        <div className="space-y-4 lg:col-span-2">
          <StockSettlementCard
            heldStock={heldStock}
            openSettlements={openSettlements}
            openSettlementsValue={openSettlementsValue}
            orders={orders}
            onViewOrder={setViewing}
            navigate={navigate}
          />
        </div>

        {/* Right sidebar: request + earnings (1/3 on desktop) */}
        <div className="space-y-4">
          <RequestStockCard
            pendingRequests={pendingRequests}
            onClick={() => navigate('/stock-requests')}
          />
          <EarningsCard
            commission={commission}
            onClick={() => navigate('/commissions')}
          />
        </div>
      </div>

      {viewing && <OrderDetailModal settlementId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
