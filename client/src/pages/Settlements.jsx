import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Timer, AlertTriangle, Clock, CheckCircle2, Eye } from 'lucide-react';
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

export default function Settlements() {
  const { hasRole } = useAuth();
  const staff = hasRole(ROLES.WAREHOUSE_STAFF);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [viewing, setViewing] = useState(null);

  const { data: summary } = useQuery({
    queryKey: ['settlements', 'summary'],
    queryFn: async () => unwrap(await api.get('/settlements/summary')).data,
    enabled: staff,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['settlements', { page, status }],
    queryFn: async () => unwrap(await api.get('/settlements', { params: { page, limit: 15, status: status || undefined } })),
  });

  return (
    <div>
      <PageHeader title="Orders & Settlements" subtitle="Each approved order is a 72-hour contract — open one to settle boxes and record returns inside it." />

      {staff && summary && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Outstanding" value={summary.outstandingCount} icon={Timer} tone="brand" hint={formatCurrency(summary.outstandingValue)} />
          <StatCard label="Approaching deadline" value={summary.approachingCount} icon={Clock} tone="amber" hint="within 12 hours" />
          <StatCard label="Overdue (>72h)" value={summary.overdueCount} icon={AlertTriangle} tone="rose" hint={formatCurrency(summary.overdueValue)} />
          <StatCard label="Settled / total" value={`${data?.meta?.total ?? '—'}`} icon={CheckCircle2} tone="emerald" />
        </div>
      )}

      <Card>
        <div className="border-b border-border p-4">
          <select className="input sm:w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {Object.entries(SETTLEMENT_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {isLoading ? <PageSpinner /> : !data?.data?.length ? (
          <EmptyState title="No orders yet" message="Orders open automatically when stock is issued to a rep." icon={Timer} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Order</TH><TH>Rep</TH><TH>Value</TH><TH>Settled</TH><TH>Balance</TH><TH>Deadline</TH><TH>Status</TH><TH /></TR></THead>
              <TBody>
                {data.data.map((s) => (
                  <TR key={s.id} className="cursor-pointer" onClick={() => setViewing(s.id)}>
                    <TD className="font-medium">{s.settlementNumber}</TD>
                    <TD>{s.salesRep?.user?.name}</TD>
                    <TD>{formatCurrency(s.assignedValue)}</TD>
                    <TD className="text-emerald-500">{formatCurrency(s.paid)}</TD>
                    <TD className={s.balance > 0 ? 'font-semibold text-rose-500' : 'text-faint'}>{formatCurrency(s.balance)}</TD>
                    <TD>
                      <div className="text-muted">{formatDateTime(s.deadlineAt)}</div>
                      <div className={`text-xs ${s.hoursRemaining < 0 ? 'text-rose-500' : s.approaching ? 'text-amber-500' : 'text-faint'}`}>{hoursLabel(s.hoursRemaining)}</div>
                    </TD>
                    <TD><Badge className={SETTLEMENT_STATUS_META[s.status]?.cls}>{SETTLEMENT_STATUS_META[s.status]?.label}</Badge></TD>
                    <TD>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">Open <Eye className="h-3.5 w-3.5" /></span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </>
        )}
      </Card>

      {viewing && <OrderDetailModal settlementId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
