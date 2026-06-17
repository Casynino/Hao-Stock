import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, ClipboardList, Eye } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/lib/hooks';
import { ROLES, REQUEST_STATUS_META } from '@/lib/constants';
import { formatDateTime, formatCurrency } from '@/lib/format';
import ItemLines from '@/components/ItemLines';
import {
  PageHeader, Card, PageSpinner, EmptyState, Badge, Button, Modal, Field, Textarea, Input,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

function NewRequestModal({ onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState('');

  // Live order total (price auto-filled per unit; rep can't edit price).
  const total = useMemo(
    () => items.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0), 0),
    [items],
  );

  const create = useMutation({
    mutationFn: () => api.post('/stock-requests', {
      items: items.filter((l) => l.productId && l.quantity > 0).map((l) => ({ productId: l.productId, packagingUnitId: l.packagingUnitId, quantity: Number(l.quantity) })),
      notes: notes || undefined,
    }),
    onSuccess: () => { toast.success('Order submitted for approval'); qc.invalidateQueries({ queryKey: ['stock-requests'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Build your order"
      footer={
        <>
          <div className="mr-auto">
            <div className="text-xs text-muted">Order total</div>
            <div className="text-lg font-bold text-foreground">{formatCurrency(total)}</div>
          </div>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} disabled={!items.some((l) => l.productId && l.quantity > 0)} onClick={() => create.mutate()}>
            Submit for approval
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ItemLines products={products} value={items} onChange={setItems} showPrice priceReadOnly />
        <div className="flex items-center justify-between rounded-xl bg-elevated px-4 py-3">
          <span className="text-sm font-medium text-muted">Total order value</span>
          <span className="text-xl font-bold text-foreground">{formatCurrency(total)}</span>
        </div>
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. restock for the week" /></Field>
      </div>
    </Modal>
  );
}

function OrderDetailModal({ request, isRep, staff, onClose }) {
  const qc = useQueryClient();
  const pending = request.status === 'PENDING';
  const editable = staff && pending; // admin/warehouse can edit + decide a pending order
  const [qtys, setQtys] = useState(() =>
    Object.fromEntries(request.items.map((i) => [i.id, i.quantityApproved ?? i.quantityRequested])),
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['stock-requests'] });
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const approve = useMutation({
    mutationFn: () => api.post(`/stock-requests/${request.id}/approve`, {
      approvals: request.items.map((i) => ({ itemId: i.id, quantityApproved: Number(qtys[i.id]) || 0 })),
    }),
    onSuccess: () => { toast.success('Approved — stock issued & order opened'); invalidate(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/stock-requests/${request.id}/reject`, {}),
    onSuccess: () => { toast.success('Order rejected'); invalidate(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/stock-requests/${request.id}/cancel`, {}),
    onSuccess: () => { toast.success('Order cancelled'); invalidate(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const approvedTotal = request.items.reduce((s, i) => s + (Number(qtys[i.id]) || 0) * Number(i.unitPrice || 0), 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Order ${request.requestNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {editable && <Button variant="ghost" className="text-rose-500" loading={reject.isPending} onClick={() => reject.mutate()}>Reject</Button>}
          {editable && <Button loading={approve.isPending} onClick={() => approve.mutate()}>Approve &amp; issue</Button>}
          {isRep && pending && <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel order</Button>}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><div className="text-xs text-faint">Rep</div><div className="font-medium">{request.salesRep?.user?.name}</div></div>
          <div><div className="text-xs text-faint">Status</div><Badge className={REQUEST_STATUS_META[request.status]?.cls}>{REQUEST_STATUS_META[request.status]?.label}</Badge></div>
          <div><div className="text-xs text-faint">Requested</div><div className="font-medium">{formatDateTime(request.requestedAt)}</div></div>
          <div><div className="text-xs text-faint">Lines</div><div className="font-medium">{request.items.length}</div></div>
        </div>

        <Table>
          <THead><TR><TH>Product</TH><TH>Requested</TH>{editable && <TH>Approve qty</TH>}<TH>Unit price</TH><TH>Line total</TH></TR></THead>
          <TBody>
            {request.items.map((i) => (
              <TR key={i.id}>
                <TD className="font-medium text-foreground">{i.product.name}</TD>
                <TD>{i.quantityRequested} {i.packagingUnit.name}</TD>
                {editable && (
                  <TD>
                    <Input type="number" min="0" value={qtys[i.id]} onChange={(e) => setQtys({ ...qtys, [i.id]: e.target.value })} className="w-20" />
                  </TD>
                )}
                <TD>{formatCurrency(i.unitPrice)}</TD>
                <TD>{formatCurrency(editable ? (Number(qtys[i.id]) || 0) * Number(i.unitPrice || 0) : i.lineTotal)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>

        <div className="flex items-center justify-between rounded-xl bg-elevated px-4 py-3">
          <span className="text-sm font-medium text-muted">{editable ? 'Approved order value' : 'Order value'}</span>
          <span className="text-xl font-bold text-foreground">{formatCurrency(editable ? approvedTotal : request.totalValue)}</span>
        </div>

        {request.notes && <div className="text-sm"><span className="text-faint">Notes: </span>{request.notes}</div>}
        {editable && <p className="text-xs text-faint">Approving issues the stock to the rep and opens a 72-hour payment order. Set a line to 0 to drop it.</p>}
      </div>
    </Modal>
  );
}

export default function StockRequests() {
  const { hasRole, user } = useAuth();
  const isRep = user?.role === ROLES.SALES_REP;
  const staff = hasRole(ROLES.WAREHOUSE_STAFF);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [viewing, setViewing] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-requests', { page, status }],
    queryFn: async () => unwrap(await api.get('/stock-requests', { params: { page, limit: 15, status: status || undefined } })),
  });

  return (
    <div>
      <PageHeader title="Stock Requests" subtitle={isRep ? 'Request stock from the warehouse — no paper needed.' : 'Approve or reject reps’ stock requests.'}>
        {isRep && <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New request</Button>}
      </PageHeader>

      <Card>
        <div className="border-b border-border p-4">
          <select className="input sm:w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {Object.entries(REQUEST_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {isLoading ? <PageSpinner /> : !data?.data?.length ? (
          <EmptyState title="No stock requests" icon={ClipboardList} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Order</TH>{staff && <TH>Rep</TH>}<TH>Items</TH><TH>Value</TH><TH>Status</TH><TH>Requested</TH><TH /></TR></THead>
              <TBody>
                {data.data.map((r) => (
                  <TR key={r.id} className="cursor-pointer" onClick={() => setViewing(r)}>
                    <TD className="font-medium">{r.requestNumber}</TD>
                    {staff && <TD>{r.salesRep?.user?.name}</TD>}
                    <TD>{r.items.length} line(s)</TD>
                    <TD className="font-medium">{formatCurrency(r.totalValue)}</TD>
                    <TD><Badge className={REQUEST_STATUS_META[r.status]?.cls}>{REQUEST_STATUS_META[r.status]?.label}</Badge></TD>
                    <TD className="text-faint">{formatDateTime(r.requestedAt)}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                        {staff && r.status === 'PENDING' ? 'Review' : 'View'} <Eye className="h-3.5 w-3.5" />
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

      {newOpen && <NewRequestModal onClose={() => setNewOpen(false)} />}
      {viewing && <OrderDetailModal request={viewing} isRep={isRep} staff={staff} onClose={() => setViewing(null)} />}
    </div>
  );
}
