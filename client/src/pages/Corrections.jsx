import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Flag, CheckCircle2, XCircle } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ROLES, CORRECTION_STATUS_META } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import OrderDetailModal from '@/components/OrderDetail';
import {
  PageHeader, Card, PageSpinner, EmptyState, Badge, Pagination,
  Table, THead, TBody, TR, TH, TD, Modal, Button, Field,
} from '@/components/ui';

function ResolveModal({ item, onClose, onDone }) {
  const [resolution, setResolution] = useState('');
  const act = useMutation({
    mutationFn: (status) => api.post(`/corrections/${item.id}/resolve`, { status, resolution }),
    onSuccess: () => { toast.success('Correction updated'); onDone(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Modal open onClose={onClose} title="Resolve correction request"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="ghost" className="text-muted" loading={act.isPending} onClick={() => act.mutate('DISMISSED')}><XCircle className="h-4 w-4" /> Dismiss</Button>
        <Button loading={act.isPending} onClick={() => act.mutate('RESOLVED')}><CheckCircle2 className="h-4 w-4" /> Mark resolved</Button>
      </>}>
      <div className="space-y-3">
        <div className="rounded-lg bg-elevated p-3 text-sm">
          <div className="text-xs text-faint">{item.salesRep?.user?.name} · {item.settlement?.settlementNumber || 'No order'}</div>
          <p className="mt-1 text-foreground">{item.message}</p>
        </div>
        <p className="text-xs text-faint">Make the actual fix with the admin tools first (e.g. cancel a settlement's sale), then note what you did. This is logged to the audit trail.</p>
        <Field label="Resolution note">
          <textarea className="input min-h-[90px]" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What did you do to fix it?" />
        </Field>
      </div>
    </Modal>
  );
}

export default function Corrections() {
  const { hasRole } = useAuth();
  const staff = hasRole(ROLES.WAREHOUSE_STAFF);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [resolving, setResolving] = useState(null);
  const [viewing, setViewing] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['corrections', { page, status }],
    queryFn: async () => unwrap(await api.get('/corrections', { params: { page, limit: 20, status: status || undefined } })),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['corrections'] });

  return (
    <div>
      <PageHeader
        title="Corrections"
        subtitle={staff ? 'Requests from reps to fix a settlement or return. Resolve after correcting with the admin tools.' : "Issues you've flagged for an admin to correct."}
      />
      <Card>
        <div className="border-b border-border p-4">
          <select className="input sm:w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {Object.entries(CORRECTION_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {isLoading ? <PageSpinner /> : !data?.data?.length ? (
          <EmptyState title="No correction requests" message={staff ? 'When a rep flags an issue on an order it appears here.' : 'Open an order and use "Flag issue" to request a correction.'} icon={Flag} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Raised</TH><TH>Rep</TH><TH>Order</TH><TH>Issue</TH><TH>Status</TH><TH /></TR></THead>
              <TBody>
                {data.data.map((c) => (
                  <TR key={c.id}>
                    <TD className="whitespace-nowrap text-faint">{formatDateTime(c.createdAt)}</TD>
                    <TD>{c.salesRep?.user?.name || '—'}</TD>
                    <TD>{c.settlement ? <button className="font-medium text-brand-600 hover:underline" onClick={() => setViewing(c.settlement.id)}>{c.settlement.settlementNumber}</button> : '—'}</TD>
                    <TD className="max-w-md">
                      <div className="truncate" title={c.message}>{c.message}</div>
                      {c.resolution && <div className="text-xs text-faint">Admin: {c.resolution}</div>}
                    </TD>
                    <TD><Badge className={CORRECTION_STATUS_META[c.status]?.cls}>{CORRECTION_STATUS_META[c.status]?.label}</Badge></TD>
                    <TD>{staff && c.status === 'PENDING' && <Button variant="ghost" onClick={() => setResolving(c)}>Resolve</Button>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </>
        )}
      </Card>

      {resolving && <ResolveModal item={resolving} onClose={() => setResolving(null)} onDone={refresh} />}
      {viewing && <OrderDetailModal settlementId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
