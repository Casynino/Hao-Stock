import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import clsx from 'clsx';
import {
  ClipboardList, TrendingUp, Undo2, ArrowRight, Timer, Eye,
  NotebookPen, Sun, Moon, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap, apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { tzGreeting, tzDateLabel } from '@/lib/tz';
import { SETTLEMENT_STATUS_META } from '@/lib/constants';
import OrderDetailModal from '@/components/OrderDetail';
import { PageSpinner, EmptyState, Badge, Modal, Button, Field, Input, Textarea } from '@/components/ui';

const TZ = 'Africa/Dar_es_Salaam';
function todayTZ() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

function hoursLabel(h) {
  if (h == null) return '—';
  if (h < 0) return `${Math.abs(Math.round(h))}h overdue`;
  if (h < 24) return `${Math.round(h)}h left`;
  return `${Math.round(h / 24)}d left`;
}

// ── Standard dash card ───────────────────────────────────────────────────────

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
          {badge != null && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {badge}
            </span>
          )}
        </span>
        <ArrowRight className="h-4 w-4 text-faint" />
      </div>
      <span className="text-xs text-muted">{label}</span>
      <span className="mt-0.5 text-xl font-bold text-foreground">{value}</span>
      {hint && <span className="mt-0.5 text-xs text-faint">{hint}</span>}
    </motion.button>
  );
}

// ── Daily Report submit modal ────────────────────────────────────────────────

function ReportModal({ type, onClose }) {
  const qc = useQueryClient();
  const today = todayTZ();
  const [form, setForm] = useState({});
  const num = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value === '' ? undefined : Number(e.target.value) }));
  const txt = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = useMutation({
    mutationFn: () => api.post('/daily-reports', { type, reportDate: today, ...form }),
    onSuccess: () => {
      toast.success('Report submitted');
      qc.invalidateQueries({ queryKey: ['daily-reports', 'today'] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={type === 'OPENING' ? 'Opening Report' : 'Closing Report'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={submit.isPending} onClick={() => submit.mutate()}>Submit</Button>
        </>
      }
    >
      <div className="space-y-4">
        {type === 'OPENING' ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cash on hand"><Input type="number" min="0" onChange={num('cashOnHand')} /></Field>
              <Field label="Customers to visit"><Input type="number" min="0" onChange={num('customersToVisit')} /></Field>
            </div>
            <Field label="Notes"><Textarea rows={2} onChange={txt('openingNote')} placeholder="Plan for the day…" /></Field>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Sales made"><Input type="number" min="0" onChange={num('salesAmount')} /></Field>
              <Field label="Cash collected"><Input type="number" min="0" onChange={num('cashCollected')} /></Field>
              <Field label="Debts created"><Input type="number" min="0" onChange={num('debtsCreated')} /></Field>
              <Field label="Debts collected"><Input type="number" min="0" onChange={num('debtsCollected')} /></Field>
            </div>
            <Field label="Notes"><Textarea rows={2} onChange={txt('closingNote')} placeholder="Remaining stock, issues…" /></Field>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Daily Report card ────────────────────────────────────────────────────────

function DailyReportCard({ onSubmit }) {
  const navigate = useNavigate();
  const today = todayTZ();

  const { data } = useQuery({
    queryKey: ['daily-reports', 'today', today],
    queryFn: async () => unwrap(await api.get('/daily-reports', { params: { from: today, to: today, limit: 5 } })),
    refetchInterval: 60_000,
  });

  const reports = data?.data || [];
  const hasOpening = reports.some((r) => r.type === 'OPENING');
  const hasClosing = reports.some((r) => r.type === 'CLOSING');
  const done = (hasOpening ? 1 : 0) + (hasClosing ? 1 : 0);
  const allDone = done === 2;

  return (
    <div className={clsx(
      'flex w-full flex-col rounded-2xl border p-4 text-left shadow-card',
      allDone ? 'border-emerald-500/30 bg-surface' : 'border-border bg-surface',
    )}>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-brand-500">
          <NotebookPen className="h-5 w-5" />
        </span>
        <button
          onClick={() => navigate('/daily-reports')}
          className="text-[11px] font-semibold text-faint transition hover:text-muted"
        >
          View all →
        </button>
      </div>
      <span className="text-xs text-muted">Daily Report</span>
      <span className={clsx('mt-0.5 text-xl font-bold', allDone ? 'text-emerald-400' : 'text-foreground')}>
        {done}/2 submitted
      </span>

      <div className="mt-3 space-y-2.5 border-t border-border pt-3">
        {/* Opening */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sun className="h-3.5 w-3.5 text-amber-400" />
            <span className={clsx('text-xs font-medium', hasOpening ? 'text-emerald-400' : 'text-faint')}>
              Opening
            </span>
            {hasOpening && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
          </div>
          {!hasOpening && (
            <button
              onClick={() => onSubmit('OPENING')}
              className="text-[11px] font-semibold text-brand-400 transition hover:text-brand-300"
            >
              Submit →
            </button>
          )}
        </div>
        {/* Closing */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="h-3.5 w-3.5 text-indigo-400" />
            <span className={clsx('text-xs font-medium', hasClosing ? 'text-emerald-400' : 'text-faint')}>
              Closing
            </span>
            {hasClosing && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
          </div>
          {!hasClosing && (
            <button
              onClick={() => onSubmit('CLOSING')}
              className="text-[11px] font-semibold text-brand-400 transition hover:text-brand-300"
            >
              Submit →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RepDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewing, setViewing] = useState(null);
  const [reportModal, setReportModal] = useState(null); // 'OPENING' | 'CLOSING'

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: async () => unwrap(await api.get('/dashboard/me')).data,
    refetchInterval: 60_000,
  });

  if (isLoading) return <PageSpinner />;
  if (!data) return <EmptyState title="No data yet" />;

  const { heldStock, commission, openSettlements, openSettlementsValue, pendingRequests, orders } = data;
  const first = user?.name?.split(' ')[0] || 'there';

  const settlementHint = openSettlements === 0
    ? 'No open orders'
    : `${openSettlements} active order${openSettlements !== 1 ? 's' : ''} · settle now`;

  const commissionHint = (commission?.available || 0) > 0
    ? `${formatCurrency(commission.available)} ready to withdraw`
    : 'Settle boxes to earn commission';

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          {tzDateLabel({ weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold text-foreground sm:text-3xl">
          {tzGreeting()}, {first}.
        </h1>
      </div>

      {/* 4-card grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashCard
          icon={ClipboardList}
          label="Request stock"
          value="Order from The Lab"
          hint="Tap to request new inventory"
          badge={pendingRequests > 0 ? pendingRequests : undefined}
          onClick={() => navigate('/stock-requests')}
        />
        <DashCard
          icon={Timer}
          label="Settlement"
          value={openSettlementsValue > 0 ? formatCurrency(openSettlementsValue) : 'Clear'}
          hint={settlementHint}
          highlight={openSettlements > 0}
          badge={openSettlements > 0 ? openSettlements : undefined}
          onClick={() => navigate('/settlements')}
        />
        <DailyReportCard onSubmit={setReportModal} />
        <DashCard
          icon={TrendingUp}
          label="Your Earnings"
          value={formatCurrency(commission?.earned || 0)}
          hint={commissionHint}
          onClick={() => navigate('/commissions')}
        />
      </div>

      {/* Return stock — secondary action */}
      {heldStock.units > 0 && (
        <motion.button
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/settlements')}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left transition hover:bg-elevated"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-elevated text-brand-500">
            <Undo2 className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground">Return Stock to The Lab</div>
            <div className="text-xs text-faint">Return unsold boxes before the deadline</div>
          </div>
          <ArrowRight className="h-4 w-4 text-faint" />
        </motion.button>
      )}

      {/* Open orders */}
      {orders.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Open orders</h2>
            <span className="text-xs text-faint">Settle or return before 72 h deadline</span>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 lg:hidden">
            {orders.map((o) => {
              const overdue = o.hoursRemaining < 0;
              const approaching = o.approaching;
              return (
                <motion.button
                  key={o.id}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => setViewing(o.id)}
                  className={clsx(
                    'w-full rounded-2xl border p-4 text-left transition',
                    overdue ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-surface hover:bg-elevated',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{o.settlementNumber}</span>
                      <Badge className={SETTLEMENT_STATUS_META[o.status]?.cls}>
                        {SETTLEMENT_STATUS_META[o.status]?.label}
                      </Badge>
                    </div>
                    <span className={clsx('font-bold', o.balance > 0 ? 'text-rose-400' : 'text-emerald-400')}>
                      {formatCurrency(o.balance)}
                    </span>
                  </div>
                  <div className={clsx('mt-1.5 flex items-center justify-between text-xs', overdue ? 'text-rose-400' : approaching ? 'text-amber-400' : 'text-faint')}>
                    <span>{hoursLabel(o.hoursRemaining)} · {formatDateTime(o.deadlineAt)}</span>
                    <span className="font-semibold text-brand-400">Settle &rsaquo;</span>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-faint">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-faint">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-faint">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-faint">Deadline</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => {
                  const overdue = o.hoursRemaining < 0;
                  const approaching = o.approaching;
                  return (
                    <tr key={o.id} className="cursor-pointer transition hover:bg-elevated" onClick={() => setViewing(o.id)}>
                      <td className="px-4 py-3 font-semibold text-foreground">{o.settlementNumber}</td>
                      <td className="px-4 py-3">
                        <Badge className={SETTLEMENT_STATUS_META[o.status]?.cls}>
                          {SETTLEMENT_STATUS_META[o.status]?.label}
                        </Badge>
                      </td>
                      <td className={clsx('px-4 py-3 font-bold', o.balance > 0 ? 'text-rose-400' : 'text-emerald-400')}>
                        {formatCurrency(o.balance)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-muted">{formatDateTime(o.deadlineAt)}</div>
                        <div className={clsx('text-xs', overdue ? 'text-rose-400' : approaching ? 'text-amber-400' : 'text-faint')}>
                          {hoursLabel(o.hoursRemaining)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-400">
                          Open <Eye className="h-3.5 w-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewing && <OrderDetailModal settlementId={viewing} onClose={() => setViewing(null)} />}
      {reportModal && <ReportModal type={reportModal} onClose={() => setReportModal(null)} />}
    </div>
  );
}
