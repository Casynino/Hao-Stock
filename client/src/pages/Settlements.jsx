import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import clsx from 'clsx';
import {
  Timer, AlertTriangle, Clock, CheckCircle2, Eye,
  ChevronRight, Wallet, TrendingDown,
} from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ROLES, SETTLEMENT_STATUS_META } from '@/lib/constants';
import { formatCurrency, formatDateTime } from '@/lib/format';
import OrderDetailModal from '@/components/OrderDetail';
import {
  PageHeader, Card, StatCard, PageSpinner, EmptyState, Badge,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

function hoursLabel(h) {
  if (h == null) return '—';
  if (h < 0) return `${Math.abs(Math.round(h))}h overdue`;
  if (h < 24) return `${Math.round(h)}h left`;
  return `${Math.round(h / 24)}d left`;
}

// ── Rep-facing card for an ACTIVE order ─────────────────────────────────────

function ActiveOrderCard({ s, onClick }) {
  const overdue = s.status === 'OVERDUE';
  const approaching = s.approaching;

  const accent = overdue
    ? { border: 'border-rose-500/30', bg: 'bg-rose-500/5', text: 'text-rose-400', timeCls: 'text-rose-400' }
    : approaching
      ? { border: 'border-amber-500/30', bg: 'bg-amber-500/5', text: 'text-amber-400', timeCls: 'text-amber-400' }
      : { border: 'border-border', bg: 'bg-surface', text: 'text-brand-400', timeCls: 'text-faint' };

  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={clsx('w-full rounded-2xl border p-4 text-left transition hover:bg-elevated', accent.border, accent.bg)}
    >
      {/* Order number + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-foreground">{s.settlementNumber}</span>
        <Badge className={SETTLEMENT_STATUS_META[s.status]?.cls}>
          {SETTLEMENT_STATUS_META[s.status]?.label}
        </Badge>
      </div>

      {/* Outstanding — hero figure */}
      <div className="mt-3">
        <div className="text-[11px] uppercase tracking-widest text-faint">Outstanding</div>
        <div className={clsx('mt-0.5 text-2xl font-black tabular-nums', accent.text)}>
          {formatCurrency(s.balance)}
        </div>
      </div>

      {/* Secondary money line */}
      <div className="mt-2 flex gap-4 text-xs text-faint">
        <span>Order {formatCurrency(s.assignedValue)}</span>
        {s.paid > 0 && <span className="text-emerald-400">Settled {formatCurrency(s.paid)}</span>}
        {s.returned > 0 && <span className="text-sky-400">Returned {formatCurrency(s.returned)}</span>}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
        <span className={clsx('text-xs font-medium', accent.timeCls)}>
          {hoursLabel(s.hoursRemaining)} · {formatDateTime(s.deadlineAt)}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-400">
          Open <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </motion.button>
  );
}

// ── Rep-facing row for a COMPLETED order ─────────────────────────────────────

function CompletedRow({ s, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-elevated"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-muted">{s.settlementNumber}</span>
        <span className="ml-2 text-sm text-faint">{formatCurrency(s.assignedValue)}</span>
      </div>
      <span className="shrink-0 text-xs text-faint">{formatDateTime(s.issuedAt)}</span>
      <Eye className="h-3.5 w-3.5 shrink-0 text-faint" />
    </button>
  );
}

// ── Rep view: two-section layout ─────────────────────────────────────────────

function RepSettlements({ viewing, setViewing }) {
  const { data, isLoading } = useQuery({
    queryKey: ['settlements', 'rep-all'],
    queryFn: async () => unwrap(await api.get('/settlements', { params: { limit: 100 } })),
    refetchInterval: 60_000,
  });

  if (isLoading) return <PageSpinner />;

  const all = data?.data || [];
  const active = all.filter((s) => s.status !== 'SETTLED');
  const completed = all.filter((s) => s.status === 'SETTLED');

  return (
    <div className="space-y-8">
      {/* ── Active ── */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-brand-500" />
          <h2 className="text-base font-bold text-foreground">
            Active orders
            {active.length > 0 && (
              <span className="ml-2 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-black text-slate-950">
                {active.length}
              </span>
            )}
          </h2>
        </div>

        {active.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState
              title="No active orders"
              message="When stock is approved and issued to you, the order appears here within the 72h settlement window."
              icon={Timer}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((s) => (
              <ActiveOrderCard key={s.id} s={s} onClick={() => setViewing(s.id)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Completed ── */}
      {completed.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-muted">
              Completed orders ({completed.length})
            </h2>
          </div>
          <Card>
            <div className="divide-y divide-border px-2">
              {completed.map((s) => (
                <CompletedRow key={s.id} s={s} onClick={() => setViewing(s.id)} />
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Staff / admin view: full table ──────────────────────────────────────────

function StaffSettlements({ viewing, setViewing }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const { data: summary } = useQuery({
    queryKey: ['settlements', 'summary'],
    queryFn: async () => unwrap(await api.get('/settlements/summary')).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['settlements', { page, status }],
    queryFn: async () => unwrap(await api.get('/settlements', { params: { page, limit: 15, status: status || undefined } })),
  });

  return (
    <div>
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Outstanding" value={summary.outstandingCount} icon={Timer} tone="brand" hint={formatCurrency(summary.outstandingValue)} />
          <StatCard label="Approaching deadline" value={summary.approachingCount} icon={Clock} tone="amber" hint="within 12 hours" />
          <StatCard label="Overdue (>72h)" value={summary.overdueCount} icon={AlertTriangle} tone="rose" hint={formatCurrency(summary.overdueValue)} />
          <StatCard label="Total orders" value={data?.meta?.total ?? '—'} icon={CheckCircle2} tone="emerald" />
        </div>
      )}

      <Card>
        <div className="border-b border-border p-4">
          <select className="input sm:w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {Object.entries(SETTLEMENT_STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {isLoading ? <PageSpinner /> : !data?.data?.length ? (
          <EmptyState title="No orders yet" message="Orders open automatically when stock is issued to a rep." icon={Timer} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Order</TH><TH>Rep</TH><TH>Value</TH>
                  <TH>Settled</TH><TH>Balance</TH>
                  <TH>Deadline</TH><TH>Status</TH><TH />
                </TR>
              </THead>
              <TBody>
                {data.data.map((s) => (
                  <TR key={s.id} className="cursor-pointer" onClick={() => setViewing(s.id)}>
                    <TD className="font-medium">{s.settlementNumber}</TD>
                    <TD>{s.salesRep?.user?.name}</TD>
                    <TD>{formatCurrency(s.assignedValue)}</TD>
                    <TD className="text-emerald-500">{formatCurrency(s.paid)}</TD>
                    <TD className={s.balance > 0 ? 'font-semibold text-rose-500' : 'text-faint'}>{formatCurrency(s.balance)}</TD>
                    <TD>
                      {s.status === 'SETTLED' ? (
                        // Finalized order — no countdown, no overdue, just when it closed.
                        <div className="inline-flex items-center gap-1 text-xs text-emerald-500">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Settled{s.settledAt ? ` · ${formatDateTime(s.settledAt)}` : ''}
                        </div>
                      ) : (
                        <>
                          <div className="text-muted">{formatDateTime(s.deadlineAt)}</div>
                          <div className={clsx('text-xs', s.hoursRemaining < 0 ? 'text-rose-500' : s.approaching ? 'text-amber-500' : 'text-faint')}>
                            {hoursLabel(s.hoursRemaining)}
                          </div>
                        </>
                      )}
                    </TD>
                    <TD><Badge className={SETTLEMENT_STATUS_META[s.status]?.cls}>{SETTLEMENT_STATUS_META[s.status]?.label}</Badge></TD>
                    <TD>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                        Open <Eye className="h-3.5 w-3.5" />
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

// ── Page shell ───────────────────────────────────────────────────────────────

export default function Settlements() {
  const { hasRole } = useAuth();
  const isRep = !hasRole(ROLES.WAREHOUSE_STAFF);
  const [viewing, setViewing] = useState(null);

  return (
    <div>
      <PageHeader
        title="Orders & Settlements"
        subtitle={isRep
          ? 'Active orders need action within 72 hours — settle boxes or return unsold stock.'
          : 'Each approved order is a 72-hour contract — open one to settle boxes and record returns.'
        }
      />

      {isRep
        ? <RepSettlements viewing={viewing} setViewing={setViewing} />
        : <StaffSettlements viewing={viewing} setViewing={setViewing} />
      }

      {viewing && <OrderDetailModal settlementId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
