import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Coins, Wallet, Clock, TrendingUp, AlertTriangle, Info, ShieldAlert, HeartHandshake } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ROLES, WITHDRAWAL_STATUS_META } from '@/lib/constants';
import { formatCurrency, formatNumber, formatDateTime } from '@/lib/format';
import {
  PageHeader, Card, CardHeader, StatCard, PageSpinner, EmptyState, Badge, Button, Modal, Field, Input, Textarea,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

function WithdrawModal({ available, minWithdrawal, onClose }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const req = useMutation({
    mutationFn: () => api.post('/commissions/withdrawals', { amount: Number(amount), notes: notes || undefined }),
    onSuccess: () => { toast.success('Withdrawal requested'); qc.invalidateQueries({ queryKey: ['commissions'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const amt = Number(amount);
  const valid = amt > 0 && amt <= available;
  return (
    <Modal open onClose={onClose} title="Request commission withdrawal"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={req.isPending} disabled={!valid} onClick={() => req.mutate()}>Request withdrawal</Button></>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">
          Available balance: <b>{formatCurrency(available)}</b>
        </div>
        <Field label="Amount" required hint={`Max ${formatCurrency(available)}`}>
          <Input type="number" min="0" max={available} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function PenaltyBreakdown({ breakdown }) {
  if (!breakdown?.length) return null;
  return (
    <Card className="mt-4 border border-rose-500/20 bg-rose-500/5">
      <CardHeader
        title="Penalty deductions by order"
        subtitle="Late-settlement fines (TZS 10,000/day) actually deducted from your commission balance."
      />
      <Table>
        <THead>
          <TR>
            <TH>Order</TH>
            <TH>Days overdue</TH>
            <TH>Daily rate</TH>
            <TH className="text-right">Total deducted</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {breakdown.map((p) => (
            <TR key={p.settlementId}>
              <TD className="font-medium">{p.settlementNumber}</TD>
              <TD className="text-rose-400">{p.daysOverdue}</TD>
              <TD>{formatCurrency(p.penaltyPerDay)}</TD>
              <TD className="text-right font-semibold text-rose-400">−{formatCurrency(p.totalPenalty)}</TD>
              <TD className="text-xs">
                {p.closed ? <span className="text-emerald-500">Order closed</span>
                  : p.exemptPendingReturn ? <span className="text-sky-400">Paused — return under review</span>
                    : <span className="text-rose-400">Still accruing daily</span>}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

// Forgive one fine: keeps the record, returns the money to the rep's balance.
function ForgiveModal({ penalty, onClose }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const waive = useMutation({
    mutationFn: () => api.post(`/penalties/${penalty.id}/waive`, { reason: reason || undefined }),
    onSuccess: () => {
      toast.success(`Fine forgiven — ${formatCurrency(penalty.amount)} returned to ${penalty.salesRep?.user?.name || 'the rep'}`);
      ['penalties', 'commissions', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Modal open onClose={onClose} title="Forgive this fine?" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={waive.isPending} onClick={() => waive.mutate()}>
          <HeartHandshake className="h-4 w-4" /> Forgive — return {formatCurrency(penalty.amount)}
        </Button>
      </>
    }>
      <div className="space-y-3 text-sm">
        <p>
          <b>{penalty.salesRep?.user?.name}</b> · {formatCurrency(penalty.amount)} fine on order{' '}
          <b>{penalty.settlement?.settlementNumber || '—'}</b> ({formatDateTime(penalty.appliedAt)}).
        </p>
        <p className="text-muted">
          The fine stays on record as “Forgiven”, but the {formatCurrency(penalty.amount)} goes back into the rep's
          commission balance immediately. This only affects this one transaction.
        </p>
        <Field label="Reason" hint="Optional — shown in the audit log">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. order was cancelled — fine applied by mistake" />
        </Field>
      </div>
    </Modal>
  );
}

// Permanent fine transactions (Commission/Wallet history). Each row is a real
// deduction record, like any other financial transaction.
function FinesHistory({ admin }) {
  const [forgiving, setForgiving] = useState(null);
  const { data } = useQuery({
    queryKey: ['penalties', admin ? 'all' : 'mine'],
    queryFn: async () => unwrap(await api.get('/penalties', { params: { limit: 50 } })),
  });
  const items = data?.data || [];
  if (!items.length) return null;
  return (
    <Card className="mt-6">
      <CardHeader title="Penalty transactions" subtitle="Every late-settlement fine — a permanent record. Forgiven fines stay listed but no longer reduce the balance." />
      <Table>
        <THead><TR>{admin && <TH>Rep</TH>}<TH>Type</TH><TH>Order</TH><TH className="text-right">Amount</TH><TH>Status</TH><TH>Date</TH>{admin && <TH />}</TR></THead>
        <TBody>
          {items.map((p) => {
            const waived = p.status === 'WAIVED';
            return (
              <TR key={p.id}>
                {admin && <TD className="font-medium">{p.salesRep?.user?.name}</TD>}
                <TD>Late Settlement Fine</TD>
                <TD className="text-faint">{p.settlement?.settlementNumber || '—'}</TD>
                <TD className={`text-right font-semibold ${waived ? 'text-faint line-through' : 'text-rose-400'}`}>−{formatCurrency(p.amount)}</TD>
                <TD>
                  {waived
                    ? <Badge className="bg-emerald-100 text-emerald-700" title={p.waiveReason || undefined}>Forgiven</Badge>
                    : <Badge className="bg-rose-100 text-rose-700">Applied</Badge>}
                </TD>
                <TD className="text-faint">{waived && p.waivedAt ? `${formatDateTime(p.appliedAt)} · forgiven ${formatDateTime(p.waivedAt)}` : formatDateTime(p.appliedAt)}</TD>
                {admin && (
                  <TD>
                    {!waived && (
                      <button
                        onClick={() => setForgiving(p)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500/20"
                      >
                        <HeartHandshake className="h-3.5 w-3.5" /> Forgive
                      </button>
                    )}
                  </TD>
                )}
              </TR>
            );
          })}
        </TBody>
      </Table>
      {forgiving && <ForgiveModal penalty={forgiving} onClose={() => setForgiving(null)} />}
    </Card>
  );
}

function PenaltyPolicyCard() {
  return (
    <Card className="mt-4 border border-amber-500/20 bg-amber-500/5">
      <div className="flex gap-3 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="space-y-1.5 text-sm text-amber-300/80">
          <p className="font-semibold text-amber-300">Settlement Penalty Policy</p>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>Orders must be settled or returned within <b>72 hours</b> after stock is issued.</li>
            <li>After 72 hours, <b>TZS 10,000</b> is deducted daily from your commission.</li>
            <li>No penalty during warehouse return review.</li>
            <li>Penalties stop once everything is settled or returned.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

function RepView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: c, isLoading } = useQuery({ queryKey: ['commissions', 'me'], queryFn: async () => unwrap(await api.get('/commissions/me')).data });
  const { data: wd } = useQuery({ queryKey: ['commissions', 'withdrawals', 'mine'], queryFn: async () => unwrap(await api.get('/commissions/withdrawals', { params: { limit: 20 } })) });

  if (isLoading || !c) return <PageSpinner />;

  const hasPenalties = c.penalties > 0;
  const balanceNegative = c.available < 0;
  const canWithdraw = c.available >= c.rule.amountPerThreshold;

  return (
    <>
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${hasPenalties ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
        <StatCard
          label="Available Balance"
          value={formatCurrency(c.available)}
          icon={balanceNegative ? ShieldAlert : Wallet}
          tone={balanceNegative ? 'rose' : 'emerald'}
          hint={balanceNegative ? 'Penalty debt — settle overdue orders' : 'Ready to withdraw'}
        />
        <StatCard label="Total Earned" value={formatCurrency(c.earned)} icon={Coins} tone="violet" hint={`${formatNumber(c.boxesSettled)} boxes × ${formatCurrency(c.rule.perBox)}`} />
        <StatCard label="Total Paid Out" value={formatCurrency(c.paid)} icon={TrendingUp} tone="brand" />
        <StatCard label="Pending Requests" value={formatCurrency(c.pendingRequests)} icon={Clock} tone="amber" hint="Awaiting approval" />
        {hasPenalties && (
          <StatCard label="Total Penalties" value={formatCurrency(c.penalties)} icon={AlertTriangle} tone="rose" hint="Deducted from balance" />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        {balanceNegative ? (
          <p className="text-sm text-rose-400">
            Your balance is negative due to overdue penalties. Settle your outstanding orders to restore your balance before withdrawing.
          </p>
        ) : !canWithdraw ? (
          <p className="text-sm text-amber-400">
            Minimum withdrawal is {formatCurrency(c.rule.amountPerThreshold)} — keep settling boxes to reach it.
          </p>
        ) : null}
        <div className="ml-auto">
          <Button onClick={() => setOpen(true)} disabled={!canWithdraw}>
            <Coins className="h-4 w-4" /> Request withdrawal
          </Button>
        </div>
      </div>

      {hasPenalties && <PenaltyBreakdown breakdown={c.penaltyBreakdown} />}

      <Card className="mt-4">
        <CardHeader title="My withdrawal requests" subtitle={`Rule: ${formatCurrency(c.rule.amountPerThreshold)} per ${c.rule.boxThreshold} boxes`} />
        {!wd?.data?.length ? <EmptyState title="No withdrawals yet" /> : (
          <Table>
            <THead><TR><TH>Amount</TH><TH>Status</TH><TH>Requested</TH></TR></THead>
            <TBody>{wd.data.map((w) => (
              <TR key={w.id}><TD className="font-medium">{formatCurrency(w.amount)}</TD><TD><Badge className={WITHDRAWAL_STATUS_META[w.status]?.cls}>{WITHDRAWAL_STATUS_META[w.status]?.label}</Badge></TD><TD className="text-faint">{formatDateTime(w.requestedAt)}</TD></TR>
            ))}</TBody>
          </Table>
        )}
      </Card>

      <FinesHistory admin={false} />

      <PenaltyPolicyCard />

      {open && <WithdrawModal available={c.available} minWithdrawal={c.rule.amountPerThreshold} onClose={() => setOpen(false)} />}
    </>
  );
}

function AdminView() {
  const qc = useQueryClient();
  const { data: summary, isLoading } = useQuery({ queryKey: ['commissions', 'summary'], queryFn: async () => unwrap(await api.get('/commissions/summary')).data });
  const { data: wd } = useQuery({ queryKey: ['commissions', 'withdrawals', 'all'], queryFn: async () => unwrap(await api.get('/commissions/withdrawals', { params: { limit: 30 } })) });

  const applyPenalties = useMutation({
    mutationFn: () => api.post('/penalties/apply'),
    onSuccess: (res) => {
      const d = res.data?.data;
      toast.success(`${d?.penalties?.applied ?? 0} penalty deduction(s) applied`);
      qc.invalidateQueries({ queryKey: ['commissions'] });
      qc.invalidateQueries({ queryKey: ['penalties'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const decide = useMutation({
    mutationFn: ({ id, action }) => api.post(`/commissions/withdrawals/${id}/decide`, { action }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['commissions'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading || !summary) return <PageSpinner />;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total earned" value={formatCurrency(summary.totals.earned)} icon={Coins} tone="violet" />
        <StatCard label="Total paid" value={formatCurrency(summary.totals.paid)} icon={Wallet} tone="emerald" />
        <StatCard label="Total pending" value={formatCurrency(summary.totals.pending)} icon={Clock} tone="amber" />
        <StatCard label="Total penalties" value={formatCurrency(summary.totals.penalties)} icon={AlertTriangle} tone="rose" />
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" loading={applyPenalties.isPending} onClick={() => applyPenalties.mutate()}>
          <AlertTriangle className="h-4 w-4" /> Apply daily penalties
        </Button>
      </div>

      <Card className="mt-4">
        <CardHeader title="Commission by representative" />
        <Table>
          <THead>
            <TR>
              <TH>Rep</TH>
              <TH>Boxes settled</TH>
              <TH>Earned</TH>
              <TH>Penalties</TH>
              <TH>Paid</TH>
              <TH>Available</TH>
            </TR>
          </THead>
          <TBody>{summary.items.map((i) => (
            <TR key={i.salesRepId}>
              <TD className="font-medium">{i.name}</TD>
              <TD>{formatNumber(i.boxesSettled)}</TD>
              <TD>{formatCurrency(i.earned)}</TD>
              <TD className={i.penalties > 0 ? 'text-rose-400 font-semibold' : 'text-faint'}>
                {i.penalties > 0 ? `−${formatCurrency(i.penalties)}` : '—'}
              </TD>
              <TD>{formatCurrency(i.paid)}</TD>
              <TD className={i.available < 0 ? 'text-rose-400 font-semibold' : ''}>
                {formatCurrency(i.available)}
              </TD>
            </TR>
          ))}</TBody>
        </Table>
      </Card>

      <FinesHistory admin />

      <Card className="mt-6">
        <CardHeader title="Withdrawal requests" />
        {!wd?.data?.length ? <EmptyState title="No withdrawal requests" /> : (
          <Table>
            <THead><TR><TH>Rep</TH><TH>Amount</TH><TH>Status</TH><TH>Requested</TH><TH /></TR></THead>
            <TBody>{wd.data.map((w) => (
              <TR key={w.id}>
                <TD className="font-medium">{w.salesRep?.user?.name}</TD>
                <TD>{formatCurrency(w.amount)}</TD>
                <TD><Badge className={WITHDRAWAL_STATUS_META[w.status]?.cls}>{WITHDRAWAL_STATUS_META[w.status]?.label}</Badge></TD>
                <TD className="text-faint">{formatDateTime(w.requestedAt)}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    {w.status === 'PENDING' && <>
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => decide.mutate({ id: w.id, action: 'APPROVE' })}>Approve</Button>
                      <Button variant="ghost" className="px-2 py-1 text-xs text-rose-600" onClick={() => decide.mutate({ id: w.id, action: 'REJECT' })}>Reject</Button>
                    </>}
                    {w.status === 'APPROVED' && <Button className="px-2 py-1 text-xs" onClick={() => decide.mutate({ id: w.id, action: 'PAY' })}>Mark paid</Button>}
                  </div>
                </TD>
              </TR>
            ))}</TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

// Renders standalone (reps' own page) or embedded inside Finance (staff).
export default function Commissions({ embedded = false }) {
  const { user } = useAuth();
  const isRep = user?.role === ROLES.SALES_REP;
  return (
    <div>
      {!embedded && (
        <PageHeader title="Commissions" subtitle={isRep ? 'Your commission earnings and withdrawals.' : 'Commission performance and withdrawal approvals.'} />
      )}
      {isRep ? <RepView /> : <AdminView />}
    </div>
  );
}
