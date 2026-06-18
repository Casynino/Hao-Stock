import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Coins, Wallet, Clock, TrendingUp } from 'lucide-react';
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

function RepView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: c, isLoading } = useQuery({ queryKey: ['commissions', 'me'], queryFn: async () => unwrap(await api.get('/commissions/me')).data });
  const { data: wd } = useQuery({ queryKey: ['commissions', 'withdrawals', 'mine'], queryFn: async () => unwrap(await api.get('/commissions/withdrawals', { params: { limit: 20 } })) });

  if (isLoading || !c) return <PageSpinner />;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available Balance" value={formatCurrency(c.available)} icon={Wallet} tone="emerald" hint="Ready to withdraw" />
        <StatCard label="Total Earned" value={formatCurrency(c.earned)} icon={Coins} tone="violet" hint={`${formatNumber(c.boxesSettled)} boxes × ${formatCurrency(c.rule.perBox)}`} />
        <StatCard label="Total Paid Out" value={formatCurrency(c.paid)} icon={TrendingUp} tone="brand" />
        <StatCard label="Pending Requests" value={formatCurrency(c.pendingRequests)} icon={Clock} tone="amber" hint="Awaiting approval" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        {c.available < c.rule.amountPerThreshold && (
          <p className="text-sm text-amber-400">
            Minimum withdrawal is {formatCurrency(c.rule.amountPerThreshold)} — keep settling boxes to reach it.
          </p>
        )}
        <div className="ml-auto">
          <Button onClick={() => setOpen(true)} disabled={c.available < c.rule.amountPerThreshold}>
            <Coins className="h-4 w-4" /> Request withdrawal
          </Button>
        </div>
      </div>
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
      {open && <WithdrawModal available={c.available} minWithdrawal={c.rule.amountPerThreshold} onClose={() => setOpen(false)} />}
    </>
  );
}

function AdminView() {
  const qc = useQueryClient();
  const { data: summary, isLoading } = useQuery({ queryKey: ['commissions', 'summary'], queryFn: async () => unwrap(await api.get('/commissions/summary')).data });
  const { data: wd } = useQuery({ queryKey: ['commissions', 'withdrawals', 'all'], queryFn: async () => unwrap(await api.get('/commissions/withdrawals', { params: { limit: 30 } })) });

  const decide = useMutation({
    mutationFn: ({ id, action }) => api.post(`/commissions/withdrawals/${id}/decide`, { action }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['commissions'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading || !summary) return <PageSpinner />;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total earned" value={formatCurrency(summary.totals.earned)} icon={Coins} tone="violet" />
        <StatCard label="Total paid" value={formatCurrency(summary.totals.paid)} icon={Wallet} tone="emerald" />
        <StatCard label="Total pending" value={formatCurrency(summary.totals.pending)} icon={Clock} tone="amber" />
      </div>

      <Card className="mt-6">
        <CardHeader title="Commission by representative" />
        <Table>
          <THead><TR><TH>Rep</TH><TH>Boxes settled</TH><TH>Earned</TH><TH>Paid</TH><TH>Pending</TH></TR></THead>
          <TBody>{summary.items.map((i) => (
            <TR key={i.salesRepId}><TD className="font-medium">{i.name}</TD><TD>{formatNumber(i.boxesSettled)}</TD><TD>{formatCurrency(i.earned)}</TD><TD>{formatCurrency(i.paid)}</TD><TD className="text-amber-700">{formatCurrency(i.pending)}</TD></TR>
          ))}</TBody>
        </Table>
      </Card>

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

export default function Commissions() {
  const { user } = useAuth();
  const isRep = user?.role === ROLES.SALES_REP;
  return (
    <div>
      <PageHeader title="Commissions" subtitle={isRep ? 'Your commission earnings and withdrawals.' : 'Commission performance and withdrawal approvals.'} />
      {isRep ? <RepView /> : <AdminView />}
    </div>
  );
}
