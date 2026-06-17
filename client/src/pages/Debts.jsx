import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { HandCoins, AlertTriangle, Wallet, Banknote } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { CREDIT_STATUS_META } from '@/lib/constants';
import {
  PageHeader, Card, CardHeader, StatCard, PageSpinner, EmptyState, Badge, Button, Modal, Field, Input, Select,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

function PaymentModal({ credit, onClose }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');

  const pay = useMutation({
    mutationFn: () => api.post(`/credit/${credit.id}/payments`, { amount: Number(amount), method, reference: reference || null }),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['credit'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} title={`Record payment · ${credit.customer?.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={pay.isPending} disabled={!amount || Number(amount) <= 0} onClick={() => pay.mutate()}>Record</Button></>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-elevated p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Outstanding</span><b className="text-rose-600">{formatCurrency(credit.balance)}</b></div>
          <div className="flex justify-between"><span className="text-muted">Due</span><span>{formatDate(credit.dueDate)}</span></div>
        </div>
        <Field label="Amount" required hint={`Max ${formatCurrency(credit.balance)}`}>
          <Input type="number" min="0" max={credit.balance} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="BANK">Bank</option><option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. M-Pesa code" /></Field>
        </div>
      </div>
    </Modal>
  );
}

export default function Debts() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('outstanding'); // outstanding | overdue | all
  const [paying, setPaying] = useState(null);

  const { data: summary } = useQuery({ queryKey: ['credit-summary'], queryFn: async () => unwrap(await api.get('/credit/summary')).data });

  const params = { page, limit: 15 };
  if (filter === 'overdue') params.overdue = true;
  else if (filter === 'outstanding') params.outstanding = true;

  const { data, isLoading } = useQuery({
    queryKey: ['credit', { page, filter }],
    queryFn: async () => unwrap(await api.get('/credit', { params })),
  });

  return (
    <div>
      <PageHeader title="Debts" subtitle="Outstanding receivables, overdue accounts and collections." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total outstanding" value={formatCurrency(summary?.totalOutstanding || 0)} icon={HandCoins} tone="rose" hint={`${summary?.openAccounts || 0} accounts`} />
        <StatCard label="Overdue" value={formatCurrency(summary?.overdueAmount || 0)} icon={AlertTriangle} tone="rose" hint={`${summary?.overdueAccounts || 0} accounts`} />
        <StatCard label="Collected (lifetime)" value={formatCurrency(summary?.totalCollected || 0)} icon={Wallet} tone="emerald" />
        <StatCard label="Principal lent" value={formatCurrency(summary?.totalPrincipal || 0)} icon={Banknote} tone="slate" />
      </div>

      {summary?.topDebtors?.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Top debtors" />
          <Table>
            <THead><TR><TH>Customer</TH><TH>Phone</TH><TH>Region</TH><TH>Outstanding</TH></TR></THead>
            <TBody>{summary.topDebtors.map((d) => (
              <TR key={d.customerId}><TD className="font-medium">{d.name}</TD><TD>{d.phone || '—'}</TD><TD>{d.region || '—'}</TD><TD className="font-semibold text-rose-600">{formatCurrency(d.outstanding)}</TD></TR>
            ))}</TBody>
          </Table>
        </Card>
      )}

      <Card className="mt-6">
        <div className="flex items-center gap-2 border-b border-border p-4">
          {[['outstanding', 'Outstanding'], ['overdue', 'Overdue'], ['all', 'All']].map(([k, label]) => (
            <button key={k} onClick={() => { setFilter(k); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === k ? 'bg-brand-600 text-slate-950' : 'text-muted hover:bg-elevated'}`}>{label}</button>
          ))}
        </div>
        {isLoading ? <PageSpinner /> : !data?.data?.length ? (
          <EmptyState title="No debts here" message="Nothing outstanding for this filter." />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Customer</TH><TH>Sale</TH><TH>Principal</TH><TH>Balance</TH><TH>Due</TH><TH>Overdue</TH><TH>Status</TH><TH /></TR></THead>
              <TBody>
                {data.data.map((c) => {
                  const meta = CREDIT_STATUS_META[c.status] || {};
                  return (
                    <TR key={c.id}>
                      <TD className="font-medium text-foreground">{c.customer?.name}</TD>
                      <TD>{c.sale?.saleNumber}</TD>
                      <TD>{formatCurrency(c.principal)}</TD>
                      <TD className="font-semibold text-rose-600">{formatCurrency(c.balance)}</TD>
                      <TD>{formatDate(c.dueDate)}</TD>
                      <TD>{c.daysOverdue > 0 ? <Badge className="bg-rose-100 text-rose-700">{c.daysOverdue}d</Badge> : '—'}</TD>
                      <TD><Badge className={meta.cls}>{meta.label}</Badge></TD>
                      <TD>{c.balance > 0 && <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setPaying(c)}>Record payment</Button>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </>
        )}
      </Card>

      {paying && <PaymentModal credit={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
